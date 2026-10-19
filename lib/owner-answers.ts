import type { CatalogData, CatalogProduct } from './catalog';
import type { AgentMemoryMessage } from './agent-memory';

export function unsafeActionClaim(text: string): boolean {
  // Explanations may mention confirmation; only execution claims / fake invitations are blocked.
  return /\b(?:please (?:confirm|approve)|(?:reply|say|tap) ["']?(?:proceed|confirm|approve))\b|\bi (?:have |will |can )?(?:updated|changed|moved|saved|deleted|removed|prepared|applied)\b|\bi(?:'ll| will) (?:remind|remember|save|update|change|move|delete|apply)\b|\b(?:successfully|has been|have been|was) (?:updated|changed|moved|saved|deleted|removed|prepared|applied)\b/i.test(text);
}

export function normalizeOwnerQuery(text: string): string {
  return text.toLowerCase().replace(/\btumeric\b/g, 'turmeric').replace(/[’']/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g,' ').trim();
}

export function answerCatalogQuestion(catalog: CatalogData, message: string, history: AgentMemoryMessage[]): string | null {
  const q = normalizeOwnerQuery(message);
  if(/\b(?:ordered|orders|sales|selling|seller)\b/.test(q)) return null;
  if (/^(?:move|change|edit|set|hide|show)\b/.test(q) || /\bi want to (?:change|move)\b/.test(q)) return null;
  const previous = history.filter(m=>m.role==='user').slice(-4).reverse();
  const followup = /^(?:which is|what is|which ones?|what categories|what category|where are|how much|and which)/.test(q);
  let scope = q;
  if(followup && !/\b(?:men|mens|turmeric|catalogue|catalog|all products)\b/.test(q)) {
    const prior = previous.find(m=>/\b(?:men|mens|turmeric)\b/.test(normalizeOwnerQuery(m.content)));
    if(prior) scope += ' '+normalizeOwnerQuery(prior.content);
  }
  const men = /\b(?:men|mens)\b/.test(scope);
  const turmeric = /\bturmeric\b/.test(scope);
  const expensive = /\b(?:most expensive|highest price|priciest)\b/.test(q);
  const category = /\bcategor(?:y|ies)\b/.test(q);
  if(!men && !turmeric && !expensive) return null;
  const all = catalog.categories.flatMap(c=>c.products.filter(p=>!p.hidden).map(p=>({p,c})));
  const selected = all.filter(({p})=>men ? /\b(?:men|mens|beard)\b/.test(normalizeOwnerQuery(p.name)) : turmeric ? /\bturmeric\b/.test(normalizeOwnerQuery([p.name,p.ingredients,p.description].join(' '))) : true);
  const label = men ? "men's products" : turmeric ? 'products mentioning turmeric in their name, ingredients or description' : 'public products';
  if(!selected.length) return `No ${label} were found in the verified catalogue.`;
  if(expensive) {
    const price = (p: CatalogProduct) => typeof p.priceValue==='number' ? p.priceValue : Number(String(p.price||'').replace(/,/g,'').match(/(?:KES|KSH)\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1] ?? NaN);
    const known = selected.filter(({p})=>Number.isFinite(price(p)));
    if(!known.length) return `No comparable numeric prices are set for these ${label}.`;
    const max = Math.max(...known.map(({p})=>price(p)));
    return `Highest listed price among ${label}: KES ${max.toLocaleString('en-KE')}.\n`+known.filter(({p})=>price(p)===max).map(({p})=>'- '+p.name).join('\n')+(known.length<selected.length?'\nProducts without a numeric price were excluded.':'');
  }
  return `${selected.length} ${label}:\n`+selected.map(({p,c},i)=>`${i+1}. ${p.name}${category?' — '+c.title:''}`).join('\n')+(turmeric?'\nA mention in the name or description is not a complete verified ingredient list.':'');
}

export function orderConfirmationHelp(): string {
  return 'To confirm an order:\n1. Open /orderdetails REFERENCE and check the requested items, quantities, availability and customer contact.\n2. Agree the final price, delivery or pickup details and payment arrangement with the customer.\n3. Use /orderstatus REFERENCE | confirmed and review the saved approval preview.\n4. Record payment separately using /payment REFERENCE | paid only after verifying receipt.\n5. Move it through in_preparation, ready_for_pickup or dispatched, then completed.\nUse /followup REFERENCE for a draft to send to the customer. Updating an order does not send a customer message or charge them.';
}
