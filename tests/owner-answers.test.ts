import test from 'node:test';
import assert from 'node:assert/strict';
import { answerCatalogQuestion, unsafeActionClaim, orderConfirmationHelp } from '../lib/owner-answers.ts';
const catalog={categories:[{slug:'body',title:'Body Care',products:[{slug:'men-a',name:'Tonic for Men',priceValue:1480},{slug:'men-b',name:'Beard Elixir',priceValue:1000},{slug:'gift',name:'Gift',priceValue:4000},{slug:'scrub',name:'Turmeric scrub',description:'hyperpigmentation',priceValue:500}]}]};
test('transcript counts and follow-up price scope are computed from the same products',()=>{
 assert.match(answerCatalogQuestion(catalog,'How many men products are there, can you list them',[])!,/^2 /);
 const reply=answerCatalogQuestion(catalog,'which is the most expensive',[{role:'user',content:'list mens products'}])!;
 assert.match(reply,/1,480/);assert.doesNotMatch(reply,/Gift/);
 assert.match(answerCatalogQuestion(catalog,'which is the most expensive in the catalogue',[])!,/4,000/);
 assert.match(answerCatalogQuestion(catalog,'what categories are they',[{role:'user',content:'which products contain tumeric'}])!,/Turmeric scrub — Body Care/);
});
test('order explanations are allowed, fabricated execution and approval invitations blocked',()=>{
 for(const text of ['Please confirm you would like to proceed.','I have updated the product.','I prepared the change.','I will remind you next time.']) assert.equal(unsafeActionClaim(text),true,text);
 for(const text of ['To confirm an order, check stock and agree delivery.','You can approve the saved preview.','Payment has not been confirmed.']) assert.equal(unsafeActionClaim(text),false,text);
 assert.match(orderConfirmationHelp(),/payment separately/);
});
