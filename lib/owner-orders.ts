import { getSupabaseAdmin } from './supabase-admin';

export type OrderState = { reference:string; status:string; payment_status:string; fulfilment_method:string; updated_at:string; total_amount:number|null; delivery_location:string|null };
export type OrderEdit = { before:OrderState; field:string; value:string|number; summary:string };
const transitions: Record<string,string[]> = {
 new:['contacted','confirmed','cancelled'], contacted:['confirmed','cancelled'], confirmed:['in_preparation','cancelled'],
 in_preparation:['ready_for_pickup','dispatched','cancelled'], ready_for_pickup:['completed','cancelled'], dispatched:['completed'], completed:[], cancelled:[],
};
export function validateOrderChange(order:OrderState,field:string,value:string|number): void {
 if(field==='status') {
  if(!transitions[order.status]?.includes(String(value))) throw new Error('Order change: allowed next statuses are '+(transitions[order.status]?.join(', ')||'none (terminal order)')+'.');
  if(value==='ready_for_pickup' && order.fulfilment_method!=='pickup') throw new Error('Order change: set fulfilment to pickup first.');
  if(value==='dispatched' && order.fulfilment_method!=='delivery') throw new Error('Order change: set fulfilment to delivery first.');
 } else if(field==='payment_status') {
  const next:Record<string,string[]>={awaiting_confirmation:['awaiting_payment','paid','failed'],awaiting_payment:['paid','failed'],failed:['awaiting_payment','paid'],paid:['refunded'],refunded:[]};
  if(!next[order.payment_status]?.includes(String(value))) throw new Error('Order change: invalid payment transition. Paid payments can only move to refunded.');
 } else if(field==='fulfilment_method') {
  if(!['delivery','pickup','discuss'].includes(String(value)) || ['dispatched','completed','cancelled'].includes(order.status)) throw new Error('Order change: fulfilment must be delivery, pickup or discuss on an open, undispatched order.');
 } else if(field==='total_amount') {
  if(typeof value!=='number' || !Number.isFinite(value) || value<0 || value>10000000 || ['paid','refunded'].includes(order.payment_status)) throw new Error('Order change: total must be a valid non-negative amount before payment.');
 } else if(field==='delivery_location') {
  if(!String(value).trim() || String(value).length>200 || ['dispatched','completed','cancelled'].includes(order.status)) throw new Error('Order change: provide a delivery location under 200 characters before dispatch.');
 } else throw new Error('Order change: unsupported order field.');
}
export function parseOrderMutation(text:string): string|null {
 const m=text.match(/^(?:please )?(confirm|cancel|complete) (?:order )?(ESS-\d{8}-[A-Z0-9]+)[.!]?$/i);
 return m?`/orderstatus ${m[2].toUpperCase()} | ${{confirm:'confirmed',cancel:'cancelled',complete:'completed'}[m[1].toLowerCase()]}`:null;
}
export async function readOrder(reference:string, contacts=false):Promise<any> {
 if(!/^ESS-\d{8}-[A-Z0-9]+$/i.test(reference)) throw new Error('Use: an exact order reference, for example /orderdetails ESS-20261013-SUAP');
 const {data,error}=await getSupabaseAdmin().from('orders').select('reference,status,payment_status,fulfilment_method,updated_at,total_amount,delivery_location,created_at,order_items(title,quantity,unit_price)'+(contacts?',customer_name,customer_contact,preferred_contact,customer_notes':'')).eq('reference',reference.toUpperCase()).maybeSingle();
 if(error) throw new Error('Order data is unavailable.');
 if(!data) throw new Error('Order change: that order reference was not found.');
 return data;
}
export async function prepareOrderEdit(command:string):Promise<OrderEdit> {
 const match=command.match(/^\/(orderstatus|payment|fulfilment|ordertotal|delivery)\s+(ESS-\d{8}-[A-Z0-9]+)\s*\|\s*(.+)$/i);
 if(!match) throw new Error('Use: /orderstatus REFERENCE | confirmed; /payment REFERENCE | paid; /fulfilment REFERENCE | delivery; /delivery REFERENCE | location; /ordertotal REFERENCE | amount');
 const fields:Record<string,string>={orderstatus:'status',payment:'payment_status',fulfilment:'fulfilment_method',ordertotal:'total_amount',delivery:'delivery_location'};
 const field=fields[match[1].toLowerCase()];const value=field==='total_amount'?Number(match[3].replace(/,/g,'')):field==='delivery_location'?match[3].trim():match[3].trim().toLowerCase().replace(/ /g,'_');
 const row=await readOrder(match[2]);
 validateOrderChange(row,field,value);
 const before:OrderState={reference:row.reference,status:row.status,payment_status:row.payment_status,fulfilment_method:row.fulfilment_method,updated_at:row.updated_at,total_amount:row.total_amount,delivery_location:row.delivery_location};
 return {before,field,value,summary:`Order ${row.reference}\n${field}: ${row[field]??'not set'} → ${value}\nThis records an operational update only; it does not send a customer message, collect/refund money, or adjust inventory.${field==='payment_status'?' Verify payment/refund evidence before approving.':''}`};
}
export async function applyOrderEdit(chatId:number,edit:OrderEdit):Promise<string> {
 const {data,error}=await getSupabaseAdmin().rpc('owner_apply_order_patch',{p_reference:edit.before.reference,p_expected:edit.before.updated_at,p_field:edit.field,p_value:String(edit.value),p_actor:chatId});
 if(error || !data || String(data[edit.field])!==String(edit.value)) throw new Error('Order change: update could not be verified. Check /orderdetails '+edit.before.reference+' before retrying; a stale preview requires a fresh request.');
 return `Order ${edit.before.reference} updated and verified: ${edit.field} = ${edit.value}. No customer message was sent.`;
}
export async function orderDetails(reference:string,draft=false):Promise<string> {
 const o=await readOrder(reference,true);
 const items=(o.order_items||[]).map((i:any)=>`${i.quantity} × ${i.title}`).join(', ');
 if(draft) return `Draft only — not sent. Contact: ${o.customer_contact} (${o.preferred_contact})\n\nHello ${o.customer_name}, this is Essenshea following up on ${o.reference}: ${items}. Our recorded order status is ${o.status.replace(/_/g,' ')} and payment status is ${o.payment_status.replace(/_/g,' ')}. Could you confirm whether you still wish to proceed and your preferred delivery or pickup arrangement?\n\nCheck availability, final price and timing before sending. For completed/cancelled orders, adapt this draft to a post-order check-in.`;
 return `${o.reference}\nOrder: ${o.status}\nPayment: ${o.payment_status}\nCustomer: ${o.customer_name}\nContact: ${o.customer_contact} (${o.preferred_contact})\nFulfilment: ${o.fulfilment_method}; ${o.delivery_location||'location not set'}\nAgreed total: ${o.total_amount??'not set'} KES\nItems: ${items}\nCustomer notes (untrusted customer text): ${o.customer_notes||'none'}\nNext statuses: ${transitions[o.status]?.join(', ')||'none'}\nUse /followup ${o.reference} for an unsent draft.`;
}
export async function mostOrderedProducts():Promise<string> {
 const {data,error}=await getSupabaseAdmin().rpc('owner_order_product_totals');
 if(error) return 'Order quantity totals are unavailable right now; I cannot infer a best seller.';
 if(!data?.length) return 'No retained order items are available.';
 return 'Retained order history (requested units, not proof of sales; cancelled requests excluded):\n'+data.map((r:any)=>`${r.title}: ${r.requested_units} requested; ${r.completed_paid_units} in completed, paid orders`).join('\n')+'\nHistorical records removed by retention are excluded.';
}
