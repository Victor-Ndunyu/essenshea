import type { CatalogCategory, CatalogProduct } from './catalog';

export const CONCERNS = ['hair-growth','dry-skin','glow','stretch-marks','acne-prone','scalp-comfort','mens-care','fragrance','custom-care','gifts'];
export type ProductPatch = Record<string, unknown>;

export function ownerMoney(value: string): number | null {
  if (/^(?:request|price on request)$/i.test(value.trim())) return null;
  const text = value.trim().replace(/^(?:ksh|kes)\s*/i, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) throw new Error('Use a valid numeric price, for example KSh 1,250.');
  const clean = text.replace(/,/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) throw new Error('Use one price, for example 850 or KSh 850. Use variants for several size prices.');
  const amount = Number(clean);
  if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) throw new Error('Price must be between 0 and 10,000,000 KSh.');
  return amount;
}
export function ownerStock(value: string): number | null {
  if (/^(?:unknown|unset)$/i.test(value.trim())) return null;
  if (!/^\d+$/.test(value.trim())) throw new Error('Stock must be a whole number, such as 12. Use unknown to clear it.');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n > 2147483647) throw new Error('Stock is too large.');
  return n;
}
function ownerList(value: string, limit = 12): string[] {
  if (/^(?:none|clear)$/i.test(value.trim())) return [];
  const values = value.split(';').map(item => item.trim()).filter(Boolean);
  if (!values.length || values.length > limit || values.some(item => item.length > 500)) throw new Error('Use up to ' + limit + ' short entries separated by semicolons.');
  return [...new Set(values)];
}
export function parseProductEdit(command: string, categories: CatalogCategory[]): { query: string; patch: ProductPatch } {
  const parts = command.replace(/^\/edit\s+/i, '').split('|').map(item => item.trim());
  const query = parts.shift() || '';
  if (!query || !parts.length) throw new Error('Use /edit Product Name | price=850 | stock=12. Fields: name, description, price, stock, category, labels, concerns, benefits, ingredients, size, variants, availability, visibility.');
  const patch: ProductPatch = {};
  for (const part of parts) {
    const split = part.indexOf('=');
    if (split < 1) throw new Error('Each change needs field=value, for example price=850.');
    const key = part.slice(0, split).trim().toLowerCase();
    const value = part.slice(split+1).trim();
    if (!value) throw new Error(key + ' needs a value. Use clear for optional lists.');
    if (key === 'name') {
      if (value.length > 180) throw new Error('Product names must be at most 180 characters.');
      patch.product_name = value;
    } else if (key === 'description') {
      if (value.length > 6000) throw new Error('Keep the description under 6,000 characters.');
      patch.description = value;
    } else if (key === 'price') {
      const amount = ownerMoney(value);
      patch.price_value = amount;
      patch.price_text = amount === null ? 'Price on request' : 'KSh ' + amount.toLocaleString('en-KE', { maximumFractionDigits: 2 });
    } else if (key === 'stock') patch.stock = ownerStock(value);
    else if (key === 'category') {
      const normalize = (s: string) => s.toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]/g,'');
      const matches = categories.filter(category => normalize(category.slug) === normalize(value) || normalize(category.title) === normalize(value));
      if (matches.length !== 1) throw new Error('Choose an existing category: ' + categories.map(category => category.title).join(', '));
      patch.category_slug = matches[0].slug;
    } else if (key === 'labels' || key === 'bestfor') patch.best_for = ownerList(value, 6);
    else if (key === 'concerns') {
      const values = ownerList(value).map(item => item.toLowerCase().replace(/\s+/g,'-'));
      if (values.some(item => !CONCERNS.includes(item))) throw new Error('Concern choices: ' + CONCERNS.join(', ') + '. Use clear to remove them.');
      patch.concerns = values;
    } else if (key === 'benefits') patch.benefits = ownerList(value);
    else if (key === 'ingredients' || key === 'size') {
      if (value.length > 2000) throw new Error(key + ' is too long.');
      patch[key === 'size' ? 'size_text' : 'ingredients'] = /^clear$/i.test(value) ? '' : value;
    } else if (key === 'variants') {
      if (/^clear$/i.test(value)) patch.variants = [];
      else {
        const values = ownerList(value).map(item => {
          const i = item.lastIndexOf(':');
          if (i <= 0) throw new Error('Use variants=100ml:550;250ml:800');
          const size = item.slice(0,i).trim();
          const priceValue = ownerMoney(item.slice(i+1));
          if (!size || size.length > 80 || priceValue === null) throw new Error('Each size needs a numeric price.');
          return { size, priceValue, price: 'KSh ' + priceValue.toLocaleString('en-KE') };
        });
        if (new Set(values.map(item => item.size.toLowerCase())).size !== values.length) throw new Error('Each variant size must be unique.');
        patch.variants = values;
      }
    } else if (key === 'availability') {
      if (!/^(?:now|by order)$/i.test(value)) throw new Error('Availability must be now or by order.');
      patch.available_by_order = value.toLowerCase() === 'by order';
    } else if (key === 'visibility') {
      if (!/^(?:visible|hidden)$/i.test(value)) throw new Error('Visibility must be visible or hidden.');
      patch.hidden = value.toLowerCase() === 'hidden';
    } else throw new Error('Unknown field "' + key + '". Use /help for supported fields.');
  }
  return { query, patch };
}
export function productRecord(product: CatalogProduct, categorySlug: string): ProductPatch {
  return { category_slug: categorySlug, product_name: product.name, description: product.description ?? null, price_text: product.price ?? null, price_value: product.priceValue ?? null, image_url: product.image ?? null, stock: product.stock ?? null, available_by_order: Boolean(product.availableByOrder), hidden: Boolean(product.hidden), best_for: product.bestFor ?? null, concerns: product.concerns ?? null, benefits: product.benefits ?? null, ingredients: product.ingredients ?? null, size_text: product.size ?? null, variants: product.variants ?? null };
}
export function productEditPreview(before: ProductPatch, patch: ProductPatch): string {
  return Object.entries(patch).map(([key,value]) => {
    const format = (v: unknown) => v == null ? 'not set' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return key.replace(/_/g,' ') + ': ' + format(before[key]) + ' → ' + format(value);
  }).join('\n');
}
