import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { parseProductEdit } from '../lib/product-edit.ts';
import { mergeCatalogData } from '../lib/catalog-merge.ts';

(globalThis as any).__listingParser = {parseProductEdit};
const raw = await readFile(new URL('../lib/product-create.ts',import.meta.url),'utf8');
const code = stripTypeScriptTypes(raw.replace(/^import[\s\S]*?;\s*/gm,''),{mode:'strip'});
const listing = await import('data:text/javascript;base64,'+Buffer.from('const {parseProductEdit}=globalThis.__listingParser;'+code).toString('base64'));
const categories = [{slug:'haircare',title:'Haircare',products:[]}];
const complete = () => ({version:'v1',photoFileId:'photo-123',fields:{name:'Test Hair Oil',category:'Haircare',description:'Owner-confirmed description. Directions: apply sparingly.',price:'650',size:'100ml',variants:'clear',availability:'now',stock:'5',ingredients:'Confirmed ingredients',benefits:'First benefit;Second benefit',labels:'Hair care',concerns:'scalp-comfort'}});

test('new listing preserves every supplied field and the real photo in its preview',()=>{
  const {row,summary}=listing.prepareNewListing(complete(),categories);
  assert.equal(row.category_slug,'haircare');assert.equal(row.product_slug,'test-hair-oil');
  assert.equal(row.price_value,650);assert.equal(row.stock,5);assert.equal(row.size_text,'100ml');
  assert.equal(row.ingredients,'Confirmed ingredients');assert.deepEqual(row.benefits,['First benefit','Second benefit']);
  assert.deepEqual(row.best_for,['Hair care']);assert.deepEqual(row.concerns,['scalp-comfort']);
  assert.equal(row.image_url,'/api/catalog/image?fileId=photo-123');assert.equal(row.hidden,false);
  for(const text of ['Test Hair Oil','Haircare','650','100ml','5','Confirmed ingredients','First benefit','Hair care','scalp-comfort','7 days']) assert.ok(summary.includes(text));
});
test('incomplete listings ask for fields and cannot be published without a photo',()=>{
  const draft=complete();delete (draft as any).photoFileId;
  assert.match(listing.listingQuestion(draft,categories),/photo/);
  assert.throws(()=>listing.prepareNewListing(draft,categories),/photo/);
  for(const key of listing.LISTING_FIELDS) {const d=complete();delete d.fields[key];assert.throws(()=>listing.prepareNewListing(d,categories),/complete/);}
});
test('category is resolved against existing categories and ambiguous or invented names are rejected',()=>{
  const draft=complete();draft.fields.category='Made up';assert.throws(()=>listing.prepareNewListing(draft,categories),/existing category/);
});
test('duplicate hidden products and punctuation-normalized names cannot be recreated',()=>{
  const cats=[{...categories[0],products:[{slug:'test-hair-oil',name:'Test Hair Oil',hidden:true}]}];
  assert.throws(()=>listing.prepareNewListing(complete(),cats),/already uses/);
});
test('invalid money, negative stock, duplicate fields and unsupported fields are rejected',()=>{
  for(const input of ['price=-1','price=100oops','stock=-3','stock=1.5','price=100 | price=200','publishedAt=now'])
    assert.throws(()=>listing.updateListingFields(complete(),'/draft '+input,categories),input);
});
test('available-now listings require explicit stock while zero and by-order unknown are valid',()=>{
  const d=complete();d.fields.stock='unknown';assert.throws(()=>listing.prepareNewListing(d,categories),/Stock must/);
  d.fields.availability='by order';assert.equal(listing.prepareNewListing(d,categories).row.stock,null);
  d.fields.availability='now';d.fields.stock='0';assert.match(listing.prepareNewListing(d,categories).summary,/Out of stock/);
});
test('variant listing has unique sizes and a truthful starting price',()=>{
  const d=complete();d.fields.variants='100ml:650;250ml:1200';d.fields.size='clear';
  assert.equal(listing.prepareNewListing(d,categories).row.price_text,'From KSh 650');
  d.fields.price='600';assert.throws(()=>listing.prepareNewListing(d,categories),/lowest variant/);
  d.fields.variants='100ml:650;100ml:800';assert.throws(()=>listing.prepareNewListing(d,categories),/unique/);
});
test('no size or quantity is never silently approved',()=>{
  const d=complete();d.fields.size='clear';assert.throws(()=>listing.prepareNewListing(d,categories),/size or quantity/);
});
test('optional undisclosed information is visibly absent and not invented',()=>{
  const d=complete();d.fields.ingredients='clear';d.fields.benefits='clear';
  const result=listing.prepareNewListing(d,categories);assert.equal(result.row.ingredients,'');assert.deepEqual(result.row.benefits,[]);assert.match(result.summary,/Ingredients: Not supplied/);
});
test('JSONB object ordering does not invalidate an unchanged review',()=>{
  assert.equal(listing.sameListingValue({a:1,b:[{x:1,y:2}]},{b:[{y:2,x:1}],a:1}),true);
  assert.equal(listing.sameListingValue({a:[1,2]},{a:[2,1]}),false);
});
test('publication time survives edits and category moves; existing products are not new arrivals',()=>{
  const source={categories:[{...categories[0],products:[{slug:'existing',name:'Existing'}]},{slug:'oils',title:'Oils',products:[]}]};
  const created_at='2026-10-16T10:00:00Z';
  const row={...listing.prepareNewListing(complete(),categories).row,created_at,category_slug:'oils'};
  const result=mergeCatalogData(source,[row,{product_slug:'existing',category_slug:'haircare',product_name:'Renamed',is_new:false,created_at}],false).catalog;
  assert.equal(result.categories.find(c=>c.slug==='oils')?.products[0].publishedAt,created_at);
  assert.equal(result.categories.find(c=>c.slug==='haircare')?.products[0].publishedAt,null);
});
