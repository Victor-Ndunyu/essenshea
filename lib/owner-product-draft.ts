import { randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from './supabase-admin';
import { getMergedCatalog } from './catalog';
import { listingQuestion, updateListingFields, prepareNewListing, sameListingValue, type ListingDraft, type NewProductPreview } from './product-create';
import { parseNaturalOwnerApproval } from './owner-command';

type Photo = { file_id: string; file_size?: number };
type Reply = { handled: boolean; response: string; previewPhotoFileId?: string };
const version = () => randomBytes(8).toString('hex');

export async function handleNewProductDraft(chatId: number, text: string, photos: Photo[] = []): Promise<Reply | null> {
  const start = /^(?:\/(?:newproduct|addproduct)(?:\s|$)|(?:please )?(?:add|create|list) (?:a )?new (?:product|item)\b)/i.test(text);
  const control = /^\/(?:draft|previewproduct|discardproduct)\b/i.test(text);
  // Other owner commands retain their own routing; a saved draft can be resumed later.
  if (!start && !control && text.startsWith('/')) return null;
  const db = getSupabaseAdmin();
  const {data,error} = await db.from('owner_agent_events').select('id,payload')
    .eq('telegram_chat_id',chatId).eq('event_type','owner_product_draft').order('created_at',{ascending:false}).limit(1);
  if (error) throw new Error('Draft storage unavailable.');
  let saved = data?.[0];
  if (!saved && !start) return control ? {handled:true,response:'No active product draft. Send /newproduct to start.'} : null;
  if (saved && start) return {handled:true,response:'You already have a saved product draft. Send /draft to resume, /previewproduct to review, or /discardproduct before starting another.'};
  const catalog = await getMergedCatalog({includeHidden:true,requireVerified:true});
  if (start) {
    let draft: ListingDraft = {version:version(),fields:{}};
    const legacy = text.match(/^\/addproduct\s+([\s\S]+)$/i);
    if (legacy) {
      const parts = legacy[1].split('|').map(p=>p.trim());
      if (parts.length < 4 || parts.some(p=>!p)) throw new Error('Use /newproduct for guided entry, or /addproduct category | name | price | description.');
      draft = updateListingFields(draft,'/draft category='+parts[0]+' | name='+parts[1]+' | price='+parts[2]+' | description='+parts[3]+(parts.length>4?' | '+parts.slice(4).join(' | '):''),catalog.categories);
    }
    if (photos.length) draft.photoFileId = [...photos].sort((a,b)=>(b.file_size||0)-(a.file_size||0))[0].file_id;
    const {data:inserted,error:saveError} = await db.from('owner_agent_events').insert([{
      telegram_chat_id:chatId,event_type:'owner_product_draft',payload:draft,
    }]).select('id,payload').single();
    if (saveError || !inserted) throw new Error('Draft could not be saved.');
    saved = inserted;
  }
  const original = saved!.payload as ListingDraft;
  if (/^\/discardproduct$/i.test(text) || (!start && parseNaturalOwnerApproval(text)==='cancel')) {
    const {data:closed,error} = await db.from('owner_agent_events').update({event_type:'owner_product_discarded'})
      .eq('id',saved!.id).eq('event_type','owner_product_draft').eq('payload->>version',original.version).select('id').maybeSingle();
    if (error || !closed) throw new Error('This product draft changed. Send /draft to reload it.');
    return {handled:true,response:'Product draft discarded. Nothing was published. Any earlier preview for it is invalid.'};
  }
  // A bare yes/proceed still belongs to the existing approval flow, never a field answer.
  if (!start && parseNaturalOwnerApproval(text)==='confirm') return null;
  let draft = original;
  if (!start && !/^\/(?:draft|previewproduct)$/i.test(text)) {
    if (photos.length) {
      draft = {...draft,photoFileId:[...photos].sort((a,b)=>(b.file_size||0)-(a.file_size||0))[0].file_id};
      if (text && !/^\/draft\s*$/i.test(text)) draft = updateListingFields(draft,text,catalog.categories);
    } else draft = updateListingFields(draft,text,catalog.categories);
    draft = {...draft,version:version()};
    const {data:updated,error} = await db.from('owner_agent_events').update({payload:draft})
      .eq('id',saved!.id).eq('event_type','owner_product_draft').eq('payload->>version',original.version).select('id').maybeSingle();
    if (error || !updated) throw new Error('This product draft changed. Send /draft to reload it.');
  }
  const question = listingQuestion(draft,catalog.categories);
  if (question) return {handled:true,response:(start?'Your private product draft is saved. Nothing is public. Answer each question, or send /draft field=value to supply several details.\n\n':'Draft saved.\n\n')+question};
  const {row,summary} = prepareNewListing(draft,catalog.categories);
  const newProduct: NewProductPreview = {draftId:Number(saved!.id),version:draft.version,row,photoFileId:draft.photoFileId!};
  // Retire earlier previews for this draft, including previews of older revisions.
  const {error:retireError} = await db.from('owner_agent_events').update({event_type:'owner_action_superseded'})
    .eq('telegram_chat_id',chatId).eq('event_type','owner_action_pending').eq('payload->newProduct->>draftId',String(saved!.id));
  if (retireError) throw new Error('Previous draft previews could not be retired.');
  const token = randomBytes(4).toString('hex').toUpperCase();
  const {error:previewError} = await db.from('owner_agent_events').insert([{
    telegram_chat_id:chatId,event_type:'owner_action_pending',product_slug:String(row.product_slug),
    payload:{token,command:'/publishproduct',summary,newProduct,expiresAt:new Date(Date.now()+600_000).toISOString()},
  }]);
  if (previewError) throw new Error('Listing preview could not be saved.');
  return {handled:true,previewPhotoFileId:draft.photoFileId,response:summary+'\n\nApprove within 10 minutes: /confirm '+token+'\nCancel: /cancel '+token};
}

export async function publishNewProduct(chatId: number, preview: NewProductPreview): Promise<string> {
  const db = getSupabaseAdmin();
  const {data:draft,error:readError} = await db.from('owner_agent_events').select('id,payload')
    .eq('id',preview.draftId).eq('telegram_chat_id',chatId).eq('event_type','owner_product_draft').eq('payload->>version',preview.version).maybeSingle();
  if (readError || !draft) throw new Error('This product draft changed or was discarded. Send /previewproduct for a fresh preview.');
  const catalog = await getMergedCatalog({includeHidden:true,requireVerified:true});
  const {row} = prepareNewListing(draft.payload as ListingDraft,catalog.categories);
  if (!sameListingValue(row,preview.row)) throw new Error('This product draft changed. Send /previewproduct for a fresh preview.');
  const {data:claimed,error:claimError} = await db.from('owner_agent_events').update({event_type:'owner_product_publishing'})
    .eq('id',preview.draftId).eq('telegram_chat_id',chatId).eq('event_type','owner_product_draft').eq('payload->>version',preview.version).select('id').maybeSingle();
  if (claimError || !claimed) throw new Error('This product draft changed or is already being published. Check /activity.');
  const publishedAt = new Date().toISOString();
  const expected = {...row,updated_by:String(chatId),created_at:publishedAt,updated_at:publishedAt};
  // Insert only. A duplicate slug must never overwrite an existing product.
  try { await db.from('catalog_overrides').insert(expected); } catch { /* Read after uncertain transport; never replay. */ }
  const {data:saved,error} = await db.from('catalog_overrides').select('*').eq('product_slug',row.product_slug).maybeSingle();
  if (error || !saved || Object.entries(expected).some(([key,value])=>key.endsWith('_at') ? Date.parse(saved[key])!==Date.parse(String(value)) : !sameListingValue(saved[key],value))) {
    throw new Error('The product publication result is uncertain. Check /activity and /describe before creating another draft.');
  }
  await db.from('owner_agent_events').update({event_type:'owner_product_published'})
    .eq('id',preview.draftId).eq('event_type','owner_product_publishing');
  return String(row.product_name)+' has been added and verified.\nView: https://essenshea.vercel.app/product/'+row.product_slug+'\nHomepage showcase ends: '+new Date(Date.parse(publishedAt)+7*86400000).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'})+' (Nairobi time). The product remains in its category and the shop afterwards.';
}
