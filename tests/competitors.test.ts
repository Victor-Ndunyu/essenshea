import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {COMPETITORS,robotsAllow,parseCompetitorProducts,compareCompetitor,fetchCompetitor} from '../lib/competitor-sources.ts';
const html='Shopify.currency = {"active":"KES","rate":"1.0"}';
const raw={products:[{title:'Shea Body Butter 250ml',handle:'shea',variants:[{id:123,title:'250ml',price:'1200.00',compare_at_price:null}]}]};
const evidence=()=>parseCompetitorProducts(raw,html,COMPETITORS[0]);
const mocks={COMPETITORS,compareCompetitor};
(globalThis as any).__competitors=mocks;
const source=await readFile(new URL('../lib/competitor-intelligence.ts',import.meta.url),'utf8');
const code=stripTypeScriptTypes(source.replace(/^import[\s\S]*?;\s*/gm,''));
const mod=await import('data:text/javascript;base64,'+Buffer.from('const {COMPETITORS,compareCompetitor}=globalThis.__competitors;\n'+code).toString('base64'));
test('robots respects exclusions, most specific allow, wildcard and source-specific agent',()=>{
 assert.equal(robotsAllow('User-agent: *\nDisallow: /','/products.json'),false);
 assert.equal(robotsAllow('User-agent: *\nDisallow: /\nAllow: /products','/products.json'),true);
 assert.equal(robotsAllow('User-agent: *\nDisallow: /*.json$','/products.json'),false);
 assert.equal(robotsAllow('User-agent: *\nDisallow: /\nUser-agent: EssensheaResearch\nAllow: /','/'),true);
});
test('only validated currency, prices and safe product URLs enter evidence',()=>{
 assert.equal(evidence().products[0].price,1200);assert.equal(evidence().products[0].size,'250ml');
 assert.throws(()=>parseCompetitorProducts(raw,'',COMPETITORS[0]),/currency/);
 const bad=structuredClone(raw);bad.products[0].variants[0].price='NaN';assert.throws(()=>parseCompetitorProducts(bad,html,COMPETITORS[0]),/validated/);
 bad.products[0].handle='../admin';assert.throws(()=>parseCompetitorProducts(bad,html,COMPETITORS[0]),/validated/);
});
test('baseline, price changes, unknown launches and sample omissions are honest',()=>{
 const first=evidence();assert.match(compareCompetitor(first)[0],/baseline/);
 const second=structuredClone(first);second.products[0].price=1300;
 assert.match(compareCompetitor(second,first)[0],/1200 → 1300/);
 second.products[0].size='500ml';assert.match(compareCompetitor(second,first)[0],/No observed/);
 second.products[0].key='new';assert.match(compareCompetitor(second,first)[0],/not a verified launch/);
 second.products=[];assert.doesNotMatch(compareCompetitor(second,first).join(),/removed|discontinued|delisted/);
});
test('bounded source fetch refuses off-site redirects, oversized data and robots denial',async()=>{
 let calls=0;
 await assert.rejects(fetchCompetitor(COMPETITORS[0],(async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://evil.invalid/'}});}) as typeof fetch),/outside/);
 assert.equal(calls,1);
 await assert.rejects(fetchCompetitor(COMPETITORS[0],(async()=>new Response('x'.repeat(1500001))) as typeof fetch),/limit/);
 await assert.rejects(fetchCompetitor(COMPETITORS[0],(async()=>new Response('User-agent: *\nDisallow: /')) as typeof fetch),/allow/);
});
test('valid source scan yields an explicitly capped sample',async()=>{
 const big={products:Array.from({length:100},()=>raw.products[0])};
 const fetched=await fetchCompetitor(COMPETITORS[0],(async(url:any)=>new Response(String(url).endsWith('robots.txt')?'User-agent: *\nAllow: /':String(url).includes('products.json')?JSON.stringify(big):html)) as typeof fetch);
 assert.equal(fetched.sampled,true);assert.equal(fetched.products.length,100);
});
test('last successful evidence survives outages but stale evidence cannot support advice',()=>{
 const now=Date.parse('2026-10-29T12:00:00Z');const row={competitor_id:'ythera',status:'ok',evidence:evidence(),captured_at:'2026-10-28T12:00:00Z'};
 const facts=mod.competitorFacts([{...row,status:'unavailable',evidence:null,captured_at:'2026-10-29T11:00:00Z'},row],now);
 assert.equal(facts.fresh,true);assert.deepEqual(facts.freshSources,[1]);assert.match(facts.text,/Latest fetch failed/);
 const stale=mod.competitorFacts([{...row,captured_at:'2026-10-01T12:00:00Z'}],now);assert.equal(stale.fresh,false);assert.match(stale.text,/STALE/);
});
test('nudges do not interrupt actions, complaints, failures, photos or competitor reviews',()=>{
 for(const text of ['confirm order','cancel','move turmeric','I have a complaint','payment failed','/competitors','what are competitor trends?','review categories'])assert.equal(mod.canNudgeCompetitors(text,'Ready'),false,text);
 assert.equal(mod.canNudgeCompetitors('hi','approval preview'),false);
 assert.equal(mod.canNudgeCompetitors('hi','Ready',true),false);
 assert.equal(mod.canNudgeCompetitors('hi','Ready',false,true),false);
 assert.equal(mod.canNudgeCompetitors('how is business','Ready'),true);
 assert.equal(mod.isCompetitorRequest('what can we improve based on competitors?'),true);
});
test('cron rejects missing and incorrect authorization before scanning',async()=>{
 let calls=0;(globalThis as any).__cron={scanCompetitors:async()=>{calls++;return {scanned:2,failed:0,skipped:false};},secretsMatch:(a:string,b:string)=>a===b};
 const raw=await readFile(new URL('../app/api/cron/competitors/route.ts',import.meta.url),'utf8');
 const code=stripTypeScriptTypes(raw.replace(/^import[\s\S]*?;\s*/gm,''));
 const cron=await import('data:text/javascript;base64,'+Buffer.from('const {scanCompetitors,secretsMatch}=globalThis.__cron;\n'+code).toString('base64'));
 const saved=process.env.CRON_SECRET;process.env.CRON_SECRET='test-only';
 try {
 assert.equal((await cron.GET(new Request('https://test/'))).status,401);
 assert.equal((await cron.GET(new Request('https://test/',{headers:{authorization:'Bearer wrong'}}))).status,401);assert.equal(calls,0);
 assert.equal((await cron.GET(new Request('https://test/',{headers:{authorization:'Bearer test-only'}}))).status,200);assert.equal(calls,1);
 }finally{if(saved===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=saved;}
});
