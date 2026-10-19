import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
test('market evidence excludes old sources, never forwards private text, and reports outages honestly',async()=>{
 const raw=await readFile(new URL('../lib/owner-research.ts',import.meta.url),'utf8');
 const m=await import('data:text/javascript;base64,'+Buffer.from('const getMergedCatalog=async()=>({categories:[]}); const getRuntimeModelAttempts=async()=>[]; const saveOwnerMemory=async()=>true; const getSupabaseAdmin=()=>({});\n'+stripTypeScriptTypes(raw.replace(/^import.*;\n/gm,''))).toString('base64'));
 const now=Date.now();
 const item=(date:string)=>`<item><title>Beauty &amp; retail</title><link>https://example.com/report</link><pubDate>${date}</pubDate><source>Example</source></item>`;
 assert.equal(m.parseMarketFeed(item(new Date(now).toISOString())+item('2020-01-01'),now).length,1);
 assert.doesNotMatch(m.marketQuery('skincare test@example.com secret-123 +254711111111'),/example|secret|254/);
 assert.deepEqual(m.customerTopics('tumeric ingredients price'),['turmeric','price','ingredients']);
 const previous=globalThis.fetch;
 try {
  globalThis.fetch=async()=>{throw Error('private provider error');};
  const answer=await m.marketResearch(1,'market');assert.match(answer,/unavailable/);assert.doesNotMatch(answer,/private provider/);
  globalThis.fetch=async()=>new Response(item(new Date().toISOString()));
  const sourced=await m.marketResearch(1,'market');assert.match(sourced,/https:\/\/example.com\/report/);assert.match(sourced,/not independently verified/);assert.match(sourced,/Saved as dated evidence/);
 }finally {globalThis.fetch=previous;}
});
