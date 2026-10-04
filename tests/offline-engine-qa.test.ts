import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';

/** Execute the shipped engine, with actual IndexedDB transactions and a
 * minimal CacheStorage boundary. This is engine proof, not browser lifecycle.
 */
function cacheStorage(){
 const stores=new Map<string,Map<string,Response>>();
 const key=(r:Request|string)=>typeof r==='string'?new URL(r,'http://localhost:8794').href:r.url;
 return {stores,async keys(){return [...stores.keys()];},async delete(name:string){return stores.delete(name);},async open(name:string){if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name)!;return {
  async match(r:Request|string){return store.get(key(r))?.clone();},async put(r:Request|string,response:Response){store.set(key(r),response.clone());},async delete(r:Request|string){return store.delete(key(r));},async keys(){return [...store.keys()].map(k=>new Request(k));},
 };},async match(r:Request|string){for(const store of stores.values()){const value=store.get(key(r));if(value)return value.clone();}}};
}
function harness(){
 const context:any={console,URL,Request,Response,Headers,TextEncoder,TextDecoder,setTimeout,clearTimeout,crypto:webcrypto,structuredClone,atob,AbortController,AbortSignal};context.self=context;context.globalThis=context;
 runInNewContext(readFileSync('public/offline-engine.js','utf8'),context);
 const indexedDB=new IDBFactory(),caches=cacheStorage(),records=new Map<string,any>();
 let online=true,dropCommit=false,nextStatus=0;let revision=0;const calls:any[]=[];const messages:any[]=[];
 const fetch=async(request:Request|string,init?:RequestInit)=>{
  const req=typeof request==='string'?new Request(new URL(request,'http://localhost:8794'),init):request;
  calls.push({method:req.method,url:req.url,id:req.headers?.get('X-Offline-Request-Id')});
  if(!online)throw new TypeError('Synthetic network disconnected');
  const url=new URL(req.url);let data:any;
  if(url.pathname==='/api/settings'){const claims=JSON.parse(Buffer.from((req.headers.get('Authorization')||'').split('.')[1],'base64url').toString());return Response.json({success:true,data:{familyId:claims.familyId}});}
  if(nextStatus && req.method!=='GET'){const status=nextStatus;nextStatus=0;return Response.json({success:false,error:'Synthetic server rejection'},{status});}
  if(req.mode==='navigate'||!url.pathname.startsWith('/api/'))return new Response('<html>Synthetic private shell</html>',{headers:{'Content-Type':'text/html'}});
  if(req.method==='POST') {const body=await req.json();const id=req.headers.get('X-Offline-Request-Id')||webcrypto.randomUUID();if(!records.has(id))records.set(id,{...body,id,updatedAt:'2026-10-04T12:00:00.000Z',createdAt:'2026-10-04T12:00:00.000Z',deletedAt:null});data=records.get(id);if(dropCommit){dropCommit=false;throw new TypeError('Synthetic lost response after commit');}}
  else if(req.method==='PUT'){const id=url.searchParams.get('id')!;if(req.headers.get('X-Offline-Base-Version')!==records.get(id)?.updatedAt)return Response.json({success:false,error:'Synthetic stale revision'},{status:409});data={...records.get(id),...await req.json(),updatedAt:new Date(Date.parse('2026-10-04T12:00:00Z')+(++revision)*1000).toISOString()};records.set(id,data);}
  else if(req.method==='DELETE'){const id=url.searchParams.get('id')!;data={...records.get(id),deletedAt:'2026-10-04T13:00:00.000Z'};records.set(id,data);}
  else if(url.searchParams.has('id'))data=records.get(url.searchParams.get('id')!);
  else data=[...records.values()].filter(row=>{const stamp=Date.parse(row.time||row.startTime);const start=url.searchParams.get('startDate'),end=url.searchParams.get('endDate');return (!start||stamp>=Date.parse(start))&&(!end||stamp<=Date.parse(end));});
  return Response.json({success:true,data});
 };
 const make=()=>context.SproutOffline.createEngine({indexedDB,caches,fetch,crypto:webcrypto,origin:'http://localhost:8794',broadcast:(value:any)=>messages.push(value)});
 return {make,indexedDB,caches,records,calls,messages,setOnline:(value:boolean)=>{online=value;},dropNextCommit:()=>{dropCommit=true;},rejectNext:(status:number)=>{nextStatus=status;}};
}
const token='header.'+Buffer.from(JSON.stringify({familyId:'family-a',familySlug:'family-a',exp:Date.now()/1000+86400})).toString('base64url')+'.signature';
const session={familyId:'family-a',familySlug:'family-a',token};
const request=(path:string,method='GET',body?:unknown,authToken=token)=>new Request('http://localhost:8794'+path,{method,headers:{Authorization:'Bearer '+authToken,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
const client={clientId:'client-a',clientUrl:'http://localhost:8794/family-a/log-entry'};

describe('independent shipped offline engine QA',()=>{
 it('cold launches the installed root offline only for a previously validated active family',async()=>{
  const h=harness();let engine=h.make();
  const root=()=>{const req=new Request('http://localhost:8794/');Object.defineProperty(req,'mode',{value:'navigate'});return req;};
  expect(await engine.handle(root(),{clientId:'cold',clientUrl:'http://localhost:8794/'})).toBeNull();
  await engine.session(session,client.clientId);await engine.prewarm([],client.clientId);
  expect((await engine.handle(root(),client)).status).toBe(200);
  h.setOnline(false);engine=h.make();
  const redirect=await engine.handle(root(),{clientId:'cold',clientUrl:'http://localhost:8794/'});
  expect(redirect.status).toBe(302);expect(redirect.headers.get('Location')).toBe('http://localhost:8794/family-a/log-entry');
  const shell=new Request(redirect.headers.get('Location')!);Object.defineProperty(shell,'mode',{value:'navigate'});
  expect((await engine.handle(shell,{clientId:'cold',clientUrl:'http://localhost:8794/'})).status).toBe(200);
  await engine.clear();
  expect(await engine.handle(root(),{clientId:'cold',clientUrl:'http://localhost:8794/'})).toBeNull();
 });
 it('durably creates and edits offline, survives engine restart, and replays exactly once',async()=>{
  const h=harness();let engine=h.make();await engine.session(session,client.clientId);h.setOnline(false);
  const response=await engine.handle(request('/api/note','POST',{babyId:'baby-a',time:'2026-10-04T12:00:00.000Z',content:'Synthetic offline note'}),client);
  expect(response).toBeInstanceOf(Response);const created=await response.json();expect(created.success).toBe(true);const id=created.data.id;
  const edited=await engine.handle(request('/api/note?id='+id,'PUT',{content:'Synthetic offline edited'}),client);expect((await edited.json()).success).toBe(true);
  engine=h.make();await engine.session(session,client.clientId);
  const offline=await engine.handle(request('/api/note?babyId=baby-a'),client);expect((await offline.json()).data.find((r:any)=>r.id===id).content).toBe('Synthetic offline edited');
  h.setOnline(true);await engine.replay(client.clientId);await engine.replay(client.clientId);
  expect(h.records.size).toBe(1);expect([...h.records.values()][0].content).toBe('Synthetic offline edited');expect((await engine.status()).pending).toBe(0);
 });
 it('retains a request identity after a server commit with a lost response',async()=>{
  const h=harness(),engine=h.make();await engine.session(session,client.clientId);h.dropNextCommit();
  const response=await engine.handle(request('/api/note','POST',{babyId:'baby-a',time:'2026-10-04T12:00:00.000Z',content:'Lost-response note'}),client);expect((await response.json()).success).toBe(true);
  expect(h.records.size).toBe(1);await engine.replay(client.clientId);expect(h.records.size).toBe(1);expect((await engine.status()).pending).toBe(0);
  const ids=h.calls.filter(c=>c.method==='POST').map(c=>c.id);expect(new Set(ids).size).toBe(1);expect(ids[0]).toBeTruthy();
 });
 it('logout clears private snapshots/shells but keeps unsynced journal invisible to another family',async()=>{
  const h=harness(),engine=h.make();await engine.session(session,client.clientId);
  await engine.handle(request('/api/note?babyId=baby-a'),client);
  const navigation=new Request('http://localhost:8794/family-a/log-entry');Object.defineProperty(navigation,'mode',{value:'navigate'});await engine.handle(navigation,client);
  expect([...h.caches.stores.entries()].some(([k,rows])=>k.startsWith('sprout-private-')&&rows.size>0)).toBe(true);
  h.setOnline(false);
  const created=await (await engine.handle(request('/api/note','POST',{babyId:'baby-a',time:'2026-10-04T12:00:00.000Z',content:'Family A private pending'}),client)).json();
  await engine.clear();expect([...h.caches.stores.keys()].some(k=>k.startsWith('sprout-private-'))).toBe(false);
  expect(await engine.handle(request('/api/note?babyId=baby-a'),client)).toBeNull();
  const btoken='header.'+Buffer.from(JSON.stringify({familyId:'family-b',familySlug:'family-b',exp:Date.now()/1000+86400})).toString('base64url')+'.signature';
  const b={clientId:'client-b',clientUrl:'http://localhost:8794/family-b/log-entry'};
  h.setOnline(true);await engine.session({familyId:'family-b',familySlug:'family-b',token:btoken},b.clientId);h.setOnline(false);
  const other=await engine.handle(request('/api/note?babyId=baby-a','GET',undefined,btoken),b);expect(other.status).toBe(503);expect(JSON.stringify(await other.json())).not.toContain('Family A private pending');
  h.setOnline(true);await engine.session(session,client.clientId);h.setOnline(false);
  const restored=await engine.handle(request('/api/note?babyId=baby-a'),client);
  expect((await restored.json()).data.find((r:any)=>r.id===created.data.id).content).toBe('Family A private pending');
 });
 it('never reports success when the durable journal write fails',async()=>{
  const h=harness(),engine=h.make();await engine.session(session,client.clientId);h.setOnline(false);
  const failure=vi.spyOn(IDBObjectStore.prototype,'add').mockImplementationOnce(()=>{throw new DOMException('Synthetic IndexedDB quota exhausted','QuotaExceededError');});
  try{const response=await engine.handle(request('/api/note','POST',{babyId:'baby-a',content:'Must not appear saved'}),client);expect(response.status).toBe(507);expect((await response.json()).success).toBe(false);}finally{failure.mockRestore();}
  expect((await engine.status()).pending).toBe(0);expect(h.records.size).toBe(0);
 });
 it('does not queue unsupported operations and exposes a cache miss honestly',async()=>{
  const h=harness(),engine=h.make();await engine.session(session,client.clientId);h.setOnline(false);
  expect(await engine.handle(request('/api/medicine','POST',{name:'Unsupported offline medicine'}),client)).toBeNull();
  const response=await engine.handle(request('/api/settings'),client);expect(response.status).toBe(503);expect((await response.json()).success).toBe(false);expect((await engine.status()).pending).toBe(0);
 });

 it('preserves complete cached history when partial time-range requests share a date',async()=>{
  const h=harness(),engine=h.make();await engine.session(session,client.clientId);
  for(const [id,time] of [['morning','2026-10-04T10:00:00Z'],['afternoon','2026-10-04T15:00:00Z'],['previous','2026-10-03T10:00:00Z']])h.records.set(id,{id,babyId:'baby-a',familyId:'family-a',time,content:id,updatedAt:'2026-10-04T12:00:00Z'});
  await engine.handle(request('/api/timeline?babyId=baby-a&startDate=2026-10-01T00:00:00Z&endDate=2026-10-05T23:59:59Z'),client);
  await engine.handle(request('/api/timeline?babyId=baby-a&startDate=2026-10-04T14:00:00Z&endDate=2026-10-04T23:59:59Z'),client);
  h.setOnline(false);
  const day=await engine.handle(request('/api/timeline?babyId=baby-a&startDate=2026-10-04T00:00:00Z&endDate=2026-10-04T23:59:59Z'),client);
  expect((await day.json()).data.map((r:any)=>r.id).sort()).toEqual(['afternoon','morning']);
 });

 it('keeps a stale offline edit queued as conflict instead of overwriting another caregiver',async()=>{
  const h=harness(),engine=h.make();await engine.session(session,client.clientId);
  h.records.set('existing',{id:'existing',babyId:'baby-a',familyId:'family-a',time:'2026-10-04T10:00:00Z',content:'Original',updatedAt:'2026-10-04T12:00:00.000Z'});
  await engine.handle(request('/api/note?babyId=baby-a'),client);h.setOnline(false);
  await engine.handle(request('/api/note?id=existing','PUT',{content:'My stale offline edit'}),client);
  h.records.set('existing',{...h.records.get('existing'),content:'Other caregiver newer edit',updatedAt:'2026-10-04T12:01:00.000Z'});
  h.setOnline(true);await engine.replay(client.clientId);
  expect(h.records.get('existing').content).toBe('Other caregiver newer edit');expect((await engine.status()).pending).toBe(1);expect((await engine.status()).status).toBe('conflict');
 });
 it('retains rejected auth writes for reauthentication rather than silently discarding them',async()=>{
  const h=harness(),engine=h.make();await engine.session(session,client.clientId);h.setOnline(false);
  await engine.handle(request('/api/note','POST',{babyId:'baby-a',time:'2026-10-04T10:00:00Z',content:'Retain rejected write'}),client);
  h.setOnline(true);h.rejectNext(401);await engine.replay(client.clientId);
  expect((await engine.status()).status).toBe('auth-required');expect((await engine.status()).pending).toBe(1);expect(h.records.size).toBe(0);
 });

 it('foreground fresh reads include another caregiver without dropping a blocked local edit',async()=>{
  const h=harness(),engine=h.make();await engine.session(session,client.clientId);
  h.records.set('existing',{id:'existing',babyId:'baby-a',familyId:'family-a',time:'2026-10-04T12:00:00Z',content:'Original',updatedAt:'2026-10-04T12:00:00.000Z'});
  await engine.handle(request('/api/note?babyId=baby-a'),client);h.setOnline(false);
  await engine.handle(request('/api/note?id=existing','PUT',{content:'Local pending edit'}),client);
  h.records.set('other-caregiver',{id:'other-caregiver',babyId:'baby-a',familyId:'family-a',time:'2026-10-04T13:00:00Z',content:'Other caregiver entry',updatedAt:'2026-10-04T13:00:00.000Z'});
  h.setOnline(true);h.rejectNext(409);await engine.freshen(['/api/note?babyId=baby-a'],client.clientId);
  const rows=(await (await engine.handle(request('/api/note?babyId=baby-a'),client)).json()).data;
  expect(rows.find((r:any)=>r.id==='other-caregiver').content).toBe('Other caregiver entry');
  expect(rows.find((r:any)=>r.id==='existing').content).toBe('Local pending edit');expect((await engine.status()).pending).toBe(1);
 });

 it('requires explicit scoped confirmation to discard a blocked create and dependent edits',async()=>{
  const h=harness(),engine=h.make();await engine.session(session,client.clientId);h.setOnline(false);
  const row=(await (await engine.handle(request('/api/note','POST',{babyId:'baby-a',time:'2026-10-04T12:00:00Z',content:'Blocked synthetic'}),client)).json()).data;
  await engine.handle(request('/api/note?id='+row.id,'PUT',{content:'Dependent edit'}),client);
  h.setOnline(true);h.rejectNext(400);await engine.replay(client.clientId);
  const item=(await engine.operations(client.clientId))[0];expect(item.blocked).toBe(400);
  expect(await engine.discard({seq:item.seq,requestId:item.requestId,confirmed:false},client.clientId)).toBe(false);
  expect(await engine.discard({seq:item.seq,requestId:'different',confirmed:true},client.clientId)).toBe(false);
  expect((await engine.status()).pending).toBe(2);
  expect(await engine.discard({seq:item.seq,requestId:item.requestId,confirmed:true},client.clientId)).toBe(true);
  expect((await engine.status()).pending).toBe(0);expect(h.records.size).toBe(0);
 });

 it('last feed ignores future cached and queued entries',async()=>{
  const h=harness(),engine=h.make();await engine.session(session,client.clientId);
  h.records.set('past',{id:'past',babyId:'baby-a',familyId:'family-a',type:'BOTTLE',time:'2026-01-01T12:00:00Z',amount:2,updatedAt:'2026-01-01T12:00:00Z'});
  h.records.set('future',{id:'future',babyId:'baby-a',familyId:'family-a',type:'BOTTLE',time:'2099-01-01T12:00:00Z',amount:3,updatedAt:'2026-01-01T12:00:00Z'});
  await engine.handle(request('/api/feed-log?babyId=baby-a'),client);h.setOnline(false);
  await engine.handle(request('/api/feed-log','POST',{babyId:'baby-a',type:'BOTTLE',time:'2099-01-02T12:00:00Z',amount:4}),client);
  const last=await (await engine.handle(request('/api/feed-log/last?babyId=baby-a'),client)).json();expect(last.data.id).toBe('past');
 });

});
