'use client';
import { useEffect, useState, useRef } from 'react';
import { createForegroundRefresh, safeOfflineAssets } from '@/src/lib/offline/foreground-refresh';
import { registerPwaServiceWorker } from '@/src/lib/notifications/client';
import { EMPTY_STATUS, type OfflineStatus, postOfflineMessage, rememberOnlineFamily, savedOfflineScope, syncOfflineSession, setOfflineTransportState } from '@/src/lib/offline/session';

interface QueuedChange { seq:number; requestId:string; method:string; url?:string; path?:string; recordId?:string; body:Record<string,unknown>; blocked:number|null }
interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{outcome:string}> }
export function PwaServiceWorker() {
  const [offline,setOffline] = useState(false);
  const [status,setStatus] = useState<OfflineStatus>(EMPTY_STATUS);
  const [install,setInstall] = useState<InstallPrompt|null>(null);
  const [ios,setIos] = useState(false);
  const [instructions,setInstructions] = useState(false);
  const [review,setReview] = useState(false);
  const [changes,setChanges] = useState<QueuedChange[]>([]);
  const conflictRequestId=useRef<string|null>(null);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let warmedFamily = '';
    const foregroundIds=new Set<string>();
    const warmFamily = async () => {
      const scope = savedOfflineScope(localStorage);
      const token = localStorage.getItem('authToken');
      if (!scope || !token || !navigator.onLine || warmedFamily === scope.familyId) return;
      warmedFamily = scope.familyId;
      const assets=safeOfflineAssets(performance.getEntriesByType('resource'),window.location.origin);
      const shellUrls=[`/${encodeURIComponent(scope.familySlug)}`,`/${encodeURIComponent(scope.familySlug)}/log-entry`,...assets];
      for (let offset=0;offset<shellUrls.length;offset+=30) postOfflineMessage({type:'PREWARM',urls:shellUrls.slice(offset,offset+30)});
      postOfflineMessage({type:'PREWARM',urls:['/api/baby','/api/settings','/api/caretaker','/api/units','/api/medicine','/api/deployment-config','/api/family/public-list',`/api/family/by-slug/${encodeURIComponent(scope.familySlug)}`]});
      try {
        const response = await fetch('/api/baby',{headers:{Authorization:`Bearer ${token}`}});
        if (!response.ok || response.headers.has('X-Sprout-Offline')) return;
        const result = await response.json();
        const urls = (Array.isArray(result.data) ? result.data : []).filter((baby: {familyId:string}) => baby.familyId === scope.familyId).map((baby: {id:string;birthDate:string}) => {
          const start = new Date(baby.birthDate);
          const params = new URLSearchParams({babyId:baby.id,startDate:Number.isFinite(start.getTime()) ? start.toISOString() : new Date(Date.now()-30*86400000).toISOString(),endDate:new Date().toISOString()});
          return `/api/timeline?${params}`;
        });
        postOfflineMessage({type:'PREWARM',urls});
      } catch { /* Existing cached coverage remains available; no new authorization. */ }
    };
    const update = () => { if (!savedOfflineScope(localStorage) || !localStorage.getItem('authToken')) {setChanges([]);setReview(false);conflictRequestId.current=null;} setOffline(!navigator.onLine); syncOfflineSession(); postOfflineMessage({type:'GET_STATUS'}); if (navigator.onLine) postOfflineMessage({type:'REPLAY'}); void warmFamily(); };
    const resume = createForegroundRefresh(async () => {
      if (document.visibilityState !== 'visible') return;
      const scope = savedOfflineScope(localStorage);
      if (!scope || !localStorage.getItem('authToken')) return;
      syncOfflineSession();
      const urls=['/api/baby','/api/settings','/api/caretaker','/api/units','/api/medicine'];
      if (navigator.serviceWorker.controller) {
        const requestId=crypto.randomUUID(); foregroundIds.add(requestId); postOfflineMessage({type:'FRESHEN',requestId,urls});
      } else {
        try {
          await Promise.all(urls.map(url => fetch(url,{cache:'no-store',headers:{Authorization:`Bearer ${localStorage.getItem('authToken')}`, 'X-Sprout-Refresh':'foreground'}})));
          window.dispatchEvent(new CustomEvent('sprout-data-changed',{detail:{familyId:scope.familyId,foreground:true}}));
        } catch { /* The current draft and cached data stay intact during an outage. */ }
      }
    });
    const onForeground = () => { if (document.visibilityState === 'visible') {update();resume.request();} };
    const message = (event: MessageEvent) => { if (event.data?.type === 'OFFLINE_CONFLICTS' && event.data.requestId === conflictRequestId.current && localStorage.getItem('authToken') && savedOfflineScope(localStorage)) setChanges(event.data.operations || []); if (event.data?.type === 'DATA_CHANGED') { const scope=savedOfflineScope(localStorage); if (scope?.familyId === event.data.familyId) window.dispatchEvent(new CustomEvent('sprout-data-changed',{detail:{...event.data, foreground:foregroundIds.delete(event.data.requestId) || event.data.foreground === true}})); } if (event.data?.type === 'OFFLINE_STATUS') { if (!event.data.familyId) {setChanges([]);setReview(false);} setStatus(event.data); if (event.data.status === 'offline') setOfflineTransportState(true); else if (['ready','syncing'].includes(event.data.status) || (event.data.status === 'auth-required' && navigator.onLine)) setOfflineTransportState(false); } };
    const prompt = (event: Event) => { event.preventDefault(); setInstall(event as InstallPrompt); };
    const installed = () => { setInstall(null); setIos(false); };
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & {standalone?:boolean}).standalone;
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) && !standalone);
    navigator.serviceWorker.addEventListener('message',message);
    navigator.serviceWorker.addEventListener('controllerchange',update);
    window.addEventListener('online',update); window.addEventListener('offline',update);
    window.addEventListener('focus',onForeground); document.addEventListener('visibilitychange',onForeground); window.addEventListener('sprout-session-updated',update);
    window.addEventListener('beforeinstallprompt',prompt); window.addEventListener('appinstalled',installed);
    registerPwaServiceWorker().then(async () => {
      await navigator.serviceWorker.ready; update();
      const token = localStorage.getItem('authToken');
      if (navigator.onLine && token && !savedOfflineScope(localStorage)) {
        try { const response = await fetch('/api/settings',{headers:{Authorization:`Bearer ${token}`}}); if (response.ok && !response.headers.has('X-Sprout-Offline')) rememberOnlineFamily(token); } catch { /* offline: no new local authorization */ }
      }
      syncOfflineSession();
      const scope = savedOfflineScope(localStorage);
      postOfflineMessage({ type:'PREWARM', urls:['/api/baby','/api/settings','/api/caretaker','/api/units','/api/deployment-config','/api/family/public-list', ...(scope ? [`/api/family/by-slug/${encodeURIComponent(scope.familySlug)}`] : [])] });
    }).catch(() => setStatus({pending:0,status:'error',error:'Offline storage is unavailable on this browser.'}));
    update();
    return () => {
      navigator.serviceWorker.removeEventListener('message',message); navigator.serviceWorker.removeEventListener('controllerchange',update);
      for (const name of ['online','offline','sprout-session-updated']) window.removeEventListener(name,update);
      resume.dispose(); window.removeEventListener('focus',onForeground); document.removeEventListener('visibilitychange',onForeground);
      window.removeEventListener('beforeinstallprompt',prompt); window.removeEventListener('appinstalled',installed);
    };
  },[]);
  const installApp = async () => { if (install) { await install.prompt(); await install.userChoice; setInstall(null); } else setInstructions(!instructions); };
  const reviewChanges = () => {setReview(true);syncOfflineSession();const requestId=crypto.randomUUID();conflictRequestId.current=requestId;postOfflineMessage({type:'GET_CONFLICTS',requestId});};
  const exportChanges = () => {
    const url=URL.createObjectURL(new Blob([JSON.stringify(changes,null,2)],{type:'application/json'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download='sprout-unsynced-changes.json';anchor.click();URL.revokeObjectURL(url);
  };
  const discard = (change: QueuedChange) => {
    const dependent = change.method === 'POST' ? changes.filter(item => item.seq > change.seq && item.recordId === change.recordId).length : 0;
    const detail=dependent ? ` and ${dependent} later changes to this same new record` : '';
    if (!window.confirm(`Discard this blocked ${change.method} change${detail}? It will be removed only from this device. Other saved changes stay in the queue. Export a copy first if you need it.`)) return;
    postOfflineMessage({type:'DISCARD_CONFLICT',seq:change.seq,requestId:change.requestId,confirmed:true});
    setChanges(current => current.filter(item => item.seq !== change.seq && !(dependent && item.seq > change.seq && item.recordId === change.recordId)));
    postOfflineMessage({type:'REPLAY'});
  };
  const needsLogin = status.status === 'auth-required';
  const hasProblem = ['error','conflict'].includes(status.status);
  const label = needsLogin ? 'Sign in to sync saved changes' : hasProblem ? (status.error || 'Changes saved on this device. Sync needs attention.') : status.status === 'syncing' ? 'Syncing saved changes…' : (offline || status.status === 'offline') ? 'Offline · using data saved on this device' : status.pending ? `${status.pending} changes waiting to sync` : '';
  if (!label && !install && !ios && !review) return null;
  return <aside aria-label="App installation and sync status" className="pointer-events-none fixed top-[max(0.5rem,env(safe-area-inset-top))] left-2 right-2 z-[100] [&_button]:pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-lg bg-white/95 px-3 py-2 text-xs text-gray-800 shadow dark:bg-gray-900 dark:text-gray-100" role="status">
    {label && <span>{label}{status.pending > 0 && !label.startsWith(String(status.pending)) ? ` (${status.pending} pending)` : ''}</span>}
    {needsLogin && <button className="underline" onClick={() => { const scope = savedOfflineScope(localStorage); if (scope) window.location.href=`/${encodeURIComponent(scope.familySlug)}?reauth=true`; }}>Sign in</button>}
    {(hasProblem || status.pending > 0) && !needsLogin && <button className="underline" onClick={() => {syncOfflineSession();postOfflineMessage({type:'REPLAY'});}}>Retry sync</button>}
    {hasProblem && <button className="underline" onClick={reviewChanges}>Review saved changes</button>}
    {review && <section aria-label="Saved change recovery" className="pointer-events-auto w-full max-h-80 overflow-auto rounded border p-3 text-left">
      <p>These changes are still on this device. Review the latest record before entering a corrected edit. Retry never overwrites a conflicting server record.</p>
      <div className="my-2 flex gap-3"><button className="underline" onClick={exportChanges}>Export saved changes</button><button className="underline" onClick={() => setReview(false)}>Close</button></div>
      {changes.length === 0 && <p>No saved changes are available in this signed-in family.</p>}
      {changes.map(change => <details key={change.seq} className="mb-2 rounded border p-2"><summary>{change.method} · {(change.path || change.url || 'Record').split('?')[0]} {change.blocked ? `· needs review (${change.blocked})` : '· waiting'}</summary><pre className="mt-2 whitespace-pre-wrap break-all">{JSON.stringify(change.body,null,2)}</pre>{change.blocked && <button className="mt-2 underline" onClick={() => discard(change)}>Discard this blocked change</button>}</details>)}
    </section>}
    {(install || ios) && <button className="underline" onClick={installApp}>Install app</button>}
    {instructions && <p className="w-full text-center">In Safari, tap Share, then Add to Home Screen.</p>}
  </aside>;
}
