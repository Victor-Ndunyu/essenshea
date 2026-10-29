import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const id='11111111-1111-4111-8111-111111111111';
const context:any={awaiting_details:true};const decisions:any[]=[];
const row:any={id,status:'open',reason:'Order problem',question:'My order is late',answer:'Contact us',decision_history:[],follow_up_at:'2026-11-01'};
const db={from:(table:string)=>{let patch:any;const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,in:()=>q,upsert:(p:any)=>{patch=p;return q;},maybeSingle:async()=>({data:table==='owner_escalation_context'?context:row}),then:(fn:any)=>{if(patch)Object.assign(context,patch);return Promise.resolve({data:table==='customer_escalations'?[row]:context}).then(fn);}};return q;},rpc:async(name:string,args:any)=>{if(name==='decide_customer_escalation')decisions.push(args);return {data:true};}};
(globalThis as any).__workflow={getSupabaseAdmin:()=>db,redactCustomerText:(s:string)=>s,parseTelegramOwnerIds:()=>new Set([1])};
const raw=await readFile(new URL('../lib/escalation-workflow.ts',import.meta.url),'utf8');
const m=await import('data:text/javascript;base64,'+Buffer.from('const {getSupabaseAdmin,redactCustomerText,parseTelegramOwnerIds}=globalThis.__workflow;\n'+stripTypeScriptTypes(raw.replace(/^import.*;\n/gm,''))).toString('base64'));
test('owner can ask for details, select a case and persist a reasoned decision',async()=>{
 assert.match(await m.handleEscalationConversation(1,'what is it?'),/My order is late/);
 assert.equal(context.selected_id,id);
 assert.match(await m.handleEscalationConversation(1,'resolve this escalation: delivered and confirmed'),/Follow-ups stopped/);
 assert.equal(decisions[0].p_status,'resolved');assert.equal(decisions[0].p_note,'delivered and confirmed');
 assert.match(await m.handleEscalationConversation(1,`/dismiss ${id} duplicate request`),/dismissed/);
 assert.match(await m.handleEscalationConversation(1,`/reopen ${id} new evidence`),/marked open/);
 assert.match(await m.handleEscalationConversation(1,`/escalationfollowup ${id} 7 waiting for delivery`),/7 days/);
 assert.equal(decisions.at(-1).p_days,7);
});
test('ambiguous, stale and incomplete decisions never mutate a case',async()=>{
 const before=decisions.length;
 assert.match(await m.handleEscalationConversation(1,`/resolve ${id}`),/Nothing changed/);
 assert.match(await m.handleEscalationConversation(1,`/escalationfollowup ${id} 99 wait`),/Nothing changed/);
 context.selected_at='2020-01-01';
 assert.match(await m.handleEscalationConversation(1,'dismiss this escalation: irrelevant'),/Nothing changed/);
 assert.equal(await m.handleEscalationConversation(1,'the customer used a different name'),null);
 assert.equal(decisions.length,before);
});
test('closed detail includes saved decisions and explicitly stops follow-ups',()=>{
 assert.match(m.formatEscalation({...row,status:'dismissed',decision_history:[{at:'today',status:'dismissed',note:'same product, different name'}]}),/same product, different name/);
 assert.match(m.formatEscalation({...row,status:'resolved'}),/Closed; follow-ups stopped/);
});
