import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { answerCatalogQuestion,unsafeActionClaim,orderConfirmationHelp } from '../lib/owner-answers.ts';
import { parseNaturalOwnerMutation,parseNaturalOwnerApproval,parseOwnerActionApproval,looksLikeOwnerMutation,ownerErrorReply } from '../lib/owner-command.ts';
import { parseTelegramOwnerIds } from '../lib/security.ts';
test('owner transcript retains deterministic replies, scoped questions and a stored category reminder',async()=>{
 const history:any[]=[];const notes:any[]=[];let failure=false;
 const catalog={categories:[{slug:'body',title:'Body Care',products:[...Array.from({length:7},(_,i)=>({slug:'men-'+i,name:'Tonic '+i+' for Men',priceValue:1480})),{slug:'gift',name:'Gift',priceValue:4000}]},{slug:'scrubs',title:'Body Scrubs',products:[{slug:'turmeric',name:'Turmeric Face & Body Scrub',priceValue:500}]}]};
 const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,update:()=>q,then:(f:any)=>Promise.resolve({data:[],error:null}).then(f)};
 const mocks={answerCatalogQuestion,unsafeActionClaim,orderConfirmationHelp,parseNaturalOwnerMutation,parseNaturalOwnerApproval,parseOwnerActionApproval,looksLikeOwnerMutation,ownerErrorReply,parseTelegramOwnerIds,getSupabaseAdmin:()=>({from:()=>q}),getMergedCatalog:async()=>catalog,loadRecentOwnerConversation:async()=>history.slice(-12),retrieveOwnerMemory:async()=>notes.join('\n'),saveOwnerMemory:async(_:number,type:string,content:string)=>{if(failure)return false;if(type==='owner_note')notes.push(content);else history.push({role:type==='owner_message'?'user':'assistant',content});return true;},loadOwnerBusinessData:async()=>({}),formatRecentOrders:()=> 'Order status new; payment awaiting_confirmation'};
 (globalThis as any).__transcript=mocks;
 const raw=await readFile(new URL('../lib/owner-agent.ts',import.meta.url),'utf8');
 const code=stripTypeScriptTypes(raw.replace(/^import[\s\S]*?;\s*/gm,''));
 const m=await import('data:text/javascript;base64,'+Buffer.from('const {'+Object.keys(mocks).join(',')+'}=globalThis.__transcript;\n'+code).toString('base64'));
 const previous=process.env.OWNER_TELEGRAM_CHAT_IDS;process.env.OWNER_TELEGRAM_CHAT_IDS='8262729456';
 const ask=async(text:string)=>(await m.handleOwnerTelegramCommand({chatId:8262729456,text})).response;
 try{
  assert.match(await ask('what orders are there'),/payment awaiting_confirmation/);
  assert.match(await ask('How many men products are there, can you list them for me'),/^7 /);
  assert.match(await ask('which is the most expensive'),/1,480/);
  assert.match(await ask('Hi, then what has tumeric as an ingredient'),/Turmeric Face/);
  assert.match(await ask('what categories are they'),/Body Scrubs/);
  assert.match(await ask('okay, remind me of this once this topic on categories arises again'),/Saved/);
  assert.match(await ask('/categories'),/Saved reminder/);
  assert.match(await ask('i am wondering what i need to do to comfirm an order'),/To confirm an order/);
  assert.match(await ask('what needs to be done to confirm an order'),/payment separately/);
  assert.ok(history.some(x=>x.role==='assistant'&&x.content.startsWith('7 ')));
  failure=true;assert.match(await ask('remember that we need to review categories'),/could not be saved/);
 }finally{if(previous===undefined)delete process.env.OWNER_TELEGRAM_CHAT_IDS;else process.env.OWNER_TELEGRAM_CHAT_IDS=previous;delete (globalThis as any).__transcript;}
});
