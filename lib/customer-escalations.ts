import { customerTopics } from './owner-research';
import { createHash, randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from './supabase-admin';
import { parseTelegramOwnerIds } from './security';
import { sendTelegramMessage } from './telegram';

export function escalationReason(message:string,answer:string):string|null {
 const text=message.toLowerCase();
 // Only the customer's report can trigger a case; model uncertainty cannot.
 if (!/^(?:can|could|does|do|will|would|what if)\b/.test(text.trim()) && /\b(?:allergic reaction|swelling|rash after|reaction to|burning after|burnt my|burned my)\b/.test(text)) return 'Customer reports a product reaction';
 if (/\b(?:talk|speak|connect|chat)\s+(?:me\s+)?(?:to|with)\s+(?:a |the |an |your )?(?:human|owner|manager|person|someone)\b/.test(text)) return 'Customer requests human support';
 if (/\b(?:refund policy|return policy|how (?:do|can) i (?:get a refund|cancel)|can i cancel|do you (?:offer|allow) refunds)\b/.test(text)) return null;
 if (/\b(?:refund|complaint|cancel\s+(?:my|the)\s+order|(?:my|the)\s+order.{0,25}(?:missing|late|not arrived|not received)|(?:received|sent|delivered|got).{0,20}(?:wrong|damaged)|(?:wrong|damaged).{0,20}(?:received|delivered)|charged twice|double charged|payment.{0,20}(?:failed|missing)|paid.{0,25}(?:no confirmation|not confirmed)|late delivery)\b/.test(text)) return 'Customer reports an order, payment or service problem';
 return null;
}
export function redactCustomerText(text:string):string {
 return text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[email withheld]').replace(/\+?\d[\d ()-]{7,}\d/g,'[number withheld]').slice(0,1600);
}
export async function recordCustomerEscalation(params:{sessionId?:string;userMessage:string;assistantMessage:string}):Promise<void> {
 const reason=escalationReason(params.userMessage,params.assistantMessage);
 const sessionHash=createHash('sha256').update(params.sessionId||randomUUID()).digest('hex');
 const fingerprint=createHash('sha256').update(sessionHash+'|'+params.userMessage.trim().toLowerCase()).digest('hex');
 const db=getSupabaseAdmin();
 for(const topic of customerTopics(params.userMessage)) {
  const {error:signalError}=await db.from('customer_learning_signals').upsert({fingerprint:fingerprint+':'+topic,topic},{onConflict:'fingerprint',ignoreDuplicates:true});
  if(signalError)console.error('Anonymous customer signal could not be saved');
 }
 if(!reason)return;
 const {error}=await db.from('customer_escalations').upsert({fingerprint,session_hash:sessionHash,reason,question:redactCustomerText(params.userMessage),answer:redactCustomerText(params.assistantMessage)}, {onConflict:'fingerprint',ignoreDuplicates:true});
 if(error) throw new Error('Escalation could not be saved');
 await deliverPendingEscalations();
}
export async function deliverPendingEscalations():Promise<void> {
 const ids=[...parseTelegramOwnerIds(process.env.OWNER_TELEGRAM_CHAT_IDS!==undefined?process.env.OWNER_TELEGRAM_CHAT_IDS:process.env.OWNER_TELEGRAM_CHAT_ID)];
 if(!ids.length)return;
 const db=getSupabaseAdmin();
 for(const id of ids){
  const {data:claimed,error:claimError}=await db.rpc('claim_escalation_alert',{p_owner:id,p_reminder:false});
  if(claimError||!claimed)continue;
  const {data:rows,error}=await db.from('customer_escalations').select('id,attempts,notified_owner_ids').in('status',['open','waiting']).eq('notification_status','pending').lt('attempts',5).lte('next_attempt_at',new Date().toISOString()).order('created_at',{ascending:true}).limit(100);
  const pending=(rows||[]).filter(row=>!(row.notified_owner_ids||[]).includes(id));
  try {
   if(error)throw new Error('Queue unavailable');
   if(!pending.length)continue;
   await sendTelegramMessage(id,'There is something I need to escalate. Ask “what needs escalating?” for the details.',undefined);
   // Atomic receipt prevents simultaneous workers for different owners losing acknowledgements.
   const {error:receiptError}=await db.rpc('acknowledge_escalation_alert',{p_owner:id,p_ids:pending.map(row=>row.id),p_owners:ids});
   if(receiptError)throw new Error('Receipt could not be saved');
   await db.from('owner_escalation_context').update({awaiting_details:true,last_alert_at:new Date().toISOString()}).eq('telegram_chat_id',id);
  }catch{
   for(const row of pending)await db.from('customer_escalations').update({attempts:row.attempts+1,next_attempt_at:new Date(Date.now()+300000).toISOString()}).eq('id',row.id).eq('attempts',row.attempts);
   console.error('Customer escalation Telegram delivery failed');
  }finally{await db.from('owner_escalation_context').update({lease_until:null}).eq('telegram_chat_id',id);}
 }
}
