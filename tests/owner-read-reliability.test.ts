import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { mergeCatalogData } from '../lib/catalog-merge.ts';

async function loadModule(file:string, mocks:Record<string,unknown>) {
  const key='__readReliability'+file.replace(/\W/g,'');
  (globalThis as any)[key]=mocks;
  const source=await fs.readFile(new URL('../lib/'+file,import.meta.url),'utf8');
  const code=stripTypeScriptTypes(source.trimStart().replace(/^import[\s\S]*?;\s*/gm,''),{mode:'strip'});
  try {
    return await import('data:text/javascript;base64,'+Buffer.from('const {'+Object.keys(mocks).join(',')+'}=globalThis.'+key+';\n'+code).toString('base64'));
  } finally { delete (globalThis as any)[key]; }
}

test('owner catalogue reads fail closed when saved edits cannot be loaded',async()=>{
  let unavailable=true;
  const query:any={select:()=>query,order:()=>query,then:(resolve:any)=>Promise.resolve({data:[{product_slug:'300g-turmeric-face-and-body-scrub',category_slug:'body-scrubs',product_name:'300g Turmeric Face & Body Scrub',is_new:true}],error:unavailable?{message:'Unavailable'}:null}).then(resolve)};
  const mod=await loadModule('catalog.ts',{fs,path,mergeCatalogData,getSupabaseAdmin:()=>({from:()=>query})});
  const degraded=await mod.getCatalogSnapshot();
  assert.ok(degraded.issues.some((issue:any)=>issue.code==='unverified_live_data'));
  await assert.rejects(mod.getMergedCatalog({requireVerified:true}),/Live catalogue data is unavailable/);
  await assert.rejects(mod.resolveCatalogProduct('Amla Oil',{requireVerified:true}),/Live catalogue data is unavailable/);
  unavailable=false;
  assert.equal((await mod.resolveCatalogProduct('Amla Oil',{requireVerified:true})).status,'matched');
  assert.equal((await mod.resolveCatalogProduct('tumeric scrub',{requireVerified:true})).status,'matched');
  assert.equal((await mod.resolveCatalogProduct('zzzzzzqqqqqq',{requireVerified:true})).status,'not_found');
});

test('missing order and reward data is reported as unavailable, never zero activity',async()=>{
  const mod=await loadModule('owner-data.ts',{
    fs:{readFile:async()=>'<p>Verified page</p>'},path,
    getCatalogSnapshot:async()=>({catalog:{categories:[]},issues:[]}),
    getSupabaseAdmin:()=>{throw new Error('private diagnostic');},
    formatSiteFacts:()=>'',ownerLowStockThreshold:()=>3,
  });
  const data=await mod.loadOwnerBusinessData();
  assert.ok(data.unavailable.includes('orders'));
  assert.ok(data.unavailable.includes('reviews'));
  assert.equal(data.ecoRewards.activeAccounts,null);
  assert.match(mod.formatRecentOrders(data),/data is unavailable/);
  assert.match(mod.formatOwnerBusinessContext(data),/do not infer a zero count/);
  assert.doesNotMatch(mod.formatOwnerBusinessContext(data),/private diagnostic/);
});

test('owner note storage reports returned database errors and thrown failures honestly',async()=>{
  let mode='error';
  const mod=await loadModule('agent-memory.ts',{getSupabaseAdmin:()=>({from:()=>({insert:async()=>{
    if(mode==='throw') throw new Error('transport');
    return {error:mode==='error'?{message:'DB rejected insert'}:null};
  }})})});
  assert.equal(await mod.saveOwnerMemory(8262729456,'owner_note','test'),false);
  mode='throw';assert.equal(await mod.saveOwnerMemory(8262729456,'owner_note','test'),false);
  mode='ok';assert.equal(await mod.saveOwnerMemory(8262729456,'owner_note','test'),true);
  assert.equal(await mod.saveOwnerMemory(8262729456,'owner_note',' '),false);
});
