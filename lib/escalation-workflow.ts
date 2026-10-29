import { getSupabaseAdmin } from './supabase-admin';
import { parseTelegramOwnerIds } from './security';
import { redactCustomerText } from './customer-escalations';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export type CaseDecision = { id?: string; status: 'open'|'waiting'|'resolved'|'dismissed'; note: string; days: number };
export function parseEscalationDecision(text: string): CaseDecision | null {
 const command=text.match(new RegExp(`^/(resolve|dismiss|reopen|escalationnote|escalationfollowup)\\s+(${UUID})(?:\\s+([\\s\\S]+))?$`,'i'));
 if(command){
  const kind=command[1].toLowerCase();let note=command[3]||'';let days=3;
  if(kind==='escalationfollowup'){const m=note.match(/^(\d+)\s+(.+)$/s);if(!m)return null;days=Number(m[1]);note=m[2];}
  return {id:command[2],status:kind==='resolve'?'resolved':kind==='dismiss'?'dismissed':kind==='reopen'?'open':'waiting',note,days};
 }
 const natural=text.match(/^(resolve|dismiss|reopen) (?:this|that|the) escalation(?:\s*[:,-]\s*|\s+because\s+)(.+)$/is);
 if(natural)return {status:natural[1].toLowerCase()==='resolve'?'resolved':natural[1].toLowerCase()==='dismiss'?'dismissed':'open',note:natural[2],days:3};
 return null;
}
export function formatEscalation(row: any): string {
 const history=Array.isArray(row.decision_history)?row.decision_history.slice(-8):[];
 return [`Escalation ${row.id} (${row.status})`,row.reason,`Customer report (untrusted): ${row.question}`,`Assistant reply (untrusted): ${row.answer}`,
  'Owner decisions:',history.length?history.map((e:any)=>`${e.at}: ${e.status} — ${e.note}`).join('\n'):'No decision recorded yet.',
  ['resolved','dismissed'].includes(row.status)?'Closed; follow-ups stopped.':`Follow-up due: ${row.follow_up_at}`,
  `Resolve: /resolve ${row.id} decision`, `Rule out: /dismiss ${row.id} reason`, `Follow up: /escalationfollowup ${row.id} 3 next step`,
  'These actions record an internal decision; they do not contact the customer or change an order.'].join('\n');
}
async function acknowledgeRead(chatId:number, ids:string[]){
 const owners=[...parseTelegramOwnerIds(process.env.OWNER_TELEGRAM_CHAT_IDS!==undefined?process.env.OWNER_TELEGRAM_CHAT_IDS:process.env.OWNER_TELEGRAM_CHAT_ID)];
 const {error}=await getSupabaseAdmin().rpc('acknowledge_escalation_alert',{p_owner:chatId,p_ids:ids,p_owners:owners.length?owners:[chatId]});
 if(error)throw new Error('Escalation acknowledgement could not be saved');
}
export async function handleEscalationConversation(chatId:number,text:string):Promise<string|null>{
 const db=getSupabaseAdmin();const decision=parseEscalationDecision(text);
 const detail=text.match(new RegExp(`^/escalation\\s+(${UUID})$`,'i'));
 const list=/^\/escalations(?:\s+(?:history|all))?$/i.test(text);
 const ask=/^(?:what needs escalating|what (?:is it|is the escalation)|what(?:'s| is) (?:the issue|it about)|tell me (?:more|about (?:it|the escalation))|show (?:me )?(?:the )?escalations)[?.!]*$/i.test(text.trim());
 const malformed=/^\/(?:resolve|dismiss|reopen|escalationnote|escalationfollowup|escalation)\b/i.test(text);
 if(!decision&&!detail&&!list&&!ask&&!malformed)return null;
 const {data:context,error:contextError}=await db.from('owner_escalation_context').select('*').eq('telegram_chat_id',chatId).maybeSingle();
 if(contextError)throw new Error('Escalation context unavailable');
 if(ask&&!context?.awaiting_details&&!context?.selected_id&&!/escalat/i.test(text))return null;
 if(decision){
  const selectedFresh=context?.selected_at && Date.now()-Date.parse(context.selected_at)<86400000;
  const id=decision.id||(selectedFresh?context?.selected_id:null);
  if(!id)return 'Specify the escalation ID, or open /escalations and select /escalation ID first. Nothing changed.';
  if(!decision.note.trim()||decision.note.length>1600||decision.days<1||decision.days>30)return 'Include a short decision or reason. Follow-ups must be 1–30 days away. Nothing changed.';
  const {data,error}=await db.rpc('decide_customer_escalation',{p_id:id,p_owner:chatId,p_status:decision.status,p_note:redactCustomerText(decision.note),p_days:decision.days});
  if(error)throw new Error('Decision could not be saved');
  if(!data)return 'No escalation matched that ID. Nothing changed.';
  return `Escalation ${id} marked ${decision.status}. Decision saved: ${redactCustomerText(decision.note)}. `+(['resolved','dismissed'].includes(decision.status)?'Follow-ups stopped.':`Follow-up in ${decision.days} days during a suitable owner conversation.`)+' No customer message was sent.';
 }
 if(malformed&&!detail)return 'Use /resolve ID decision, /dismiss ID reason, /reopen ID reason, /escalationnote ID note, or /escalationfollowup ID DAYS next step.';
 if(detail){
  const {data,error}=await db.from('customer_escalations').select('*').eq('id',detail[1]).maybeSingle();
  if(error)throw new Error('Escalation unavailable');if(!data)return 'No escalation matched that ID.';
  const {error:saveError}=await db.from('owner_escalation_context').upsert({telegram_chat_id:chatId,selected_id:data.id,selected_at:new Date().toISOString(),awaiting_details:false},{onConflict:'telegram_chat_id'});
  if(saveError)throw new Error('Escalation selection could not be saved');
  await acknowledgeRead(chatId,[data.id]);
  return formatEscalation(data);
 }
 const history=/\b(?:history|all)\b/i.test(text);
 let query=db.from('customer_escalations').select('*').order('created_at',{ascending:false}).limit(20);
 if(!history)query=query.in('status',['open','waiting']);
 const {data,error}=await query;if(error)throw new Error('Escalation queue unavailable');
 if(!data?.length){await db.from('owner_escalation_context').upsert({telegram_chat_id:chatId,awaiting_details:false,selected_id:null},{onConflict:'telegram_chat_id'});return history?'No escalation history is available.':'No unresolved escalations. Resolved and dismissed issues are excluded; /escalations history shows retained decisions.';}
 const {error:saveError}=await db.from('owner_escalation_context').upsert({telegram_chat_id:chatId,awaiting_details:false,selected_id:data.length===1?data[0].id:null,selected_at:new Date().toISOString()},{onConflict:'telegram_chat_id'});
 if(saveError)throw new Error('Escalation context could not be saved');
 await acknowledgeRead(chatId,data.map(r=>r.id));
 if(data.length===1)return formatEscalation(data[0]);
 return `${history?'Escalation history':'Unresolved escalations'} (latest ${data.length}):\n`+data.map(r=>`${r.id} — ${r.status}\n${r.reason}\n${r.question.slice(0,220)}\n${r.decision_history?.length?'Latest decision: '+r.decision_history.at(-1).note:'No owner decision yet.'}\n/escalation ${r.id}`).join('\n\n')+'\nSelect an ID before referring to “this escalation”.';
}
export async function escalationFollowupNudge(chatId:number):Promise<string>{
 try{
 const db=getSupabaseAdmin();const {data,error}=await db.rpc('claim_escalation_alert',{p_owner:chatId,p_reminder:true});
 if(error||!data)return '';
 const {error:saveError}=await db.from('owner_escalation_context').update({awaiting_details:true,last_alert_at:new Date().toISOString(),lease_until:null}).eq('telegram_chat_id',chatId);
 if(saveError)return '';
 return 'There is an unresolved escalation due for follow-up. Ask “what needs escalating?” when you have a moment.';
 }catch{return '';}
}
