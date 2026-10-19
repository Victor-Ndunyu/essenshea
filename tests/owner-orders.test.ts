import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
async function moduleWith(db:any) {
 (globalThis as any).__ordersDb=db;
 const raw=await readFile(new URL('../lib/owner-orders.ts',import.meta.url),'utf8');
 return import('data:text/javascript;base64,'+Buffer.from('const getSupabaseAdmin=()=>globalThis.__ordersDb;\n'+stripTypeScriptTypes(raw.replace(/^import.*;\n/gm,''))).toString('base64'));
}
test('orders separate payment, enforce progression, verify writes and label drafts',async()=>{
 let row:any={reference:'ESS-20261013-TEST',status:'new',payment_status:'awaiting_confirmation',fulfilment_method:'pickup',updated_at:'2026-10-19',total_amount:null,delivery_location:null,customer_name:'Test',customer_contact:'test@example.com',preferred_contact:'email',order_items:[{title:'Butter',quantity:2}]};
 let fail=false;let calls=0;
 const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:row,error:null})})})}),rpc:async(_:string,p:any)=>{calls++;if(fail)return{error:{message:'stale'}};row={...row,[p.p_field]:p.p_value};return{data:row,error:null};}};
 const m=await moduleWith(db);
 assert.equal(m.parseOrderMutation('confirm order ESS-20261013-TEST'),'/orderstatus ESS-20261013-TEST | confirmed');
 assert.equal(m.parseOrderMutation('how do I confirm order ESS-20261013-TEST'),null);
 const edit=await m.prepareOrderEdit('/orderstatus ESS-20261013-TEST | confirmed');
 assert.equal(calls,0);assert.equal(row.status,'new');assert.match(edit.summary,/new → confirmed/);
 assert.match(await m.applyOrderEdit(1,edit),/updated and verified/);assert.equal(row.payment_status,'awaiting_confirmation');
 assert.throws(()=>m.validateOrderChange(row,'status','completed'),/allowed next/);
 row.status='in_preparation';assert.throws(()=>m.validateOrderChange(row,'status','dispatched'),/delivery first/);
 row.payment_status='paid';assert.throws(()=>m.validateOrderChange(row,'total_amount',100),/before payment/);
 assert.throws(()=>m.validateOrderChange(row,'payment_status','awaiting_payment'),/invalid payment/);
 m.validateOrderChange(row,'payment_status','refunded');
 assert.throws(()=>m.validateOrderChange(row,'unexpected','x'),/unsupported/);
 assert.match(await m.orderDetails(row.reference,true),/Draft only — not sent/);
 fail=true;await assert.rejects(m.applyOrderEdit(1,edit),/could not be verified/);
 delete (globalThis as any).__ordersDb;
});
