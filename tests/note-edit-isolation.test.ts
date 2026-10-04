import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({note:{findFirst:vi.fn(),update:vi.fn(),create:vi.fn()},baby:{findFirst:vi.fn()}}));
vi.mock('../app/api/db',()=>({default:mocks}));
vi.mock('../app/api/utils/auth',()=>({withAuthContext:(handler:any)=>(req:any)=>handler(req,{authenticated:true,familyId:'family',caretakerId:'caretaker'})}));
vi.mock('../app/api/utils/writeProtection',()=>({checkWritePermission:()=>({allowed:true})}));
vi.mock('@/src/lib/notifications/activityHook',()=>({notifyActivityCreated:()=>Promise.resolve()}));
import {PUT} from '../app/api/note/route';
const request=(body:unknown)=>new NextRequest('http://localhost/api/note?id=note',{method:'PUT',body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();mocks.note.findFirst.mockResolvedValue({id:'note',familyId:'family'});mocks.note.update.mockResolvedValue({id:'note',time:new Date('2026-01-01'),createdAt:new Date('2026-01-01'),updatedAt:new Date('2026-01-01'),deletedAt:null});});
describe('historical note family isolation',()=>{
 it('edits content while stripping ownership, IDs and nested writes',async()=>{
  const response=await PUT(request({content:'Edited history',id:'changed-id',familyId:'other',caretakerId:'other',deletedAt:'2026-01-01',baby:{connect:{id:'other'}}}));
  expect(response.status).toBe(200);
  expect(mocks.note.update).toHaveBeenCalledWith({where:{id:'note'},data:{content:'Edited history'}});
 });
 it('rejects a baby outside the authenticated family before updating',async()=>{
  mocks.baby.findFirst.mockResolvedValue(null);
  const response=await PUT(request({babyId:'other-family-baby',content:'Edited'}));
  expect(response.status).toBe(404);expect(mocks.note.update).not.toHaveBeenCalled();
 });
 it('allows moving a note to another live baby owned by the same family',async()=>{
  mocks.baby.findFirst.mockResolvedValue({id:'second-baby',familyId:'family'});
  const response=await PUT(request({babyId:'second-baby',content:'Edited'}));
  expect(response.status).toBe(200);expect(mocks.note.update).toHaveBeenCalledWith({where:{id:'note'},data:{babyId:'second-baby',content:'Edited'}});
 });
});
