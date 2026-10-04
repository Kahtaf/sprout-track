import {describe,it,expect} from 'vitest';
import {latestFeedTimerStatus} from '@/src/utils/latestFeedTimerStatus';
const now=Date.parse('2026-10-04T18:00:00Z');
const bottle=(time:string,extra={})=>({type:'BOTTLE',amount:30,time,...extra});
describe('actual latest feed elapsed timer',()=>{
 it('ignores future, invalid and undone feeds while retaining an older than24h feed',()=>{
  const result=latestFeedTimerStatus([bottle('2026-10-03T10:00:00Z'),bottle('2026-10-05T10:00:00Z'),bottle('invalid'),bottle('2026-10-04T17:00:00Z',{deletedAt:'2026-10-04T17:30:00Z'})],null,now);
  expect(result.lastFeedTime?.toISOString()).toBe('2026-10-03T10:00:00.000Z');
 });
 it('preserves paired nursing start/end bounds and excludes future paired sides',()=>{
  const breast={type:'BREAST',amount:null,sessionId:'session'};
  const result=latestFeedTimerStatus([{...breast,id:'left',side:'LEFT',time:'2026-10-04T17:00:00Z',startTime:'2026-10-04T16:50:00Z',endTime:'2026-10-04T17:00:00Z'}, {...breast,id:'right',side:'RIGHT',time:'2026-10-04T17:15:00Z',startTime:'2026-10-04T17:05:00Z',endTime:'2026-10-04T17:15:00Z'}, {...breast,id:'future',side:'RIGHT',time:'2026-10-04T19:00:00Z'}],null,now);
  expect(result.lastFeedTime?.toISOString()).toBe('2026-10-04T16:50:00.000Z');expect(result.lastFeedEndTime?.toISOString()).toBe('2026-10-04T17:15:00.000Z');
 });
 it('honors selected timer categories and leaves no status when all entries are future',()=>{
  const result=latestFeedTimerStatus([bottle('2026-10-04T17:00:00Z',{bottleType:'Formula'}),bottle('2026-10-04T16:00:00Z',{bottleType:'Breast Milk'}),{foodId:'food',time:'2026-10-04T17:30:00Z'}],['BOTTLE_BREAST_MILK'],now);
  expect(result.lastFeedTime?.toISOString()).toBe('2026-10-04T16:00:00.000Z');
  expect(latestFeedTimerStatus([bottle('2026-10-05T10:00:00Z')],null,now)).toEqual({});
 });
});
