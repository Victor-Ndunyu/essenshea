import type { CatalogCategory } from './catalog';
import { parseProductEdit } from './product-edit';

export type ListingDraft = { version: string; fields: Record<string, string>; photoFileId?: string };
export type NewProductPreview = { draftId: number; version: string; row: Record<string, unknown>; photoFileId: string };
// JSONB can reorder object keys; compare content, never insertion order.
export function sameListingValue(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)])) : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
export const LISTING_FIELDS = ['name','category','description','price','size','variants','availability','stock','ingredients','benefits','labels','concerns'] as const;
export function listingQuestion(draft: ListingDraft, categories: CatalogCategory[]): string | null {
  const questions: Record<string,string> = {
    name: 'What is the exact product name?',
    category: 'Which category? Choose: ' + categories.map(c => c.title).join(', '),
    description: 'Send the description customers should see. Include directions and cautions where relevant; only use confirmed product information.',
    price: 'What is the price in KSh? Send a number, or price on request. For multiple sizes, use the lowest variant price here.',
    size: 'What is the size or quantity, for example 250ml? Send clear if sizes will be listed as variants.',
    variants: 'List size prices as 100ml:550;250ml:800, or send clear for no variants.',
    availability: 'Is it available now or by order? Reply now or by order.',
    stock: 'How many units are available? Send a whole number (0 is allowed), or unknown for by-order products. This is the total across sizes.',
    ingredients: 'Send the confirmed ingredients. Reply clear if they are not supplied; I will not invent them.',
    benefits: 'Send confirmed product benefits, separated by semicolons, or clear. Include any usage or safety notes in the description.',
    labels: 'Send up to six short product labels, separated by semicolons, or clear.',
    concerns: 'Choose relevant filters, separated by semicolons: hair-growth; dry-skin; glow; stretch-marks; acne-prone; scalp-comfort; mens-care; fragrance; custom-care; gifts. Or send clear.',
  };
  const missing = LISTING_FIELDS.find(key => !Object.prototype.hasOwnProperty.call(draft.fields,key));
  if (missing) return questions[missing];
  if (!draft.photoFileId) return 'Send the product photo (as a Telegram photo). It will be shown again with your complete listing preview before publishing.';
  return null;
}
export function updateListingFields(draft: ListingDraft, input: string, categories: CatalogCategory[]): ListingDraft {
  const fields = { ...draft.fields };
  const parts = input.replace(/^\/draft\s+/i,'').split('|').map(p => p.trim());
  const explicit = /^\/?draft\s/i.test(input) || /^[a-z]+\s*=/i.test(input);
  if (explicit) {
    const seen = new Set<string>();
    for (const part of parts) {
      const i = part.indexOf('='); const key = part.slice(0,i).trim().toLowerCase(); const value = part.slice(i+1).trim();
      if (i < 1 || !LISTING_FIELDS.includes(key as typeof LISTING_FIELDS[number]) || !value || seen.has(key)) throw new Error('Use /draft field=value | field=value. Each supported field must appear only once.');
      seen.add(key); fields[key] = value;
    }
  } else {
    const next = LISTING_FIELDS.find(key => !Object.prototype.hasOwnProperty.call(fields,key));
    if (!next) throw new Error('Use /draft field=value to correct this listing, or /previewproduct to review it.');
    if (!input.trim() || input.includes('|')) throw new Error('Use one answer, or /draft field=value | field=value for several details.');
    fields[next] = input.trim();
  }
  for (const [key,value] of Object.entries(fields)) parseProductEdit('/edit Draft | ' + key + '=' + value, categories);
  return { ...draft, fields };
}
export function prepareNewListing(draft: ListingDraft, categories: CatalogCategory[]): { row: Record<string,unknown>; summary: string } {
  const missing = listingQuestion(draft,categories);
  if (missing) throw new Error('Use /newproduct to complete the listing. ' + missing);
  const { patch } = parseProductEdit('/edit Draft | ' + LISTING_FIELDS.map(key=>key+'='+draft.fields[key]).join(' | '),categories);
  const name = String(patch.product_name);
  const slug = name.toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if (!slug || slug.length > 180) throw new Error('Use a product name containing letters or numbers, under 180 characters.');
  if (categories.flatMap(c=>c.products).some(p=>p.slug===slug || p.name.trim().toLowerCase()===name.toLowerCase())) throw new Error('Another product already uses that name. Use /edit for existing products.');
  const variants = patch.variants as Array<{size:string;priceValue:number;price:string}>;
  if (!patch.size_text && !variants.length) throw new Error('Use /draft size=250ml (or the correct quantity), or supply variants. Every listing needs a size or quantity.');
  if (!patch.available_by_order && typeof patch.stock !== 'number') throw new Error('Stock must be supplied for available-now products. Use /draft stock=12 or availability=by order.');
  if (variants.length && patch.price_value !== Math.min(...variants.map(v=>v.priceValue))) throw new Error('Use /draft price=' + Math.min(...variants.map(v=>v.priceValue)) + ' so the listing price matches the lowest variant price.');
  if (variants.length) patch.price_text = 'From ' + patch.price_text;
  const row = { ...patch, product_slug: slug, image_url: '/api/catalog/image?fileId='+encodeURIComponent(draft.photoFileId!), hidden:false, is_new:true };
  const category = categories.find(c=>c.slug===patch.category_slug)!;
  const list = (v: unknown) => Array.isArray(v) && v.length ? v.join('; ') : 'Not supplied';
  const summary = [
    'NEW PRODUCT · REVIEW BEFORE PUBLISHING', name, 'Category: '+category.title,
    'Price: '+patch.price_text, 'Size: '+(patch.size_text || 'See variants'),
    'Variants: '+(variants.length ? variants.map(v=>v.size+': '+v.price).join('; ') : 'None'),
    'Availability: '+(patch.available_by_order ? 'By order' : patch.stock===0 ? 'Out of stock' : 'Available now'),
    'Stock: '+(patch.stock ?? 'Unknown')+' (total units)',
    'Description / directions / cautions:\n'+patch.description,
    'Ingredients: '+(patch.ingredients || 'Not supplied'), 'Benefits: '+list(patch.benefits),
    'Labels: '+list(patch.best_for), 'Filters: '+list(patch.concerns),
    'Image: the product photo shown with this preview.',
    'After approval: public in '+category.title+' and the shop. Featured on the homepage for exactly 7 days from publication; the regular listing stays afterwards.',
    'Corrections: /draft field=value. A correction invalidates this preview. /discardproduct discards the draft.',
  ].join('\n');
  return {row,summary};
}
