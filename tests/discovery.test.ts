import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { ESSENSHEA_SITE_FACTS, formatSiteFacts } from '../lib/site-facts.ts';
(globalThis as any).__discoveryFacts = { facts: ESSENSHEA_SITE_FACTS, formatSiteFacts };
const source = await readFile(new URL('../lib/discovery.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(source.replace(/^import[^;]+;\s*/gm, ''), { mode: 'strip' });
const { enhanceHtml, renderLlms, renderSitemap, productSchema, renderProductPage, catalogueLinks } = await import('data:text/javascript;base64,' + Buffer.from('const {facts,formatSiteFacts}=globalThis.__discoveryFacts;\n' + code).toString('base64'));
delete (globalThis as any).__discoveryFacts;
const product={slug:'shea-butter',name:'Shea <Butter>',description:'Body & hair care </script>',price:'KSh 500',priceValue:500,image:'/butter.jpg'};
const category={slug:'raw-butters',title:'Raw Butters',products:[product]};
const catalog={categories:[category]};
test('discovery lists public category and product pages and no private routes',()=>{
 const xml=renderSitemap(catalog);
 assert.match(xml,/<loc>https:\/\/essenshea.vercel.app\/category\/raw-butters<\/loc>/);
 assert.match(xml,/\/product\/shea-butter/);assert.doesNotMatch(xml,/account|admin|api/);
 const text=renderLlms(catalog,true);assert.match(text,/Listed price: KSh 500/);assert.match(text,/Availability: not confirmed/);assert.match(text,/Kimathi House/);
 assert.match(catalogueLinks(catalog),/href="\/product\/shea-butter"/);
});
test('product structured data never invents prices or stock',()=>{
 const known:any=productSchema(product);assert.equal(known.offers.priceCurrency,'KES');assert.equal(known.offers.availability,undefined);
 assert.equal((productSchema({...product,stock:0}) as any).offers.availability,'https://schema.org/OutOfStock');
 assert.equal((productSchema({...product,priceValue:null}) as any).offers,undefined);
});
test('metadata and product HTML safely escape owner text and preserve request flow',()=>{
 const html=renderProductPage('<html><head><title>Title</title><meta name="description" content="test" /></head><body><main>old</main></body></html>',category,product);
 assert.match(html,/Shea &lt;Butter&gt;/);assert.match(html,/href="\/shop\?product=shea-butter"/);
 const scripts=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,1);assert.doesNotThrow(()=>JSON.parse(scripts[0][1]));
 assert.match(html,/rel="canonical"/);assert.doesNotMatch(html,/<main>old/);
 const privateHtml=enhanceHtml('<head><title>Account</title></head>','/account');assert.match(privateHtml,/noindex, nofollow/);assert.doesNotMatch(privateHtml,/application\/ld\+json/);
});
