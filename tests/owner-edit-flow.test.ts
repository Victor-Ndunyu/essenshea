import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { mergeCatalogData } from '../lib/catalog-merge.ts';
import { parseNaturalOwnerMutation, parseOwnerActionApproval } from '../lib/owner-command.ts';
import { parseProductEdit, productRecord, productEditPreview, ownerMoney, ownerStock } from '../lib/product-edit.ts';

test('owner edit flow previews, confirms once, rejects outsiders and stale edits, and cancels safely', async () => {
 const env = process.env.OWNER_TELEGRAM_CHAT_IDS;
 process.env.OWNER_TELEGRAM_CHAT_IDS = '8772114050';
 const base = { categories: [{ slug:'carrier-oils', title:'Carrier Oils', products:[{slug:'amla-oil',name:'Amla Oil',description:'Original',price:'KSh 500',priceValue:500,image:'/oil.jpg',stock:8}] }] };
 const events: any[] = []; let saved: any = null;
 const snapshot = () => mergeCatalogData(base, saved ? [saved] : [], true);
 const resolve = async (query: string) => {
  const category = snapshot().catalog.categories[0];
  if(query === 'oil') return {status:'ambiguous',matches:[{category,product:category.products[0]},{category,product:{...category.products[0],slug:'almond-oil',name:'Almond Oil'}}]};
  const product = category.products.find(item => item.slug === query || item.name.toLowerCase() === query.toLowerCase());
  return product ? {status:'matched',match:{category,product}} : {status:'not_found',matches:[]};
 };
 const admin = {
  from(table: string) {
   const filters: Array<[string, any]> = []; let operation = 'select'; let value: any;
   const run = () => {
    const matches = (table === 'catalog_overrides' ? (saved ? [saved] : []) : events).filter(row => filters.every(([key,val])=>row[key]===val));
    if(operation === 'insert') for(const row of value) events.push({id:events.length+1,...row});
    if(operation === 'update') for(const row of matches) Object.assign(row,value);
    return {data:matches,error:null};
   };
   const builder: any = {
    select(){return builder;}, eq(key: string,val: any){filters.push([key,val]);return builder;},
    order(){return builder;},limit(){return builder;},
    insert(rows: any){operation='insert';value=rows;return builder;},
    update(row: any){operation='update';value=row;return builder;},
    maybeSingle: async()=>{const r=run();return {...r,data:r.data[0]||null};},
    then(resolve: any,reject: any){return Promise.resolve(run()).then(resolve,reject);}
   };return builder;
  },
  async rpc(_name: string, params: any) {
   if(JSON.stringify(saved)!==JSON.stringify(params.p_expected)) return {error:{message:'Stale saved row'}};
   const old=saved;
   saved={product_slug:params.p_slug,is_new:false,sort_order:null,...params.p_row};
   events.push({id:events.length+1,event_type:'catalog_update',payload:{before:params.p_snapshot,beforeOverride:old,afterOverride:saved}});
   return {data:saved,error:null};
  }
 };
 const mocks: any = {getSupabaseAdmin:()=>admin,resolveCatalogProduct:resolve,slugifyCatalogValue:(s: string)=>s.toLowerCase().replace(/\s/g,'-'),getMergedCatalog:async()=>snapshot().catalog,getCatalogSnapshot:async()=>snapshot(),parseNaturalOwnerMutation,parseOwnerActionApproval,parseProductEdit,productRecord,productEditPreview,ownerMoney,ownerStock,parseTelegramOwnerIds:(s: string)=>s ? s.split(',').map(Number):[],saveOwnerMemory:async()=>{},loadRecentOwnerConversation:async()=>[],retrieveOwnerMemory:async()=>'',formatConversationMemory:()=>'',callChatModel:async()=>'',getModelAttempts:()=>[],isModelCoolingDown:()=>false,MODEL_CHAIN_BUDGET_MS:28000,percentageChange:()=>'',formatCatalogHealth:()=>'',formatLowStock:()=>'',formatOwnerBusinessContext:()=>'',formatRecentOrders:()=>'',loadOwnerBusinessData:async()=>({})};
 const key='__essensheaOwnerEditTest';
 (globalThis as any)[key]=mocks;
 try {
  const raw=await readFile(new URL('../lib/owner-agent.ts',import.meta.url),'utf8');
  const code=stripTypeScriptTypes(raw.trimStart().replace(/^import[\s\S]*?;\s*/gm,''),{mode:'strip'});
  const bindings='import { randomBytes } from "node:crypto";\nconst {'+Object.keys(mocks).join(',')+'}=globalThis.'+key+';\n';
  const mod=await import('data:text/javascript;base64,'+Buffer.from(bindings+code).toString('base64'));
  const owner=8772114050;
  const denied=await mod.handleOwnerTelegramCommand({chatId:8262729456,text:'/setprice Amla Oil | 850'});
  assert.equal(denied.handled,false);assert.equal(events.length,0);
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
 } finally {
  delete (globalThis as any)[key];
  if(env===undefined)delete process.env.OWNER_TELEGRAM_CHAT_IDS;else process.env.OWNER_TELEGRAM_CHAT_IDS=env;
 }
});
