import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { callbackCommand, ownerReplyMarkup } from '../lib/telegram-ui.ts';
test('buttons use bounded, strict callback commands and preserve confirmation tokens',()=>{
 assert.equal(callbackCommand('confirm:ABCDEF12'),'/confirm ABCDEF12');
 assert.equal(callbackCommand('cancel:ABCDEF12'),'/cancel ABCDEF12');
 assert.equal(callbackCommand('choose:ABCDEF12:2'),'/choose ABCDEF12 2');
 assert.equal(callbackCommand('confirm:ABCDEF12 /hide Oil'),null);
 assert.equal(callbackCommand('product:'+'a'.repeat(80)),null);
 assert.equal(callbackCommand('choose:ABCDEF12:0'),null);
 assert.equal(ownerReplyMarkup('Approve within 10 minutes: /confirm ABCDEF12')?.inline_keyboard[0][0].callback_data,'confirm:ABCDEF12');
 assert.equal(ownerReplyMarkup('1. Amla Oil (Carrier Oils)\n/choose ABCDEF12 1')?.inline_keyboard[0][0].callback_data,'choose:ABCDEF12:1');
});
test('webhook callbacks reject outsiders, groups and invalid secrets before running owner commands',async()=>{
 const previous=process.env.TELEGRAM_WEBHOOK_SECRET;process.env.TELEGRAM_WEBHOOK_SECRET='test-secret';
 let failAck=false; let failSetup=false;
 const actions:any[]=[];const messages:any[]=[];const acknowledgements:any[]=[];
 const mocks={NextResponse:{json:(data:any,opts:any)=>({data,status:opts?.status||200})},sendTelegramMessage:async(...args:any[])=>messages.push(args),sendTypingIndicator:async()=>{},ensureTelegramCallbackUpdates:async()=>{if(failSetup)throw new Error("setup unavailable");},answerTelegramCallback:async(...args:any[])=>{if(failAck)throw new Error("expired callback");acknowledgements.push(args);},handleOwnerTelegramCommand:async(params:any)=>{if(params.chatId!==123)return{handled:false,response:''};actions.push(params);return{handled:true,response:'Approved once'};},isOwnerTelegramChat:(id:number)=>id===123,recordOperationalEvent:async()=>{},secretsMatch:(a:string,b:string)=>a===b,callbackCommand,ownerReplyMarkup};
 (globalThis as any).__telegramCallbackTest=mocks;
 try{
  const raw=await readFile(new URL('../app/api/telegram/webhook/route.ts',import.meta.url),'utf8');
  const code=stripTypeScriptTypes(raw.replace(/^import[\s\S]*?;\s*/gm,''),{mode:'strip'});
  const mod=await import('data:text/javascript;base64,'+Buffer.from('const {'+Object.keys(mocks).join(',')+'}=globalThis.__telegramCallbackTest;\n'+code).toString('base64'));
  const call=(id:number,sender:number,type:string,secret='test-secret')=>mod.POST({headers:{get:()=>secret},json:async()=>({callback_query:{id:'callback-id',data:'confirm:ABCDEF12',from:{id:sender},message:{chat:{id,type}}}})});
  assert.equal((await call(123,123,'private','bad')).status,401);
  await call(123,124,'private');await call(999,999,'private');await call(123,123,'group');assert.equal(actions.length,0);assert.equal(messages.length,0);
  await call(123,123,'private');assert.equal(actions.length,1);assert.equal(actions[0].text,'/confirm ABCDEF12');assert.equal(messages.length,1);assert.equal(acknowledgements.length,4);
  failAck=true; await call(123,123,'private'); assert.equal(actions.length,2); assert.equal(messages.length,2);
  const startCount=actions.length;
  for (const [id,sender,type] of [[999,999,'private'],[123,124,'private'],[123,123,'group'],[-123,123,'supergroup'],[123,undefined,'private'],[123,123,'channel']]) {
   await mod.POST({headers:{get:()=> 'test-secret'},json:async()=>({message:{chat:{id,type},from:{id:sender},text:'/stock Amla Oil | 99'}})});
  }
  assert.equal(actions.length,startCount,'rejected message identities must never invoke owner commands');
  failSetup=true; await mod.POST({headers:{get:()=> 'test-secret'},json:async()=>({message:{chat:{id:123,type:'private'},from:{id:123},text:'Proceed'}})});assert.equal(actions.length,3);assert.equal(actions[2].text,'Proceed');
  const longCommand='/setdesc Amla Oil | '+'description '.repeat(250);
  await mod.POST({headers:{get:()=> 'test-secret'},json:async()=>({message:{chat:{id:123,type:'private'},from:{id:123},text:longCommand}})});
  assert.equal(actions.at(-1).text,longCommand.trim(),'long valid edits must not be silently truncated');
  const beforeOversize=actions.length;
  await mod.POST({headers:{get:()=> 'test-secret'},json:async()=>({message:{chat:{id:123,type:'private'},from:{id:123},text:'x'.repeat(8001)}})});
  assert.equal(actions.length,beforeOversize);assert.match(messages.at(-1)[1],/too long/);
 }finally{delete(globalThis as any).__telegramCallbackTest;if(previous===undefined)delete process.env.TELEGRAM_WEBHOOK_SECRET;else process.env.TELEGRAM_WEBHOOK_SECRET=previous;}
});
