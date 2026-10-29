import { unsafeActionClaim, answerCatalogQuestion, orderConfirmationHelp } from '../lib/owner-answers.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { mergeCatalogData } from '../lib/catalog-merge.ts';
import { parseNaturalOwnerMutation, parseOwnerActionApproval, parseNaturalOwnerApproval, looksLikeOwnerMutation, ownerErrorReply } from '../lib/owner-command.ts';
import { parseTelegramOwnerIds } from '../lib/security.ts';
import { cleanReviewText } from '../lib/review-text.ts';
import { parseProductEdit, productRecord, productEditPreview, ownerMoney, ownerStock } from '../lib/product-edit.ts';

test('owner edit flow previews, confirms once, rejects outsiders and stale edits, and cancels safely', async () => {
 const env = process.env.OWNER_TELEGRAM_CHAT_IDS;
 process.env.OWNER_TELEGRAM_CHAT_IDS = '8772114050';
 const base = { categories: [{ slug:'carrier-oils', title:'Carrier Oils', products:[{slug:'amla-oil',name:'Amla Oil',description:'Original',price:'KSh 500',priceValue:500,image:'/oil.jpg',stock:8}] }, {slug:'haircare',title:'Haircare',products:[{slug:'hair-balm',name:'Hair Balm',description:'Hair care',price:'KSh 200',priceValue:200,image:'/balm.jpg',stock:3}]}] };
 let failDb=false;let failCatalog=false;let failModels=false;let failMemory=false;
 let modelAnswer = ''; let modelAttempts: any[]=[]; let modelCalls=0;
 const notes: any[]=[];
 const orderRows:any[]=[{reference:'ESS-20261019-TEST',status:'new',payment_status:'awaiting_confirmation',fulfilment_method:'pickup',updated_at:'original',total_amount:null,delivery_location:null}];
 const events: any[] = []; let saved: any = null; let rpcMode = ''; let rpcCalls = 0; let failCompletionAudit = false; let failReview = false; const reviews: any[] = [];
 const snapshot = () => mergeCatalogData(base, saved ? [saved] : [], true);
 const resolve = async (query: string) => {
  const category = snapshot().catalog.categories.find(c=>c.products.length)!;
  if(query === 'oil') return {status:'ambiguous',matches:[{category,product:category.products[0]},{category,product:{...category.products[0],slug:'almond-oil',name:'Almond Oil'}}]};
  const found = snapshot().catalog.categories.flatMap(category=>category.products.map(product=>({category,product}))).find(({product})=>product.slug===query || product.name.toLowerCase()===query.toLowerCase());
  return found ? {status:'matched',match:found} : {status:'not_found',matches:[]};
 };
 const admin = {
  from(table: string) {
   const filters: Array<[string, any]> = []; let operation = 'select'; let value: any;
   const run = () => {
    if(failDb)return {data:null,error:{message:'private database diagnostic'}};
    if (failCompletionAudit && operation === 'update' && value?.event_type === 'owner_action_applied') throw new TypeError('fetch failed');
    const matches = (table === 'orders' ? orderRows : table === 'owner_agent_memory' ? notes : table === 'site_reviews' ? reviews : table === 'catalog_overrides' ? (saved ? [saved] : []) : events).filter(row => filters.every(([key,val])=>Array.isArray(val)?val.includes(row[key]):row[key]===val));
    if (table === 'site_reviews' && operation === 'insert') {
      if (failReview) return {data:null,error:{message:'fetch failed'}};
      const row = {id:'review-id-test',...value}; reviews.push(row); return {data:[row],error:null};
    }
    if(operation === 'delete') {for(const row of matches) notes.splice(notes.indexOf(row),1);}
    if(table === 'catalog_overrides' && operation === 'insert') {saved=value;return {data:[saved],error:null};}
    if(operation === 'insert') for(const row of value) events.push({id:events.length+1,...row});
    if(operation === 'update') for(const row of matches) Object.assign(row,value);
    return {data:matches,error:null};
   };
   const builder: any = {
    select(){return builder;}, eq(key: string,val: any){filters.push([key,val]);return builder;},
    in(key:string,val:any){filters.push([key,val]);return builder;},delete(){operation='delete';return builder;},
    order(){return builder;},limit(){return builder;},
    insert(rows: any){operation='insert';value=rows;return builder;},
    update(row: any){operation='update';value=row;return builder;},
    single: async()=>{const r=run();return {...r,data:r.data?.[0]||null};},
    maybeSingle: async()=>{const r=run();return {...r,data:r.data[0]||null};},
    then(resolve: any,reject: any){return Promise.resolve(run()).then(resolve,reject);}
   };return builder;
  },
  async rpc(_name: string, params: any) {
   if(_name==='owner_apply_order_patch'){const o=orderRows[0];if(o.updated_at!==params.p_expected)return {error:{message:'stale'}};Object.assign(o,{[params.p_field]:params.p_value,updated_at:'updated'});return{data:o,error:null};}
   rpcCalls++;
   if (rpcMode === 'before-write') return {error:{message:'TypeError: fetch failed'}};
   if(JSON.stringify(saved)!==JSON.stringify(params.p_expected)) return {error:{message:'Stale saved row'}};
   const old=saved;
   saved={product_slug:params.p_slug,is_new:false,sort_order:null,...params.p_row};
   events.push({id:events.length+1,event_type:'catalog_update',payload:{before:params.p_snapshot,beforeOverride:old,afterOverride:saved}});
   if (rpcMode === 'lost-response') throw new TypeError('fetch failed');
   return {data:saved,error:null};
  }
 };
 const orderRaw=await readFile(new URL('../lib/owner-orders.ts',import.meta.url),'utf8');
 (globalThis as any).__orderFlowDb=admin;
 const orderMod=await import('data:text/javascript;base64,'+Buffer.from('const getSupabaseAdmin=()=>globalThis.__orderFlowDb;\n'+stripTypeScriptTypes(orderRaw.replace(/^import.*;\n/gm,''))).toString('base64'));
 const {parseOrderMutation,prepareOrderEdit,applyOrderEdit,orderDetails,mostOrderedProducts}=orderMod;
 const mocks: any = {isCompetitorRequest:()=>false,canNudgeCompetitors:()=>false,prepareOrderEdit,applyOrderEdit,orderDetails,mostOrderedProducts,customerLearningContext:async()=>'No customer signals',parseOrderMutation,unsafeActionClaim,answerCatalogQuestion,orderConfirmationHelp,cleanReviewText,getSupabaseAdmin:()=>admin,resolveCatalogProduct:resolve,slugifyCatalogValue:(s: string)=>s.toLowerCase().replace(/\s/g,'-'),getMergedCatalog:async()=>snapshot().catalog,getCatalogSnapshot:async()=>{const result=snapshot();if(failCatalog)result.issues.push({code:'unverified_live_data',message:'Unavailable'});return result;},parseNaturalOwnerMutation,parseOwnerActionApproval,parseNaturalOwnerApproval,looksLikeOwnerMutation,ownerErrorReply,parseProductEdit,productRecord,productEditPreview,ownerMoney,ownerStock,parseTelegramOwnerIds,saveOwnerMemory:async(chatId:number,type:string,content:string)=>{if(failMemory)return false;if(type==='owner_note')notes.push({id:'00000000-0000-4000-8000-'+String(notes.length+1).padStart(12,'0'),telegram_chat_id:chatId,memory_type:type,content});return true;},loadRecentOwnerConversation:async()=>[],retrieveOwnerMemory:async()=>'',formatConversationMemory:()=>'',callChatModel:async()=>{modelCalls++;if(failModels)throw new Error('simulated outage');return {content:modelAnswer,provider:'test',model:'test'};},getRuntimeModelAttempts:async()=>modelAttempts,isModelCoolingDown:()=>false,MODEL_CHAIN_BUDGET_MS:28000,percentageChange:()=>'',formatCatalogHealth:()=>'',formatLowStock:()=>'',formatOwnerBusinessContext:()=>'',formatRecentOrders:()=>'',loadOwnerBusinessData:async()=>({catalog:snapshot().catalog,recentOrders:[],ecoRewards:{activeAccounts:2,availableRewards:1}})};
 const key='__essensheaOwnerEditTest';
 (globalThis as any)[key]=mocks;
 try {
  const raw=await readFile(new URL('../lib/owner-agent.ts',import.meta.url),'utf8');
  const code=stripTypeScriptTypes(raw.trimStart().replace(/^import[\s\S]*?;\s*/gm,''),{mode:'strip'});
  const bindings='import { randomBytes } from "node:crypto";\nconst {'+Object.keys(mocks).join(',')+'}=globalThis.'+key+';\n';
  const mod=await import('data:text/javascript;base64,'+Buffer.from(bindings+code).toString('base64'));
  const owner=8772114050;
  const legacyOwner = process.env.OWNER_TELEGRAM_CHAT_ID;
  try {
   process.env.OWNER_TELEGRAM_CHAT_ID = '8262729456';
   assert.equal(mod.isOwnerTelegramChat(8772114050), true);
   assert.equal(mod.isOwnerTelegramChat(8262729456), false);
   process.env.OWNER_TELEGRAM_CHAT_IDS = '';
   assert.equal(mod.isOwnerTelegramChat(8262729456), false);
   process.env.OWNER_TELEGRAM_CHAT_IDS = 'invalid';
   assert.equal(mod.isOwnerTelegramChat(8262729456), false);
   delete process.env.OWNER_TELEGRAM_CHAT_IDS;
   assert.equal(mod.isOwnerTelegramChat(8262729456), true);
  } finally {
   process.env.OWNER_TELEGRAM_CHAT_IDS = '8772114050';
   if(legacyOwner===undefined) delete process.env.OWNER_TELEGRAM_CHAT_ID;
   else process.env.OWNER_TELEGRAM_CHAT_ID=legacyOwner;
  }
  const denied=await mod.handleOwnerTelegramCommand({chatId:8262729456,text:'/setprice Amla Oil | 850'});
  assert.equal(denied.handled,false);assert.equal(events.length,0);
  const orderPreview=await mod.handleOwnerTelegramCommand({chatId:owner,text:'confirm order ESS-20261019-TEST'});
  assert.match(orderPreview.response,/new → confirmed/);assert.equal(orderRows[0].status,'new');
  const orderApproved=await mod.handleOwnerTelegramCommand({chatId:owner,text:'Proceed'});
  assert.match(orderApproved.response,/updated and verified/);assert.equal(orderRows[0].status,'confirmed');assert.equal(orderRows[0].payment_status,'awaiting_confirmation');
  events.length=0;
  const ambiguous=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/setprice oil | 850'});
  assert.equal(saved,null);assert.match(ambiguous.response,/Choose the exact product/);
  const selectionToken=ambiguous.response.match(/\/choose ([A-F0-9]{8}) 1/)[1];
  const outsider=await mod.handleOwnerTelegramCommand({chatId:8262729456,text:'/choose '+selectionToken+' 1'});assert.equal(outsider.handled,false);
  const selection=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/choose '+selectionToken+' 1'});
  assert.match(selection.response,/Approve within/);assert.equal(saved,null);
  const selectionReplay=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/choose '+selectionToken+' 1'});assert.match(selectionReplay.response,/already been used/);
  const expired=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/setprice Amla Oil | 820'});
  const expiredToken=expired.response.match(/\/confirm ([A-F0-9]{8})/)[1];
  events.find(row=>row.payload?.token===expiredToken).payload.expiresAt=new Date(0).toISOString();
  const expiredResult=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/confirm '+expiredToken});assert.match(expiredResult.response,/expired/);assert.equal(saved,null);
  const preview=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/edit Amla Oil | price=850 | stock=12 | labels=Hair growth'});
  assert.equal(saved,null);assert.match(preview.response,/price value: 500 → 850/);
  const token=preview.response.match(/\/confirm ([A-F0-9]{8})/)[1];
  const applied=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/confirm '+token});
  assert.equal(applied.failed,undefined);assert.match(applied.response,/updated and verified/);assert.equal(saved.price_value,850);assert.equal(saved.stock,12);
  await mod.handleOwnerTelegramCommand({chatId:owner,text:'/confirm '+token});
  assert.equal(events.filter(row=>row.event_type==='catalog_update').length,1);
  const next=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/setprice Amla Oil | 900'});
  const nextToken=next.response.match(/\/confirm ([A-F0-9]{8})/)[1];
  saved={...saved,stock:15};
  const stale=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/confirm '+nextToken});
  assert.equal(stale.failed,true);assert.match(stale.response,/changed after the preview/);assert.equal(saved.price_value,850);
  assert.equal(events.filter(row=>row.event_type==='owner_action_failed').length,1);
  const cancel=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/setprice Amla Oil | 950'});
  const cancelToken=cancel.response.match(/\/confirm ([A-F0-9]{8})/)[1];
  await mod.handleOwnerTelegramCommand({chatId:owner,text:'/cancel '+cancelToken});
  await mod.handleOwnerTelegramCommand({chatId:owner,text:'/confirm '+cancelToken});
  assert.equal(saved.price_value,850);

  // Round 5: every product-edit field and legacy shortcut is previewed before a verified save.
  const fieldCases: Array<[string,string,unknown]> = [
   ['/setprice Amla Oil | 0','price_value',0],
   ['/setname Amla Oil | Amla Premium Oil','product_name','Amla Premium Oil'],
   ['/setcategory Amla Oil | Haircare','category_slug','haircare'],
   ['/setlabels Amla Oil | Hair growth; Scalp comfort','best_for',['Hair growth','Scalp comfort']],
   ['/setbenefits Amla Oil | Test benefit','benefits',['Test benefit']],
   ['/setingredients Amla Oil | test ingredients','ingredients','test ingredients'],
   ['/setsize Amla Oil | 100ml','size_text','100ml'],
   ['/setvariants Amla Oil | 100ml:500;250ml:800','variants',[{size:'100ml',priceValue:500,price:'KSh 500'},{size:'250ml',priceValue:800,price:'KSh 800'}]],
   ['/edit Amla Oil | concerns=dry-skin;glow','concerns',['dry-skin','glow']],
   ['/stock Amla Oil | 0','stock',0],
   ['/available Amla Oil | 6','stock',6],
   ['/order Amla Oil','available_by_order',true],
   ['/setdesc Amla Oil | Updated test description','description','Updated test description'],
   ['/hide Amla Oil','hidden',true],
  ];
  for(const [command,key,expected] of fieldCases) {
   events.length=0;saved=null;
   const preview=await mod.handleOwnerTelegramCommand({chatId:owner,text:command});
   assert.match(preview.response,/Approve within/,command);assert.equal(saved,null);
   const confirm=await mod.handleOwnerTelegramCommand({chatId:owner,text:'Proceed'});
   assert.match(confirm.response,/updated and verified/,command);assert.deepEqual(saved[key],expected,command);
  }
  events.length=0;
  assert.match((await mod.handleOwnerTelegramCommand({chatId:owner,text:'/show Amla Oil'})).response,/Approve within/);
  assert.match((await mod.handleOwnerTelegramCommand({chatId:owner,text:'Proceed'})).response,/updated and verified/);assert.equal(saved.hidden,false);
  events.length=0;saved=null;
  const image=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/setimage Amla Oil',photos:[{file_id:'test-photo',file_size:500}]});
  assert.match(image.response,/Approve within/);assert.equal(saved,null);
  const imageSaved=await mod.handleOwnerTelegramCommand({chatId:owner,text:'Proceed'});
  assert.match(imageSaved.response,/image has been updated/);assert.equal(saved.image_url,'/api/catalog/image?fileId=test-photo');
  events.length=0;saved=null;
  const add=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/addproduct Haircare | Test Balm | KSh 600 | Test description'});
  assert.match(add.response,/Approve within/);assert.equal(saved,null);
  assert.match((await mod.handleOwnerTelegramCommand({chatId:owner,text:'Proceed'})).response,/has been added/);
  assert.equal(saved.product_name,'Test Balm');assert.equal(saved.available_by_order,true);
  const duplicateAdd=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/addproduct Haircare | Test Balm | KSh 600 | Test description'});
  assert.equal(duplicateAdd.failed,true);
  events.length=0;saved=null;
  for(const command of ['/addreview Name','/stock Amla Oil | 1.5','/setprice Amla Oil | -9','/setimage Amla Oil','/edit Amla Oil | variants=100ml:500;100ml:600']) {
   const invalid=await mod.handleOwnerTelegramCommand({chatId:owner,text:command});
   assert.equal(events.filter(e=>e.event_type==='owner_action_pending').length,0,command);assert.equal(saved,null);
  }

  // Memory deletion approves a fixed set, excluding notes added after the preview.
  events.length=0;saved=null;
  await mod.handleOwnerTelegramCommand({chatId:owner,text:'/remember test preference one'});
  const forget=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/forget test preference'});
  assert.match(forget.response,/Matching notes: 1/);assert.equal(notes.length,1);
  await mod.handleOwnerTelegramCommand({chatId:owner,text:'/remember test preference two'});
  assert.match((await mod.handleOwnerTelegramCommand({chatId:owner,text:'Proceed'})).response,/Removed 1/);
  assert.equal(notes.length,1);assert.equal(notes[0].content,'test preference two');
  events.length=0;

  events.length=0;saved=null;
  for(const [command,pattern] of [['/summary',/Total listed: 2/],['/dashboard',/Public products: 2/],['/categories',/Carrier Oils/],['/find Amla',/Amla Oil/],['/describe Amla Oil',/Stock: 8/],['/products',/Select a product/],['/help',/owner desk/]]) {
   const result=await mod.handleOwnerTelegramCommand({chatId:owner,text:String(command)});
   assert.match(result.response,pattern as RegExp,String(command));assert.equal(saved,null);
  }

  // Round 4: identical previews reuse their token; simultaneous approval claims only once.
  events.length=0;saved=null;rpcCalls=0;
  const firstPreview=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/setprice Amla Oil | 750'});
  const duplicatePreview=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/setprice Amla Oil | 750'});
  const firstToken=firstPreview.response.match(/\/confirm ([A-F0-9]{8})/)[1];
  assert.match(duplicatePreview.response,new RegExp(firstToken));
  assert.equal(events.filter(e=>e.event_type==='owner_action_pending').length,1);
  const simultaneous=await Promise.all(Array.from({length:8},()=>mod.handleOwnerTelegramCommand({chatId:owner,text:'/confirm '+firstToken})));
  assert.equal(rpcCalls,1);assert.equal(saved.price_value,750);
  assert.equal(simultaneous.filter(r=>r.response.includes('updated and verified')).length,1);
  await mod.handleOwnerTelegramCommand({chatId:owner,text:'/cancel '+firstToken});assert.equal(saved.price_value,750);
  events.length=0;saved=null;

  // Round 3: clarify, cancel, expire, correct, switch topic, and prevent model approval promises.
  for(const reply of ['Haircare','hair-care','Actually, Haircare','I meant Haircare.']) {
   events.length=0;saved=null;
   await mod.handleOwnerTelegramCommand({chatId:owner,text:'Move Amla Oil to Body Care'});
   const clarify=await mod.handleOwnerTelegramCommand({chatId:owner,text:reply});
   assert.match(clarify.response,/Approve within/,reply);assert.equal(saved,null);
  }
  events.length=0;
  await mod.handleOwnerTelegramCommand({chatId:owner,text:'Move Amla Oil to Body Care'});
  const typo=await mod.handleOwnerTelegramCommand({chatId:owner,text:'Haircaer'});assert.match(typo.response,/still need an existing category/);
  const tooEarly=await mod.handleOwnerTelegramCommand({chatId:owner,text:'Proceed'});assert.match(tooEarly.response,/No approval preview exists/);assert.equal(saved,null);
  const cancelledQuestion=await mod.handleOwnerTelegramCommand({chatId:owner,text:'Cancel'});assert.match(cancelledQuestion.response,/Cancelled the category request/);
  assert.equal(events.filter(e=>e.event_type==='owner_clarification_pending').length,0);
  await mod.handleOwnerTelegramCommand({chatId:owner,text:'Move Amla Oil to Body Care'});
  events.find(e=>e.event_type==='owner_clarification_pending').payload.expiresAt=new Date(0).toISOString();
  assert.match((await mod.handleOwnerTelegramCommand({chatId:owner,text:'Haircare'})).response,/expired/);
  await mod.handleOwnerTelegramCommand({chatId:owner,text:'Move Amla Oil to Body Care'});
  await mod.handleOwnerTelegramCommand({chatId:owner,text:'/describe Amla Oil'});
  assert.equal(events.filter(e=>e.event_type==='owner_clarification_pending').length,0);
  assert.match((await mod.handleOwnerTelegramCommand({chatId:owner,text:'/stock'})).response,/incomplete or unsupported/);
  assert.match((await mod.handleOwnerTelegramCommand({chatId:owner,text:'Hi'})).response,/owner desk is ready/);
  assert.equal(modelCalls,0,'greetings, commands and clarification must work without AI');
  modelAttempts=[{provider:'test',model:'test'}];
  for(const answer of ['Please confirm you would like to proceed.', 'I have updated the product.', 'I prepared the change. Approve within 10 minutes: /confirm ABCDEF12']) {
   modelAnswer=answer;
   assert.match((await mod.handleOwnerTelegramCommand({chatId:owner,text:'What can you do for me?'})).response,/not prepared or applied/);
  }
  modelAnswer='Stock is unknown for this product.';
  assert.equal((await mod.handleOwnerTelegramCommand({chatId:owner,text:'What do you know about my stock?'})).response,modelAnswer);
  modelAttempts=[];modelCalls=0;events.length=0;

  // Exact screenshot, persisted between separate handler calls.
  base.categories.push({slug:'mens-care',title:'Mens Care',products:[{slug:'turmeric-scrub',name:'Turmeric Scrub',description:'Scrub',price:'KSh 500',priceValue:500,image:'/scrub.jpg',stock:8}]});
  base.categories.push({slug:'body-scrubs',title:'Body Scrubs',products:[]});
  saved=null;events.length=0;rpcCalls=0;
  const categoryQuestion=await mod.handleOwnerTelegramCommand({chatId:owner,text:'I want to change the turmeric scrub from mens care to body care'});
  assert.match(categoryQuestion.response,/Choose an existing category/);
  assert.equal(events.filter(e=>e.event_type==='owner_action_pending').length,0);
  const bodyScrubs=await mod.handleOwnerTelegramCommand({chatId:owner,text:'Body scrubs'});
  assert.match(bodyScrubs.response,/category slug: mens-care → body-scrubs/);
  assert.match(bodyScrubs.response,/Approve within/);assert.equal(saved,null);
  const proceeded=await mod.handleOwnerTelegramCommand({chatId:owner,text:'Proceed'});
  assert.match(proceeded.response,/updated and verified/);assert.equal(saved.category_slug,'body-scrubs');assert.equal(rpcCalls,1);
  await mod.handleOwnerTelegramCommand({chatId:owner,text:'Proceed'});assert.equal(rpcCalls,1);
  base.categories.splice(2);

  // Reproduce the owner's unsupported request and repeated Proceed messages.
  saved = null; events.length = 0; rpcCalls = 0;
  const noPreview = await mod.handleOwnerTelegramCommand({chatId:owner,text:'Proceed'});
  assert.match(noPreview.response,/no active approval preview/);
  const unsupported = await mod.handleOwnerTelegramCommand({chatId:owner,text:'I want to reorganise all the products'});
  assert.equal(rpcCalls,0);
  const natural = await mod.handleOwnerTelegramCommand({chatId:owner,text:'I want to change the Amla Oil from carrier oils to haircare'});
  assert.match(natural.response,/Approve within/);
  const go = await mod.handleOwnerTelegramCommand({chatId:owner,text:'I would like to proceed'});
  assert.match(go.response,/updated and verified/); assert.equal(saved.category_slug,'haircare'); assert.equal(rpcCalls,1);
  const repeat = await mod.handleOwnerTelegramCommand({chatId:owner,text:'Proceed'});
  assert.match(repeat.response,/no active approval preview/); assert.equal(rpcCalls,1);
  const unknownCategory = await mod.handleOwnerTelegramCommand({chatId:owner,text:'Move Amla Oil to Body Care'});
  assert.match(unknownCategory.response,/Choose an existing category/); assert.equal(rpcCalls,1);
  const clarified = await mod.handleOwnerTelegramCommand({chatId:owner,text:'Carrier Oils'});
  assert.match(clarified.response,/Approve within/);
  assert.equal(saved.category_slug,'haircare','clarification must not mutate before approval');
  const clarifiedResult = await mod.handleOwnerTelegramCommand({chatId:owner,text:'Proceed'});
  assert.match(clarifiedResult.response,/updated and verified/);
  assert.equal(saved.category_slug,'carrier-oils');
  assert.equal(rpcCalls,2);
  // Restore fixture so existing outage scenarios retain their expected call counts.
  rpcCalls=1;
  const unknownEdit = await mod.handleOwnerTelegramCommand({chatId:owner,text:'Please change the website colours'});
  assert.match(unknownEdit.response,/not prepared an edit/); assert.equal(rpcCalls,1);
  const p1 = await mod.handleOwnerTelegramCommand({chatId:owner,text:'Change the price of Amla Oil to 900'});
  const p2 = await mod.handleOwnerTelegramCommand({chatId:owner,text:'Change the stock of Amla Oil to 12'});
  const unclear = await mod.handleOwnerTelegramCommand({chatId:owner,text:'Go ahead'});
  assert.match(unclear.response,/more than one active preview/); assert.equal(rpcCalls,1);
  for (const p of [p1,p2]) await mod.handleOwnerTelegramCommand({chatId:owner,text:'/cancel '+p.response.match(/\/confirm ([A-F0-9]{8})/)[1]});
  // A committed write with a lost response must be reconciled, never replayed.
  const lost = await mod.handleOwnerTelegramCommand({chatId:owner,text:'Change the price of Amla Oil to 920'});
  rpcMode = 'lost-response'; failCompletionAudit = true;
  const recovered = await mod.handleOwnerTelegramCommand({chatId:owner,text:'Proceed'});
  assert.match(recovered.response,/updated and verified/); assert.equal(saved.price_value,920); assert.equal(rpcCalls,2);
  await mod.handleOwnerTelegramCommand({chatId:owner,text:'/confirm '+lost.response.match(/\/confirm ([A-F0-9]{8})/)[1]});
  assert.equal(rpcCalls,2);
  rpcMode = 'before-write'; failCompletionAudit = false;
  const failedPreview = await mod.handleOwnerTelegramCommand({chatId:owner,text:'Change the price of Amla Oil to 930'});
  const failed = await mod.handleOwnerTelegramCommand({chatId:owner,text:'/confirm '+failedPreview.response.match(/\/confirm ([A-F0-9]{8})/)[1]});
  assert.equal(failed.failed,true); assert.doesNotMatch(failed.response,/fetch failed/); assert.match(failed.response,/could not verify/); assert.equal(saved.price_value,920);

  rpcMode = ''; events.length = 0;
  const reviewPreview = await mod.handleOwnerTelegramCommand({chatId:owner,text:'/addreview Reviewer | Customer | A lovely scrub.'});
  failReview = true;
  const reviewFail = await mod.handleOwnerTelegramCommand({chatId:owner,text:'Proceed'});
  assert.equal(reviewFail.failed,true); assert.doesNotMatch(reviewFail.response,/fetch failed/); assert.equal(reviews.length,0);
  assert.equal(events.filter(e=>e.event_type==='owner_action_applied').length,0);
  assert.equal(events.filter(e=>e.event_type==='owner_action_failed').length,1);
  failReview = false;
  const reviewAgain = await mod.handleOwnerTelegramCommand({chatId:owner,text:'/addreview Reviewer | Customer | A lovely scrub.'});
  const reviewSaved = await mod.handleOwnerTelegramCommand({chatId:owner,text:'Proceed'});
  assert.match(reviewSaved.response,/Review added/); assert.equal(reviews.length,1);
  const reviewList = await mod.handleOwnerTelegramCommand({chatId:owner,text:'/reviews'});
  assert.match(reviewList.response,/review-id-test/);
  const hideReview=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/delreview review-id-test'});
  assert.match(hideReview.response,/Approve within/);
  assert.notEqual(reviews[0].is_visible,false);
  assert.match((await mod.handleOwnerTelegramCommand({chatId:owner,text:'Proceed'})).response,/hidden from the site/);
  assert.equal(reviews[0].is_visible,false);
  await mod.handleOwnerTelegramCommand({chatId:owner,text:'/confirm '+reviewAgain.response.match(/\/confirm ([A-F0-9]{8})/)[1]});
  assert.equal(reviews.length,1);
  // Round 6: failures must not produce a fake preview, fake success, or a replay.
  events.length=0;saved=null;
  failCatalog=true;
  const unavailableCatalog=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/setprice Amla Oil | 850'});
  assert.equal(unavailableCatalog.failed,true);assert.equal(events.filter(e=>e.event_type==='owner_action_pending').length,0);
  failCatalog=false;failDb=true;
  assert.match((await mod.handleOwnerTelegramCommand({chatId:owner,text:'Hi'})).response,/owner desk is ready/);
  assert.match((await mod.handleOwnerTelegramCommand({chatId:owner,text:'/help'})).response,/owner desk/);
  const dbFailure=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/setprice Amla Oil | 850'});
  assert.equal(dbFailure.failed,true);assert.doesNotMatch(dbFailure.response,/private database diagnostic/);assert.equal(saved,null);
  failDb=false;failMemory=true;
  const noteFailure=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/remember outage note'});
  assert.equal(noteFailure.failed,true);assert.doesNotMatch(noteFailure.response,/Saved to owner memory/);
  failMemory=false;failModels=true;modelCalls=0;modelAttempts=[{provider:'one',model:'a'},{provider:'two',model:'b'},{provider:'three',model:'c'}];
  const outage=await mod.handleOwnerTelegramCommand({chatId:owner,text:'How is my business doing this week?'});
  assert.match(outage.response,/could not reach the conversational assistant/);assert.equal(modelCalls,3);assert.equal(saved,null);
  const offlineEdit=await mod.handleOwnerTelegramCommand({chatId:owner,text:'/setprice Amla Oil | 880'});
  assert.match(offlineEdit.response,/Approve within/);
  assert.match((await mod.handleOwnerTelegramCommand({chatId:owner,text:'Proceed'})).response,/updated and verified/);assert.equal(saved.price_value,880);
 } finally {
  delete (globalThis as any)[key];
  if(env===undefined)delete process.env.OWNER_TELEGRAM_CHAT_IDS;else process.env.OWNER_TELEGRAM_CHAT_IDS=env;
 }
});
