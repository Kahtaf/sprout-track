import { beforeEach, describe, expect, it, vi } from 'vitest';
import { offlineScopeMatches, savedOfflineScope, prepareOfflineLogout, canUseOfflineFamily, setOfflineTransportState } from '@/src/lib/offline/session';
import { refreshAuthToken, refreshFailureIsTransient, __resetRefreshStateForTests } from '@/src/utils/session-timeout';

function storage(initial: Record<string,string> = {}) {
  const entries = new Map(Object.entries(initial));
  return { getItem: (key: string) => entries.get(key) ?? null, setItem:(key:string,value:string) => { entries.set(key,value); },removeItem:(key:string) => { entries.delete(key); } };
}
const token = (familyId = 'family', familySlug='my-family') => `header.${btoa(JSON.stringify({familyId,familySlug,exp:1}))}.signature`;
const scope = JSON.stringify({familyId:'family',familySlug:'my-family',confirmedAt:1});

describe('prior local family session boundaries', () => {
  beforeEach(() => { __resetRefreshStateForTests(); vi.unstubAllGlobals(); });
  it('permits an expired prior session only in the matching confirmed family, never a new token or signed-out device', () => {
    const saved = storage({'sprout.offline.family':scope,authToken:token(),unlockTime:'1'});
    expect(offlineScopeMatches(saved,'my-family')).toBe(true);
    expect(offlineScopeMatches(saved,'other')).toBe(false);
    saved.setItem('authToken',token('different'));
    expect(offlineScopeMatches(saved,'my-family')).toBe(false);
    saved.setItem('authToken',token()); saved.removeItem('unlockTime');
    expect(offlineScopeMatches(saved,'my-family')).toBe(false);
    expect(offlineScopeMatches(storage({authToken:token(),unlockTime:'1'}),'my-family')).toBe(false);
    expect(savedOfflineScope(storage({'sprout.offline.family':'invalid'}))).toBeNull();
  });
  it('recognizes a real network outage even while the device reports Wi-Fi online', () => {
    const saved=storage({'sprout.offline.family':scope,authToken:token(),unlockTime:'1'});
    vi.stubGlobal('window',{});vi.stubGlobal('navigator',{onLine:true});vi.stubGlobal('localStorage',saved);vi.stubGlobal('sessionStorage',storage());
    expect(canUseOfflineFamily('my-family')).toBe(false);
    setOfflineTransportState(true);
    expect(canUseOfflineFamily('my-family')).toBe(true);
    expect(canUseOfflineFamily('other')).toBe(false);
    setOfflineTransportState(false);
    expect(canUseOfflineFamily('my-family')).toBe(false);
  });
  it('decodes base64url UTF-8 local scope claims without changing names', () => {
    const claims={familyId:'family',familySlug:'famille-é'};
    const encoded=btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(claims)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    const saved=storage({'sprout.offline.family':JSON.stringify({...claims,confirmedAt:1}),authToken:`h.${encoded}.s`,unlockTime:'1'});
    expect(offlineScopeMatches(saved,'famille-é')).toBe(true);
  });
  it('distinguishes transport outages from rejected refresh without deleting local credentials', async () => {
    const saved = storage({authToken:token()}); vi.stubGlobal('localStorage',saved);
    expect(await refreshAuthToken(vi.fn().mockRejectedValue(new TypeError('network unavailable')))).toBe(false);
    expect(refreshFailureIsTransient()).toBe(true);
    expect(saved.getItem('authToken')).toBe(token());
    expect(await refreshAuthToken(vi.fn().mockResolvedValue(new Response('{}',{status:401})))).toBe(false);
    expect(refreshFailureIsTransient()).toBe(false);
    expect(saved.getItem('authToken')).toBe(token());
  });
  it('explicit zero-pending logout clears cached family access and preserves queued-data contract', async () => {
    const saved=storage({'sprout.offline.family':scope,selectedFamily:'private'});
    const postMessage=vi.fn();
    const serviceWorker={ controller:{postMessage}, addEventListener:vi.fn(),removeEventListener:vi.fn() };
    vi.stubGlobal('localStorage',saved);vi.stubGlobal('navigator',{serviceWorker});vi.stubGlobal('window',{dispatchEvent:vi.fn(),confirm:vi.fn(() => true)});
    vi.useFakeTimers();
    const result=prepareOfflineLogout('logout-user');
    await vi.advanceTimersByTimeAsync(1501);
    expect(await result).toBe(true);
    expect(saved.getItem('sprout.offline.family')).toBeNull();
    expect(saved.getItem('selectedFamily')).toBeNull();
    expect(postMessage).toHaveBeenCalledWith({type:'CLEAR_SESSION',preservePending:true});
    vi.useRealTimers();
  });
});
