import { decodeJwtPayloadPart } from '@/src/utils/jwt-payload';
const SCOPE_KEY = 'sprout.offline.family';
export interface SavedOfflineScope { familyId: string; familySlug: string; confirmedAt: number }
export interface OfflineStatus { pending: number; status: 'ready'|'offline'|'syncing'|'auth-required'|'conflict'|'error'; error?: string; familyId?: string }
export const EMPTY_STATUS: OfflineStatus = { pending: 0, status: 'ready' };

export function savedOfflineScope(storage: Pick<Storage,'getItem'>): SavedOfflineScope | null {
  try { const value = JSON.parse(storage.getItem(SCOPE_KEY) || 'null'); return value?.familyId && value?.familySlug && value?.confirmedAt ? value : null; } catch { return null; }
}
export function offlineScopeMatches(storage: Pick<Storage,'getItem'>, slug: string): boolean {
  const scope = savedOfflineScope(storage);
  const token = storage.getItem('authToken');
  if (!scope || scope.familySlug !== slug || !token || !storage.getItem('unlockTime')) return false;
  try { const claims = decodeJwtPayloadPart(token.split('.')[1]); return claims.familyId === scope.familyId && claims.familySlug === slug; } catch { return false; }
}
export function setOfflineTransportState(offline: boolean): void {
  if (typeof window !== 'undefined') sessionStorage.setItem('sprout.offline.transport', String(offline));
}
export function canUseOfflineFamily(slug: string): boolean {
  return typeof window !== 'undefined' && (navigator.onLine === false || sessionStorage.getItem('sprout.offline.transport') === 'true') && offlineScopeMatches(localStorage,slug);
}
export function postOfflineMessage(message: Record<string, unknown>): void {
  if (typeof navigator !== 'undefined') navigator.serviceWorker?.controller?.postMessage(message);
}
export function syncOfflineSession(): void {
  if (typeof window === 'undefined') return;
  const scope = savedOfflineScope(localStorage);
  const token = localStorage.getItem('authToken');
  if (scope && token && offlineScopeMatches(localStorage,scope.familySlug)) postOfflineMessage({ type:'SESSION', ...scope, token });
}
// Call only after a successful online authentication response, never from token claims alone.
export function rememberOnlineFamily(token: string): void {
  if (typeof window === 'undefined' || !navigator.onLine) return;
  try {
    const claims = decodeJwtPayloadPart(token.split('.')[1]);
    if (!claims.familyId || !claims.familySlug || claims.isSysAdmin) return;
    const scope = { familyId: claims.familyId, familySlug: claims.familySlug, confirmedAt: Date.now() };
    localStorage.setItem(SCOPE_KEY,JSON.stringify(scope));
    syncOfflineSession();
    window.dispatchEvent(new Event('sprout-session-updated'));
  } catch { /* malformed response cannot establish cached scope */ }
}
export function requestOfflineStatus(): Promise<OfflineStatus> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return Promise.resolve(EMPTY_STATUS);
  const requestId = crypto.randomUUID();
  const familyId = savedOfflineScope(localStorage)?.familyId;
  return new Promise(resolve => {
    const done = (event?: MessageEvent) => {
      if (event && (event.data?.type !== 'OFFLINE_STATUS' || event.data?.requestId !== requestId || (event.data.familyId && event.data.familyId !== familyId))) return;
      clearTimeout(timer); navigator.serviceWorker.removeEventListener('message',done);
      resolve(event?.data ?? {pending:-1,status:'error',error:'Unable to check saved changes on this device.'});
    };
    const timer = setTimeout(() => done(),1500);
    navigator.serviceWorker.addEventListener('message',done);
    postOfflineMessage({ type:'GET_STATUS', requestId, familyId });
  });
}
export async function prepareOfflineLogout(reason: string): Promise<boolean> {
  const explicit = reason === 'logout-user';
  if (!explicit) {
    postOfflineMessage({ type:'PAUSE_SESSION' });
    return true; // preserve scope and queue for reauthentication
  }
  const status = await requestOfflineStatus();
  if (status.pending < 0 && !window.confirm('Saved changes could not be checked. Sign out? Any pending changes will stay on this device until this same family signs in again.')) return false;
  if (status.pending > 0) {
    if (!window.confirm(`${status.pending} changes are saved only on this device. Sign out now? They will stay here and sync when this same family signs in again.`)) return false;
  }
  localStorage.removeItem(SCOPE_KEY);
  localStorage.removeItem('selectedFamily');
  postOfflineMessage({ type:'CLEAR_SESSION', preservePending:true });
  window.dispatchEvent(new Event('sprout-session-updated'));
  return true;
}
