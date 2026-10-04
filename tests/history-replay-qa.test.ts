import {describe,expect,it} from 'vitest';
import {Prisma} from '@prisma/client';
import {executeExternalImport} from '@/src/lib/importers/execute';
import type {ExternalImportNoteRecord} from '@/src/types/external-import';

const inputRecord=(providerId='nara'):ExternalImportNoteRecord=>({targetType:'note',source:{providerId,entityType:'Medical',recordId:'source-event',childId:'source-child',rawSource:'{"Type":"Medical","Note":"Original"}'},sourceChildId:'source-child',time:'2026-03-10T12:00:00.000Z',content:'Original'});
function store(){
 const notes=new Map<string,Record<string,unknown>>(), provenance=new Map<string,Record<string,unknown>>();
 let failProvenance=false;
 const key=(where:any)=>JSON.stringify(where.familyId_providerId_sourceEntityType_sourceRecordId);
 const tx={baby:{findMany:async()=>[{id:'baby'}]},note:{upsert:async({where,create,update}:any)=>{const current=notes.get(where.id);if(current){Object.assign(current,update);return current;}notes.set(where.id,{...create});return notes.get(where.id);}},externalImportRecord:{findUnique:async({where}:any)=>provenance.get(key(where)),upsert:async({where,create,update}:any)=>{if(failProvenance){failProvenance=false;throw new Error('Synthetic interrupted provenance write');}const current=provenance.get(key(where));if(current){Object.assign(current,update);return current;}provenance.set(key(where),{...create});return create;}}};
 const execute=(records:ExternalImportNoteRecord[])=>executeExternalImport(tx as unknown as Prisma.TransactionClient,{familyId:'family',records,configuration:{sourceTimezone:'America/Toronto',childDestinations:{'source-child':{mode:'existing',targetBabyId:'baby'}}}});
 return {notes,provenance,execute,interruptNextProvenance:()=>{failProvenance=true;}};
}
describe('independent historical replay QA',()=>{
 it('re-importing the same source preserves manual edits and soft deletion',async()=>{
  const db=store();await db.execute([inputRecord()]);const saved=[...db.notes.values()][0];saved.content='Manually edited';saved.deletedAt='2026-10-04T00:00:00.000Z';
  const replay=await db.execute([inputRecord()]);expect(replay.duplicates).toBe(1);expect(db.notes.size).toBe(1);expect(saved.content).toBe('Manually edited');expect(saved.deletedAt).toBeTruthy();
 });
 it('recovers a log created before interruption without recreating or overwriting it',async()=>{
  const db=store();db.interruptNextProvenance();await expect(db.execute([inputRecord()])).rejects.toThrow(/interrupted/);
  expect(db.notes.size).toBe(1);expect(db.provenance.size).toBe(0);const saved=[...db.notes.values()][0];saved.content='Edited after interrupted import';
  await db.execute([inputRecord()]);expect(db.notes.size).toBe(1);expect(db.provenance.size).toBe(1);expect(saved.content).toBe('Edited after interrupted import');
 });
 it('keeps matching event IDs from different apps separate and preserves each raw source',async()=>{
  const db=store();await db.execute([inputRecord('nara'),inputRecord('babycare')]);expect(db.notes.size).toBe(2);expect(db.provenance.size).toBe(2);for(const r of db.provenance.values())expect(r.rawSource).toBeTruthy();
 });
});
