import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
import { parseTelegramOwnerIds } from '../lib/security.ts';
test('customer escalations persist, redact contacts, retry and deduplicate successful delivery',async()=>{
 const rows:any[]=[];const sent:any[]=[];let fail=true;
 const db={from:()=>{
  const filters:any[]=[];let patch:any;let insert:any;let singular=false;
  const run=()=>{if(insert && !rows.some(r=>r.fingerprint===insert.fingerprint))rows.push({id:'11111111-1111-4111-8111-111111111111',status:'open',notification_status:'pending',attempts:0,next_attempt_at:new Date(0).toISOString(),notified_owner_ids:[],...insert});const data=rows.filter(r=>filters.every(([k,v,op])=>op==='lt'?r[k]<v:op==='lte'?r[k]<=v:r[k]===v));if(patch)data.forEach(r=>Object.assign(r,patch));return{data:singular?data[0]:data,error:null};};
  const q:any={select:()=>q,eq:(k:any,v:any)=>{filters.push([k,v]);return q;},lte:(k:any,v:any)=>{filters.push([k,v,'lte']);return q;},lt:(k:any,v:any)=>{filters.push([k,v,'lt']);return q;},order:()=>q,limit:()=>q,update:(p:any)=>{patch=p;return q;},upsert:(p:any)=>{insert=p;return q;},maybeSingle:()=>{singular=true;return Promise.resolve(run());},then:(f:any)=>Promise.resolve(run()).then(f)};return q;
 }};
 (globalThis as any).__escalationTest={customerTopics:()=>[],getSupabaseAdmin:()=>db,createHash,parseTelegramOwnerIds,sendTelegramMessage:async(...args:any[])=>{if(fail)throw Error();sent.push(args);}};
 const raw=await readFile(new URL('../lib/customer-escalations.ts',import.meta.url),'utf8');
 const mod=await import('data:text/javascript;base64,'+Buffer.from('const {customerTopics,getSupabaseAdmin,createHash,parseTelegramOwnerIds,sendTelegramMessage}=globalThis.__escalationTest;\n'+stripTypeScriptTypes(raw.replace(/^import.*;\n/gm,''))).toString('base64'));
 const old=process.env.OWNER_TELEGRAM_CHAT_IDS;process.env.OWNER_TELEGRAM_CHAT_IDS='8262729456';
 try {
  assert.equal(mod.escalationReason('hi','Hello'),null);
  assert.ok(mod.escalationReason('Can I talk to the owner?','Contact us'));
  const p={sessionId:'test-session',userMessage:'Refund please contact test@example.com +254712345678',assistantMessage:'Please contact Essenshea'};
  await mod.recordCustomerEscalation(p);assert.equal(rows.length,1);assert.equal(rows[0].notification_status,'pending');assert.equal(sent.length,0);
  fail=false;rows[0].next_attempt_at=new Date(0).toISOString();await mod.recordCustomerEscalation(p);assert.equal(rows.length,1);assert.equal(sent.length,1);assert.equal(sent[0][0],8262729456);assert.doesNotMatch(sent[0][1],/test@example.com|254712345678/);
  await mod.recordCustomerEscalation(p);assert.equal(sent.length,1);
  rows.length=0;sent.length=0;
  await Promise.all(Array.from({length:8},()=>mod.recordCustomerEscalation(p)));
  assert.equal(rows.length,1);assert.equal(sent.length,1,'concurrent delivery workers must respect the lease');
 }finally {if(old===undefined)delete process.env.OWNER_TELEGRAM_CHAT_IDS;else process.env.OWNER_TELEGRAM_CHAT_IDS=old;delete (globalThis as any).__escalationTest;}
});
