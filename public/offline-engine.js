/* Durable local activity journal. No tokens or cookies are written to storage. */
(function (root) {
  'use strict';
  const CORE = new Set(['feed-log', 'diaper-log', 'sleep-log', 'pump-log', 'note']);
  const REFERENCES = new Set(['baby', 'settings', 'caretaker', 'units', 'food', 'medicine', 'sleep-location', 'deployment-config']);
  const ENDPOINT = /^\/api\/([^/]+)(?:\/(last))?$/;
  const iso = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toISOString(); };
  const eventTime = row => new Date(row.startTime || row.time || row.date || row.createdAt || 0).getTime();
  function canonicalKey(value, origin) {
    const url = new URL(value, origin);
    for (const key of ['_t', '_', 't', 'timestamp', 'cacheBust']) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.pathname + url.search;
  }
  function rowMatches(row, kind) {
    if (!row || typeof row !== 'object') return false;
    if (kind === 'feed-log') return ['BREAST', 'BOTTLE', 'SOLIDS'].includes(row.type);
    if (kind === 'diaper-log') return ['WET', 'DIRTY', 'BOTH', 'DRY'].includes(row.type);
    if (kind === 'sleep-log') return ['NAP', 'NIGHT_SLEEP'].includes(row.type);
    if (kind === 'pump-log') return 'leftAmount' in row || 'rightAmount' in row || 'pumpAction' in row;
    if (kind === 'note') return 'content' in row;
    return true;
  }
  function optimistic(operation, previous) {
    const row = { ...(previous || {}), ...operation.body, id: operation.recordId,
      babyId: operation.body.babyId || previous?.babyId, familyId: operation.familyId,
      caretakerId: previous?.caretakerId || operation.caretakerId || null,
      createdAt: previous?.createdAt || operation.createdAt, updatedAt: operation.createdAt,
      deletedAt: operation.method === 'DELETE' ? operation.createdAt : null,
      _offline: true, _offlineRequestId: operation.requestId };
    for (const field of ['time', 'startTime', 'endTime', 'date']) if (row[field]) row[field] = iso(row[field]);
    if (operation.kind === 'pump-log') {
      row.leftAmount = row.leftAmount ?? null; row.rightAmount = row.rightAmount ?? null;
      row.unitAbbr = row.unitAbbr || row.unit || 'OZ'; row.unit = row.unitAbbr.toLowerCase();
    }
    if (operation.kind === 'sleep-log') row.endTime = row.endTime || null;
    if (operation.kind === 'note') row.category = row.category || null;
    return row;
  }
  function overlayRows(rows, operations, kind, url) {
    const records = new Map(rows.filter(Boolean).map(row => [row.id, { ...row }]));
    for (const operation of operations) {
      if (kind !== 'timeline' && operation.kind !== kind) continue;
      const existing = records.get(operation.recordId);
      if (operation.method === 'DELETE') records.delete(operation.recordId);
      else if (operation.method === 'POST' || existing) records.set(operation.recordId, optimistic(operation, existing));
    }
    return [...records.values()].filter(row => {
      if (row.deletedAt) return false;
      if (url.searchParams.get('babyId') && row.babyId !== url.searchParams.get('babyId')) return false;
      if (url.searchParams.get('type') && row.type !== url.searchParams.get('type')) return false;
      const time = eventTime(row);
      const start = url.searchParams.get('startDate'); const end = url.searchParams.get('endDate');
      if (start && end && (time < new Date(start).getTime() || time > new Date(end).getTime())) return false;
      return kind === 'timeline' || rowMatches(row, kind);
    }).sort((a, b) => eventTime(b) - eventTime(a));
  }
  function createEngine(options) {
    const origin = options.origin;
    const net = options.fetch;
    async function bounded(request, timeout = options.timeoutMs || 2000) {
      const abort = new AbortController(); let timer;
      try {
        return await Promise.race([
          net(new Request(request, { signal: abort.signal })),
          new Promise((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error('Network unavailable')); }, timeout); }),
        ]);
      } finally { clearTimeout(timer); }
    }
    const sessions = new Map();
    let active = null; let state = 'ready'; let error = null;
    let singleFlight = null; let mutationFlight = Promise.resolve(); let epoch = 0;
    let dbPromise;
    const open = () => dbPromise || (dbPromise = new Promise((resolve, reject) => {
      const request = options.indexedDB.open('sprout-offline-v1', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
        db.createObjectStore('snapshots', { keyPath: 'key' });
        db.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    }));
    async function storage(store, action, value) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, action === 'getAll' || action === 'get' ? 'readonly' : 'readwrite');
        const request = tx.objectStore(store)[action](value);
        let result; request.onsuccess = () => { result = request.result; };
        tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Local storage write aborted'));
      });
    }
    const queue = async familyId => (await storage('outbox', 'getAll')).filter(item => item.familyId === familyId);
    async function restore() { if (!active) active = (await storage('meta', 'get', 'active'))?.value || null; return active; }
    async function status(clientId) {
      await restore();
      const scope = sessions.get(clientId) || active;
      const pending = scope ? (await queue(scope.familyId)).length : 0;
      return { type: 'OFFLINE_STATUS', familyId: scope?.familyId || null, pending, status: state, error };
    }
    async function broadcast() { const current = await status(); options.broadcast?.(current); return current; }
    function decode(token) {
      try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; }
    }
    async function session(data, clientId) {
      if (!data.familyId || !data.familySlug) return broadcast();
      const startEpoch = epoch;
      const payload = decode(data.token || '');
      if (payload.familyId !== data.familyId || payload.familySlug !== data.familySlug || typeof payload.exp !== 'number') return pause(clientId);
      const bytes = new TextEncoder().encode(data.token || '');
      const fingerprint = Array.from(new Uint8Array(await options.crypto.subtle.digest('SHA-256', bytes))).map(byte => byte.toString(16).padStart(2, '0')).join('');
      await restore();
      if (epoch !== startEpoch) return broadcast();
      if (!(active?.familyId === data.familyId && active?.familySlug === data.familySlug && active?.fingerprint === fingerprint)) {
        try {
          const verified = await bounded(new Request(origin + '/api/settings', { headers: { Authorization: 'Bearer ' + data.token } }));
          const result = await verified.json();
          if (!verified.ok || result?.success !== true || result.data?.familyId !== data.familyId) return pause(clientId);
        } catch { return pause(clientId); }
      }
      if (epoch !== startEpoch) return broadcast();
      active = { familyId: data.familyId, familySlug: data.familySlug, fingerprint };
      const existing = sessions.get(clientId);
      if (!existing || existing.token !== data.token || existing.familyId !== data.familyId) sessions.set(clientId, { ...active, token: data.token || '', caretakerId: payload.caretakerId || payload.id });
      await storage('meta', 'put', { key: 'active', value: active });
      state = 'ready'; error = null; return broadcast();
    }
    async function pause(clientId) { epoch++; sessions.delete(clientId); state = 'auth-required'; error = 'Sign in to sync saved changes.'; return broadcast(); }
    async function clear() {
      epoch++; sessions.clear(); active = null;
      await storage('meta', 'delete', 'active');
      for (const name of await options.caches.keys()) if (name.startsWith('sprout-private-')) await options.caches.delete(name);
      await storage('snapshots', 'clear');
      state = 'auth-required'; error = null;
      // The family-bound journal survives logout; only same-family reauth can access it.
      return broadcast();
    }
    async function scopeFor(context) {
      const current = sessions.get(context.clientId);
      if (current) return current;
      await restore();
      if (active && context.clientUrl) {
        const path = new URL(context.clientUrl, origin).pathname;
        if (path === '/' + active.familySlug || path.startsWith('/' + active.familySlug + '/')) return active;
      }
      return null;
    }
    const response = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...extra } });
    async function applyToSnapshots(operation, serverRow) {
      const startEpoch = epoch;
      for (const snapshot of await storage('snapshots', 'getAll')) {
        if (snapshot.familyId !== operation.familyId || !(snapshot.kind === 'timeline' || snapshot.kind === operation.kind)) continue;
        const isArray = Array.isArray(snapshot.body.data);
        const detailId = new URL(snapshot.url, origin).searchParams.get('id');
        if (detailId && detailId !== operation.recordId) continue;
        if (new URL(snapshot.url, origin).searchParams.has('categories')) continue;
        let rows = isArray ? snapshot.body.data : snapshot.body.data ? [snapshot.body.data] : [];
        rows = rows.filter(row => row.id !== operation.recordId);
        if (serverRow && operation.method !== 'DELETE') rows.push(serverRow);
        const sorted = overlayRows(rows, [], snapshot.kind, new URL(snapshot.url, origin));
        snapshot.body.data = isArray ? sorted : sorted[0] || null;
        if (epoch !== startEpoch) return;
        await storage('snapshots', 'put', snapshot);
      }
    }
    async function replay(clientId) {
      if (singleFlight) return singleFlight;
      singleFlight = (async () => {
        const current = sessions.get(clientId);
        if (!current?.token || (decode(current.token).exp || 0) * 1000 <= Date.now()) { await pause(clientId); return new Map(); }
        const results = new Map(); state = 'syncing'; error = null; await broadcast();
        const startEpoch = epoch;
        for (const queued of await queue(current.familyId)) {
          const operation = await storage('outbox', 'get', queued.seq);
          if (!operation) continue;
          if (epoch !== startEpoch || sessions.get(clientId) !== current) break;
          let result;
          if (operation.method !== 'POST' && !operation.baseVersion) {
            operation.blocked = 409; await storage('outbox', 'put', operation);
            state = 'conflict'; error = 'Connect and reload this record before syncing its edit.'; break;
          }
          try {
            result = await bounded(new Request(new URL(operation.url, origin), {
              method: operation.method, credentials: 'include',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + current.token, 'X-Offline-Request-Id': operation.requestId,
                ...(operation.baseVersion ? { 'X-Offline-Base-Version': operation.baseVersion } : {}) },
              ...(operation.method === 'DELETE' ? {} : { body: JSON.stringify(operation.body) }),
            }), options.timeoutMs || 4000);
          } catch { state = 'offline'; error = null; break; }
          if (epoch !== startEpoch || sessions.get(clientId) !== current) break;
          let body; try { body = await result.clone().json(); } catch { body = null; }
          results.set(operation.requestId, result);
          if (!result.ok || body?.success !== true) {
            operation.blocked = result.status; await storage('outbox', 'put', operation);
            state = result.status === 401 || result.status === 403 ? 'auth-required' : [409, 410].includes(result.status) ? 'conflict' : 'error';
            error = body?.error || 'A saved change could not be synced. Review it before retrying.';
            if (state === 'auth-required') sessions.delete(clientId);
            break;
          }
          await applyToSnapshots(operation, body.data);
          const newer = (await queue(current.familyId)).filter(item => item.seq > operation.seq && item.recordId === operation.recordId);
          for (const dependent of newer) {
            if (operation.method === 'POST' && result.headers.get('X-Offline-Replay') === 'true' && body.data?.updatedAt !== body.data?.createdAt) {
              dependent.baseVersion = null;
              dependent.blocked = 409;
            } else if (body.data?.updatedAt) dependent.baseVersion = body.data.updatedAt;
            await storage('outbox', 'put', dependent);
          }
          await storage('outbox', 'delete', operation.seq);
        }
        if (state === 'syncing') state = 'ready';
        await broadcast(); return results;
      })().finally(() => { singleFlight = null; });
      return singleFlight;
    }
    async function mutate(request, context, current, kind) {
      const url = new URL(request.url);
      let body = {}; if (request.method !== 'DELETE') {
        try { body = await request.clone().json(); } catch { return null; }
      }
      const requestId = options.crypto.randomUUID();
      const recordId = request.method === 'POST' ? requestId : url.searchParams.get('id') || body.id;
      if (!recordId) return null;
      const previousQueue = await queue(current.familyId);
      const all = await storage('snapshots', 'getAll');
      const previous = all.filter(item => item.familyId === current.familyId).flatMap(item => Array.isArray(item.body.data) ? item.body.data : item.body.data ? [item.body.data] : []).find(row => row.id === recordId);
      const dependency = previousQueue.find(item => item.recordId === recordId);
      if (request.method !== 'POST' && !previous?.updatedAt && !dependency) return response({ success: false, error: 'Connect and reload this record before editing it offline.' }, 503);
      const operation = { familyId: current.familyId, kind, requestId, recordId, method: request.method,
        url: url.pathname + url.search, body, caretakerId: current.caretakerId || null,
        createdAt: new Date().toISOString(), blocked: null, baseVersion: dependency ? null : previous?.updatedAt || null };
      try { operation.seq = await storage('outbox', 'add', operation); }
      catch { return response({ success: false, error: 'Your device could not save this change. Free storage space and try again.' }, 507); }
      await broadcast();
      // FIFO: don't send a newer edit before earlier creates/edits are confirmed.
      if (!previousQueue.length && sessions.get(context.clientId)?.token) {
        const results = await replay(context.clientId);
        if (results.has(requestId)) return results.get(requestId);
      }
      state = state === 'ready' ? 'offline' : state; await broadcast();
      return response({ success: true, data: request.method === 'DELETE' ? undefined : optimistic(operation, previous), offline: { savedLocally: true, pending: true, requestId } }, 202, { 'X-Sprout-Offline': 'queued' });
    }
    async function get(request, current, kind, isLast) {
      const url = new URL(request.url); const key = current.familyId + '|' + canonicalKey(url.href, origin);
      const startEpoch = epoch;
      let body; let cached = false;
      try {
        const result = await bounded(request);
        if (epoch !== startEpoch) return response({ success: false, error: 'Session changed. Sign in again.' }, 401);
        if ([401, 403].includes(result.status)) {
          epoch++; sessions.clear(); active = null; await storage('meta', 'delete', 'active');
          state = 'auth-required'; error = 'Sign in to access your saved family data.'; await broadcast();
          return result;
        }
        if (!result.ok) return result;
        body = await result.clone().json();
        if (body?.success !== true) return result;
        const rows = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];
        if (rows.some(row => row.familyId && row.familyId !== current.familyId)) return result;
        if (epoch !== startEpoch) return response({ success: false, error: 'Session changed. Sign in again.' }, 401);
        await storage('snapshots', 'put', { key, familyId: current.familyId, kind, url: url.href, body, fetchedAt: new Date().toISOString() });
      } catch {
        if (epoch !== startEpoch) return response({ success: false, error: 'Session changed. Sign in again.' }, 401);
        const snapshot = await storage('snapshots', 'get', key);
        body = snapshot?.body; cached = true;
        if (!['conflict', 'error', 'auth-required'].includes(state)) state = 'offline'; await broadcast();
      }
      const pending = await queue(current.familyId);
      let partialCoverage = false;
      if (!body && (kind === 'timeline' || CORE.has(kind))) {
        const snapshots = (await storage('snapshots', 'getAll')).filter(item => item.familyId === current.familyId && (item.kind === kind || item.kind === 'timeline'));
        const records = snapshots.flatMap(item => Array.isArray(item.body.data) ? item.body.data : item.body.data ? [item.body.data] : []);
        if (records.length || pending.length) {
          partialCoverage = true;
          body = { success: true, data: records.filter(row => kind === 'timeline' || rowMatches(row, kind)) };
        }
      }
      if (!body) return response({ success: false, error: 'This data has not been saved on this device. Connect once to make it available offline.' }, 503, { 'X-Sprout-Offline': 'true' });
      if (kind === 'timeline' || CORE.has(kind)) {
        if (url.searchParams.has('categories')) return response(body, 200, cached ? { 'X-Sprout-Offline': 'true' } : {});
        let rows = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];
        if (isLast) {
          const snapshots = (await storage('snapshots', 'getAll')).filter(item => item.familyId === current.familyId && (item.kind === kind || item.kind === 'timeline'));
          rows = [...snapshots.flatMap(item => Array.isArray(item.body.data) ? item.body.data : item.body.data ? [item.body.data] : []).filter(row => rowMatches(row, kind)), ...rows];
        }
        rows = overlayRows(rows, pending, kind, url);
        if (partialCoverage && rows.length === 0) return response({ success: false, error: 'This date range is not available in the saved history on this device.' }, 503, { 'X-Sprout-Offline': 'true' });
        const id = url.searchParams.get('id');
        if (id) body = { ...body, data: rows.find(row => row.id === id) || null };
        else if (isLast) body = { ...body, data: rows.find(row => eventTime(row) <= Date.now()) || null };
        else if (!url.searchParams.has('categories')) body = { ...body, data: rows };
      }
      return response({ ...body, ...(cached ? { offline: { cached: true, partialCoverage } } : {}) }, 200, cached ? { 'X-Sprout-Offline': 'true' } : {});
    }
    async function handle(request, context) {
      const url = new URL(request.url);
      if (url.origin !== origin) return null;
      const current = await scopeFor(context || {});
      // The install manifest starts at /. A previously validated family can
      // cold-launch its saved shell while disconnected, including after the
      // service worker itself restarts with no in-memory client session.
      if (request.mode === 'navigate' && url.pathname === '/') {
        const scope = await restore();
        if (!scope) return null;
        const startEpoch = epoch;
        try { return await bounded(request); }
        catch {
          if (epoch !== startEpoch || !active || active.fingerprint !== scope.fingerprint) return new Response('Connect to sign in again.', { status: 503 });
          if (!['conflict', 'error', 'auth-required'].includes(state)) state = 'offline'; await broadcast();
          return Response.redirect(origin + '/' + encodeURIComponent(scope.familySlug) + '/log-entry', 302);
        }
      }
      if (request.mode === 'navigate' || (request.method === 'GET' && !url.pathname.startsWith('/api/') && active && (url.pathname === '/' + active.familySlug || url.pathname.startsWith('/' + active.familySlug + '/')))) {
        await restore();
        const scope = current || active;
        if (!scope || !(url.pathname === '/' + scope.familySlug || url.pathname.startsWith('/' + scope.familySlug + '/'))) return null;
        const shell = await options.caches.open('sprout-private-shell-' + scope.familyId);
        const shellUrl = new URL(request.url);
        shellUrl.searchParams.delete('_rsc');
        if (request.headers.get('RSC') === '1') shellUrl.searchParams.set('__sprout_rsc', '1');
        const shellKey = shellUrl.href;
        const startEpoch = epoch;
        try {
          const result = await bounded(request);
          if (epoch !== startEpoch) return new Response('Signed out. Connect to sign in again.', { status: 401 });
          if (result.ok && /text\/(?:html|x-component)/.test(result.headers.get('Content-Type') || '')) await shell.put(shellKey, result.clone());
          return result;
        } catch {
          if (epoch !== startEpoch) return new Response('Signed out. Connect to sign in again.', { status: 401 });
          if (!['conflict', 'error', 'auth-required'].includes(state)) state = 'offline'; await broadcast();
          return await shell.match(shellKey) || (request.headers.get('RSC') !== '1' ? await shell.match(origin + '/' + scope.familySlug + '/log-entry') : null) || new Response('Open this page while connected once to save it for offline use.', { status: 503 });
        }
      }
      if (request.method === 'GET' && !url.pathname.startsWith('/api/') && (url.pathname.startsWith('/_next/static/') || /^\/(?:[\w-]+\.(?:png|svg|ico|woff2?|css|js|webp)|icons\/[^/]+\.(?:png|svg|webp))$/.test(url.pathname))) {
        const cache = await options.caches.open('sprout-public-assets-v1');
        const cached = await cache.match(request);
        if (cached) return cached;
        const result = await bounded(request); if (result.ok) await cache.put(request, result.clone()); return result;
      }
      if (!current || (url.searchParams.get('familyId') && url.searchParams.get('familyId') !== current.familyId)) return null;
      const authorization = request.headers.get('Authorization');
      if (authorization && !authorization.startsWith('Bearer ')) return null;
      if (authorization && current.token && authorization !== 'Bearer ' + current.token) return null;
      if (!current.token && !authorization) return null;
      if (!current.token && authorization) {
        const fingerprint = Array.from(new Uint8Array(await options.crypto.subtle.digest('SHA-256', new TextEncoder().encode(authorization.replace(/^Bearer /, ''))))).map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (fingerprint !== current.fingerprint) return null;
      }
      if (request.method === 'GET' && (url.pathname === '/api/family/by-slug/' + current.familySlug || url.pathname === '/api/family/public-list')) return get(request, current, 'family', false);
      const endpoint = url.pathname.match(ENDPOINT); const kind = endpoint?.[1];
      if (request.method === 'GET' && (kind === 'timeline' || CORE.has(kind) || REFERENCES.has(kind))) return get(request, current, kind, endpoint?.[2] === 'last');
      if (!CORE.has(kind) || endpoint?.[2] || !['POST', 'PUT', 'DELETE'].includes(request.method)) return null;
      const run = mutationFlight.then(() => mutate(request, context, current, kind));
      mutationFlight = run.catch(() => {}); return run;
    }
    async function prewarm(urls, clientId) {
      const current = sessions.get(clientId); if (!current) return;
      const resources = [...new Set(['/' + current.familySlug, '/' + current.familySlug + '/log-entry', ...urls])];
      for (let index = 0; index < resources.length && index < 150; index++) {
        if (sessions.get(clientId) !== current) break;
        try {
          const result = await handle(new Request(new URL(resources[index], origin), { headers: { Authorization: 'Bearer ' + current.token } }), { clientId });
          if (result?.ok && result.headers.get('Content-Type')?.includes('text/html')) {
            const html = await result.text();
            for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
              const resource = new URL(match[1], origin);
              if (resource.origin === origin && resource.pathname.startsWith('/_next/static/') && !resources.includes(resource.href)) resources.push(resource.href);
            }
          }
        } catch { /* Cached coverage remains explicit on a miss. */ }
      }
      await broadcast();
    }
    async function operations(clientId) {
      const current = sessions.get(clientId);
      if (!current) return [];
      return queue(current.familyId);
    }
    async function discard(message, clientId) {
      const current = sessions.get(clientId);
      if (!current || message.confirmed !== true) return false;
      const items = await queue(current.familyId);
      const selected = items.find(item => item.seq === message.seq && item.requestId === message.requestId);
      if (!selected || !selected.blocked) return false;
      for (const item of items) {
        if (item.seq === selected.seq || (selected.method === 'POST' && item.seq > selected.seq && item.recordId === selected.recordId)) await storage('outbox', 'delete', item.seq);
      }
      state = 'ready'; error = null; await broadcast(); return true;
    }
    async function freshen(urls, clientId) { await replay(clientId); await prewarm(urls, clientId); }
    return { session, pause, clear, status, replay, handle, prewarm, operations, discard, freshen };
  }
  const api = { createEngine, canonicalKey, overlayRows };
  root.SproutOffline = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
