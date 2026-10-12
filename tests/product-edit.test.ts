import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerMoney, ownerStock, parseProductEdit, productRecord } from '../lib/product-edit.ts';
import { parseNaturalOwnerMutation } from '../lib/owner-command.ts';
import { mergeCatalogData } from '../lib/catalog-merge.ts';
const categories = [{ slug:'carrier-oils',title:'Carrier Oils',products:[] },{slug:'haircare',title:'Haircare',products:[]}];
test('price parsing is strict and allows deliberate request pricing', () => {
 assert.equal(ownerMoney('KSh 1,250'),1250); assert.equal(ownerMoney('0'),0); assert.equal(ownerMoney('price on request'),null);
 for (const value of ['-5','500abc','100ml 500','500 / 900','1.234']) assert.throws(()=>ownerMoney(value));
});
test('stock rejects fractions and trailing garbage', () => {
 assert.equal(ownerStock('12'),12); assert.equal(ownerStock('unknown'),null);
 for(const value of ['12.5','12abc','-2','2147483648']) assert.throws(()=>ownerStock(value));
});
test('one edit handles multiple fields and validates category', () => {
 const result=parseProductEdit('/edit Amla Oil | price=850 | stock=12 | category=Haircare | labels=Hair growth; Scalp comfort',categories);
 assert.equal(result.patch.price_value,850);assert.equal(result.patch.stock,12);assert.equal(result.patch.category_slug,'haircare');assert.deepEqual(result.patch.best_for,['Hair growth','Scalp comfort']);
 assert.throws(()=>parseProductEdit('/edit Amla Oil | category=Haircaer',categories));
 assert.throws(()=>parseProductEdit('/edit Amla Oil | unsupported=value',categories));
});
test('size prices and explicit empty labels are preserved', () => {
 const result=parseProductEdit('/edit Oil | variants=100ml:550;250ml:800 | labels=clear | benefits=clear',categories);
 assert.deepEqual(result.patch.best_for,[]);assert.deepEqual(result.patch.benefits,[]);assert.equal((result.patch.variants as any[])[1].priceValue,800);
 assert.throws(()=>parseProductEdit('/edit Oil | variants=100ml:500;100ml:800',categories));
});
test('ordinary requests translate to supported edits', () => {
 assert.equal(parseNaturalOwnerMutation('Change the price of Amla Oil to KSh 850'),'/edit Amla Oil | price=KSh 850');
 assert.equal(parseNaturalOwnerMutation('Move Amla Oil to Haircare'),'/edit Amla Oil | category=Haircare');
 assert.equal(parseNaturalOwnerMutation('Rename Amla Oil to Amla Hair Oil'),'/edit Amla Oil | name=Amla Hair Oil');
});
test('changed price text cannot retain a stale numeric base price', () => {
 const source={categories:[{slug:'carrier-oils',title:'Carrier Oils',products:[{slug:'oil',name:'Oil',price:'KSh 500',priceValue:500}]}]};
 const row={product_slug:'oil',category_slug:'carrier-oils',product_name:null,description:null,price_text:'Price on request',price_value:null,image_url:null,stock:0,available_by_order:false,hidden:false,is_new:false,sort_order:null,best_for:[],benefits:['Owner note'],size_text:'100ml'};
 const result=mergeCatalogData(source,[row]).catalog.categories[0].products[0];
 assert.equal(result.priceValue,null);assert.deepEqual(result.bestFor,[]);assert.deepEqual(result.benefits,['Owner note']);assert.equal(result.size,'100ml');
 const snapshot=productRecord(result,'carrier-oils');assert.equal(snapshot.stock,0);
});
