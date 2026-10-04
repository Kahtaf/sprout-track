import { describe, expect, it } from 'vitest';
import { parseBabycareHistory, parseNaraHistory } from '@/src/lib/importers/family-history';
import { externalImportLocalTimeToUtc } from '@/src/lib/importers/timezone';

function nara(rows: Record<string,string>[]) {
 const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
 const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
 return [headers.map(quote).join(','),...rows.map(row=>headers.map(h=>quote(row[h]||'')).join(','))].join('\n');
}
const profile = {Type:'Profile',_activityKey:'',_profileKey:'child','Profile Name':'Synthetic baby','[Profile] Birth Date':'2026-02-18'};
const event = { _activityKey:'event',_profileKey:'child','Start Date/time (Epoch)':'1774008000000',Note:'' };

describe('independent migration integrity QA', () => {
 it('treats Babycare literal Z as Toronto wall time across spring daylight saving', () => {
  const documents = ['2026-03-07T12:00:00.000Z','2026-03-09T12:00:00.000Z'].map((createdAt,i)=>({_id:`pump-${i}`,type:'event',event_type:'pumping',baby_id:'child',createdAt,volume:20}));
  const result = parseBabycareHistory(JSON.stringify({documents}));
  expect(result.map(r=>r.targetType==='pump'?externalImportLocalTimeToUtc(r.startTime,'America/Toronto').toISOString():null)).toEqual(['2026-03-07T17:00:00.000Z','2026-03-09T16:00:00.000Z']);
 });
 it('keeps Nara epoch authoritative and split measurements attributable to one raw source', () => {
  const row = {...event,Type:'Growth','[Growth] Head Size':'39','[Growth] Head Size Unit':'IN','[Growth] Weight':'5','[Growth] Weight Unit':'KG'};
  const result = parseNaraHistory(nara([profile,row])).filter(r=>r.targetType!=='baby');
  expect(result).toHaveLength(2);
  expect(new Set(result.map(r=>r.source.rawSource)).size).toBe(1);
  const head=result.find(r=>r.targetType==='measurement' && r.type==='HEAD_CIRCUMFERENCE');
  expect(head?.source.reviewFlags?.length).toBeGreaterThan(0);
  if(head?.targetType==='measurement') {expect(head.value).toBe(39);expect(head.unit).toBe('in');expect(externalImportLocalTimeToUtc(head.date,'America/Toronto').getTime()).toBe(1774008000000);}
 });
 it('keeps unknown medicines as notes without inventing a dose, and incomplete pumps without invented end time', () => {
  const records=parseNaraHistory(nara([profile,{...event,Type:'Medical','[Medical] Medication':'Unknown medication', '[Medical] Temperature':''},{...event,_activityKey:'pump',Type:'Pump',_profileKey:'','[Pump] Total Volume':'2','[Pump] Total Volume Unit':'FLOZ'}]));
  const note=records.find(r=>r.targetType==='note');expect(note?.source.rawSource).toContain('Unknown medication');
  const pump=records.find(r=>r.targetType==='pump');
  if(pump?.targetType==='pump'){expect(pump.endTime).toBeUndefined();expect(pump.duration).toBeUndefined();expect(pump.unitAbbr).toBe('OZ');expect(pump.sourceChildId).toBe('child');}else throw new Error('Pump dropped');
 });
 it('rejects an unrecognized Nara category rather than silently dropping it', () => {
  expect(()=>parseNaraHistory(nara([profile,{...event,Type:'Unrecognized'}]))).toThrow(/Unsupported Nara category/);
 });
 it('retains unsupported Babycare event fields in raw source while mapping a visible note', () => {
  const records=parseBabycareHistory(JSON.stringify({documents:[{_id:'event',baby_id:'child',type:'event',event_type:'crying',createdAt:'2026-03-01T12:00:00.000Z',arbitraryField:'preserve me'}]}));
  expect(records[0].targetType).toBe('note');expect(records[0].source.rawSource).toContain('preserve me');
 });
});
