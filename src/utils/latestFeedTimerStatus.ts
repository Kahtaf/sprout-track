import { groupBreastFeedSessions, type BreastFeedLike } from './feedSessionUtils';
import {feedCountsForTimer,foodCountsForTimer,type FeedTimerCategory} from './feedTimerConfig';

interface TimerActivity extends Partial<BreastFeedLike> {
 id?: string;
 time?: string | Date;
 startTime?: string | Date | null;
 endTime?: string | Date | null;
 deletedAt?: string | Date | null;
 foodId?: string | null;
 bottleType?: string | null;
}

/** Latest completed feed for the elapsed timer, without future/undone history.
 * Paired nursing sides still use their whole session's start and end bounds.
 */
export function latestFeedTimerStatus(
 activities: readonly TimerActivity[],
 categories: readonly FeedTimerCategory[] | null,
 now: number = Date.now(),
): {lastFeedTime?: Date;lastFeedEndTime?: Date} {
 const occurred=activities.filter(a=>{
  if(a.deletedAt || !a.time)return false;
  return [a.time,a.startTime,a.endTime].filter(Boolean).every(time=>{
   const timestamp=new Date(time!).getTime();
   return Number.isFinite(timestamp) && timestamp<=now;
  });
 });
 const last=occurred.filter(a=>'foodId' in a ? foodCountsForTimer(categories) :
  'amount' in a && (a.type==='BOTTLE'||a.type==='BREAST') && feedCountsForTimer({type:a.type,bottleType:a.bottleType},categories))
  .sort((a,b)=>new Date(b.time!).getTime()-new Date(a.time!).getTime())[0];
 if(!last)return {};
 if(last.type!=='BREAST')return {lastFeedTime:new Date(last.time!)};
 const breasts=occurred.filter((a):a is TimerActivity & BreastFeedLike=>a.type==='BREAST' && 'amount' in a && Boolean(a.time));
 const session=groupBreastFeedSessions(breasts).find(s=>s.rows.includes(last as TimerActivity & BreastFeedLike));
 const rows=session?.rows??[last];
 return {
  lastFeedTime:new Date(Math.min(...rows.map(r=>new Date(r.startTime||r.time!).getTime()))),
  lastFeedEndTime:new Date(Math.max(...rows.map(r=>new Date(r.endTime||r.time!).getTime()))),
 };
}
