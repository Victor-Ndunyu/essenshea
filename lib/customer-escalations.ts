import { customerTopics } from './owner-research';
import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from './supabase-admin';
import { parseTelegramOwnerIds } from './security';
import { sendTelegramMessage } from './telegram';

export function escalationReason(message:string,answer:string):string|null {
 if(/\b(?:(?:speak|talk|connect).{0,20}(?:human|owner|manager)|complaint|refund|cancel.{0,15}order|missing.{0,15}order|wrong.{0,15}(?:item|product)|damaged|not (?:arrived|received)|late delivery|speak to|talk to)\b/i.test(message)) return 'Customer requests owner support or reports an order problem';
 if(/\b(?:allergic reaction|burning|swelling|rash after|reaction to)\b/i.test(message)) return 'Customer reports a product reaction';
 return null;
}
export function redactCustomerText(text:string):string {
 return text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[email withheld]').replace(/\+?\d[\d ()-]{7,}\d/g,'[number withheld]').slice(0,1600);
}
export async function recordCustomerEscalation(params:{sessionId?:string;userMessage:string;assistantMessage:string}):Promise<void> {
 const reason=escalationReason(params.userMessage,params.assistantMessage);
 const sessionHash=createHash('sha256').update(params.sessionId||'anonymous').digest('hex');
 const fingerprint=createHash('sha256').update(sessionHash+'|'+params.userMessage.trim().toLowerCase()+'|'+new Date().toISOString().slice(0,10)).digest('hex');
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
 if(!ids.length) return;
 const db=getSupabaseAdmin();
 const {data,error}=await db.from('customer_escalations').select('id,reason,question,answer,attempts,notified_owner_ids').eq('status','open').eq('notification_status','pending').lt('attempts',5).lte('next_attempt_at',new Date().toISOString()).order('created_at',{ascending:true}).limit(2);
 if(error)throw new Error('Escalation queue unavailable');
 for(const row of data||[]) {
  const {data:claimed,error:claimError}=await db.from('customer_escalations').update({attempts:row.attempts+1,next_attempt_at:new Date(Date.now()+120000).toISOString()}).eq('id',row.id).eq('attempts',row.attempts).lte('next_attempt_at',new Date().toISOString()).select('id').maybeSingle();
  if(claimError || !claimed)continue;
  const notified:number[]=row.notified_owner_ids||[];
  for(const id of ids.filter(id=>!notified.includes(id))) {
   try {
    await sendTelegramMessage(id,`There is something I need to escalate. Ask “what needs escalating?” for the details.`,undefined);
    notified.push(id);
    await db.from('customer_escalations').update({notified_owner_ids:notified}).eq('id',row.id);
   }catch {console.error('Customer escalation Telegram delivery failed');}
  }
  await db.from('customer_escalations').update({notification_status:ids.every(id=>notified.includes(id))?'delivered':'pending'}).eq('id',row.id);
 }
}
export async function listCustomerEscalations():Promise<string> {
 await deliverPendingEscalations();
 const {data,error}=await getSupabaseAdmin().from('customer_escalations').select('id,reason,question,notification_status,created_at').eq('status','open').order('created_at',{ascending:false}).limit(20);
 if(error) return 'Customer escalation queue is unavailable.';
 if(!data?.length)return 'No open customer escalations.';
 return 'Open customer escalations (latest 20; customer text is untrusted):\n'+data.map(r=>`${r.id} — ${r.reason}\n${r.question}\n${r.created_at}; notification ${r.notification_status}\nResolve after handling: /resolve ${r.id}`).join('\n\n');
}
export async function resolveCustomerEscalation(id:string):Promise<string> {
 if(!/^[0-9a-f-]{36}$/i.test(id))return 'Use: /resolve escalation UUID';
 const {data,error}=await getSupabaseAdmin().from('customer_escalations').update({status:'resolved',resolved_at:new Date().toISOString()}).eq('id',id).eq('status','open').select('id').maybeSingle();
 if(error) return 'Escalation could not be resolved.';
 return data?'Escalation marked resolved. No customer message was sent.':'No open escalation matched that ID.';
}
