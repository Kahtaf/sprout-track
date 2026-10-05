import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionRefreshGate, refreshSession, refreshClientSessionSettings, __resetRefreshStateForTests, DEFAULT_IDLE_TIME_SECONDS } from '@/src/utils/session-timeout';

function storage() {
  const map=new Map([['authToken','expired-but-refreshable'],['unlockTime','1'],['idleTimeSeconds','1800']]);
  return { getItem:(key:string) => map.get(key) ?? null,setItem:(key:string,value:string)=>{map.set(key,value);},removeItem:(key:string)=>{map.delete(key);} };
}

describe('layout expiry timer joins refresh cookie renewal', () => {
  beforeEach(() => {__resetRefreshStateForTests();vi.stubGlobal('localStorage',storage());vi.stubGlobal('navigator',{onLine:true});});
  afterEach(() => {vi.useRealTimers();vi.unstubAllGlobals();});
  it('three one-second expired-token checks join a slow refresh and never yield a false failure', async () => {
    vi.useFakeTimers();
    const fetchFn=vi.fn(() => new Promise<Response>(resolve => setTimeout(() => resolve(new Response(JSON.stringify({success:true,data:{token:'renewed-token'}}))),2300)));
    // This is the gate used by client-layout's actual refreshAccessToken wrapper.
    const gate=createSessionRefreshGate(() => refreshSession(fetchFn));
    const first=gate.refresh();expect(gate.isRefreshing()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);const second=gate.refresh();
    await vi.advanceTimersByTimeAsync(1000);const third=gate.refresh();
    expect(second).toBe(first);expect(third).toBe(first);expect(fetchFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(await Promise.all([first,second,third])).toEqual([{status:'refreshed'},{status:'refreshed'},{status:'refreshed'}]);
    expect(localStorage.getItem('authToken')).toBe('renewed-token');expect(gate.isRefreshing()).toBe(false);
  });
  it('keeps a rejected request outcome stable after a later successful login refresh', async () => {
    const gate=createSessionRefreshGate(() => refreshSession(vi.fn().mockResolvedValue(new Response('{}',{status:401}))));
    const rejected=await gate.refresh();
    const success=await refreshSession(vi.fn().mockResolvedValue(new Response(JSON.stringify({success:true,data:{token:'new'}}))));
    expect(success.status).toBe('refreshed');expect(rejected.status).toBe('unauthorized');
  });
  it('configuration fetch failure preserves successful login and replaces legacy thirty-minute idle fallback', async () => {
    await refreshClientSessionSettings(vi.fn().mockRejectedValue(new TypeError('offline')));
    expect(localStorage.getItem('authToken')).toBe('expired-but-refreshable');
    expect(localStorage.getItem('unlockTime')).toBe('1');
    expect(localStorage.getItem('idleTimeSeconds')).toBe(String(DEFAULT_IDLE_TIME_SECONDS));
  });
});
