import { getSupabaseAdmin } from './supabase-admin';
import { findCatalogProduct, slugifyCatalogValue, getMergedCatalog } from './catalog';

type TelegramPhoto = { file_id: string; file_size?: number; width?: number; height?: number };

type OwnerCommandResult = {
  handled: boolean;
  response: string;
};

function ownerChatIds(): Set<number> {
  const raw = [process.env.OWNER_TELEGRAM_CHAT_ID, process.env.ORDERS_TELEGRAM_CHAT_ID]
    .filter(Boolean)
    .join(',');
  return new Set(raw.split(',').map((item) => Number(item.trim())).filter((item) => Number.isFinite(item)));
}

export function isOwnerTelegramChat(chatId: number): boolean {
  const ids = ownerChatIds();
  return ids.size > 0 && ids.has(chatId);
}

function helpText(): string {
  return [
    'Essenshea owner desk:',
    '/summary ? count public products, stock-set items, by-order items and hidden items',
    '/lowstock ? show products with 3 or fewer items left',
    '/stock product name | 5 ? set stock count and mark available now',
    '/available product name | 5 ? set stock and mark available now',
    '/order product name ? mark available by order',
    '/describe product name ? show exact site description',
    '/find product name ? search catalogue names',
    '/setdesc product name | new description ? update description',
    '/addproduct category | name | price | description ? add product as by order',
    '/hide product name ? remove from public catalogue',
    '/show product name ? restore product',
    'Image update: send a photo with caption /setimage product name',
  ].join('\n');
}

function splitPipeArgs(value: string): string[] {
  return value.split('|').map((item) => item.trim()).filter(Boolean);
}

function latestPhotoFileId(photos?: TelegramPhoto[]): string | null {
  if (!photos?.length) return null;
  return [...photos].sort((a, b) => (b.file_size || 0) - (a.file_size || 0))[0]?.file_id || null;
}

async function logOwnerEvent(chatId: number, eventType: string, productSlug: string | null, payload: Record<string, unknown>) {
  try {
    await getSupabaseAdmin().from('owner_agent_events').insert([{ telegram_chat_id: chatId, event_type: eventType, product_slug: productSlug, payload }]);
  } catch (error) {
    console.error('Owner event log failed:', error);
  }
}

async function upsertOverride(productName: string, patch: Record<string, unknown>, chatId: number): Promise<{ name: string; slug: string; categorySlug: string }> {
  const match = await findCatalogProduct(productName);
  if (!match) throw new Error(`I could not find "${productName}" in the catalogue.`);
  const row = {
    product_slug: match.product.slug,
    category_slug: match.category.slug,
    product_name: match.product.name,
    updated_by: String(chatId),
    updated_at: new Date().toISOString(),
    ...patch,
  };
  const { error } = await getSupabaseAdmin().from('catalog_overrides').upsert(row, { onConflict: 'product_slug' });
  if (error) throw new Error(error.message);
  await logOwnerEvent(chatId, 'catalog_update', match.product.slug, patch);
  return { name: match.product.name, slug: match.product.slug, categorySlug: match.category.slug };
}

async function handleStockCommand(chatId: number, text: string, availableByOrder: boolean): Promise<string> {
  const args = splitPipeArgs(text);
  if (args.length < 2) return 'Use: /stock product name | 5';
  const stock = Number.parseInt(args[1], 10);
  if (!Number.isFinite(stock) || stock < 0) return 'Stock must be a whole number of 0 or more.';
  const updated = await upsertOverride(args[0], { stock, available_by_order: availableByOrder, hidden: false }, chatId);
  return `${updated.name} is updated. Stock: ${stock}. Status: ${availableByOrder ? 'available by order' : 'available now'}.`;
}

async function handleAddProduct(chatId: number, text: string): Promise<string> {
  const args = splitPipeArgs(text);
  if (args.length < 4) return 'Use: /addproduct category | name | price | description';
  const [category, name, price, description] = args;
  const productSlug = slugifyCatalogValue(name);
  const categorySlug = slugifyCatalogValue(category);
  const { error } = await getSupabaseAdmin().from('catalog_overrides').upsert({
    product_slug: productSlug,
    category_slug: categorySlug,
    product_name: name,
    price_text: price,
    description,
    image_url: '/assets/images/essenshea-logo.jpg',
    is_new: true,
    hidden: false,
    available_by_order: true,
    updated_by: String(chatId),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'product_slug' });
  if (error) throw new Error(error.message);
  await logOwnerEvent(chatId, 'catalog_add_product', productSlug, { category, name, price });
  return `${name} has been added under ${category}. It is public as available by order. Send a product photo with caption: /setimage ${name}`;
}

function ownerFallbackText(): string {
  return [
    'I can manage the live site catalogue from here.',
    'Use /summary, /lowstock, /describe product name, /stock product name | 5, /order product name, or /help.',
    'For edits, keep product name and new value separated with a vertical bar: product | value.',
  ].join('\n');
}

async function describeProduct(productName: string): Promise<string> {
  const match = await findCatalogProduct(productName);
  if (!match) return `I could not find "${productName}" in the catalogue.`;
  const product = match.product;
  const stock = typeof product.stock === 'number' ? (product.stock <= 0 ? '\nStock: 0 (currently out)' : '\nStock: ' + product.stock) : '\nStock: not set';
  const order = product.availableByOrder ? '\nStatus: available by order' : typeof product.stock === 'number' && product.stock <= 0 ? '\nStatus: currently out' : '\nStatus: available now or standard request';
  return [`${product.name}`, `Category: ${match.category.title}`, `Price: ${product.price || 'Price on request'}`, stock, order, '', product.description || 'No description is listed.'].join('\n');
}

async function findProductsForOwner(query: string): Promise<string> {
  const catalog = await getMergedCatalog();
  const clean = query.toLowerCase().trim();
  if (!clean) return 'Use: /find product name';
  const matches: string[] = [];
  for (const category of catalog.categories || []) {
    for (const product of category.products || []) {
      const haystack = [product.name, category.title, product.description].join(' ').toLowerCase();
      if (haystack.includes(clean) || clean.split(/\s+/).filter(Boolean).every((word) => haystack.includes(word))) {
        const stock = typeof product.stock === 'number' ? ', stock ' + product.stock : '';
        const status = product.availableByOrder ? ', by order' : typeof product.stock === 'number' && product.stock <= 0 ? ', out' : ', available';
        matches.push(`${product.name} (${category.title}${stock}${status})`);
      }
    }
  }
  return matches.length ? ['Matches:', ...matches.slice(0, 12).map((item) => '- ' + item)].join('\n') : `No public catalogue match for "${query}".`;
}

async function summarizeSite(): Promise<string> {
  const catalog = await getMergedCatalog();
  const lines = ['Current public catalogue:'];
  let total = 0;
  let stockSet = 0;
  let byOrder = 0;
  let out = 0;
  for (const category of catalog.categories || []) {
    const products = category.products || [];
    const count = products.length;
    total += count;
    stockSet += products.filter((product) => typeof product.stock === 'number').length;
    byOrder += products.filter((product) => product.availableByOrder).length;
    out += products.filter((product) => typeof product.stock === 'number' && product.stock <= 0 && !product.availableByOrder).length;
    lines.push(`${category.title}: ${count} item${count === 1 ? '' : 's'}`);
  }
  lines.push(`Total listed: ${total}`);
  lines.push(`Stock counts set: ${stockSet}`);
  lines.push(`Available by order: ${byOrder}`);
  if (out) lines.push(`Currently out: ${out}`);
  return lines.join('\n');
}

async function lowStockSummary(): Promise<string> {
  const catalog = await getMergedCatalog();
  const items: string[] = [];
  for (const category of catalog.categories || []) {
    for (const product of category.products || []) {
      if (typeof product.stock === 'number' && product.stock <= 3 && !product.availableByOrder) {
        items.push(`${product.name}: ${product.stock} left (${category.title})`);
      }
    }
  }
  return items.length ? ['Low stock:', ...items.map((item) => '- ' + item)].join('\n') : 'No low-stock products are currently set at 3 or fewer.';
}

export async function handleOwnerTelegramCommand(params: {
  chatId: number;
  text: string;
  photos?: TelegramPhoto[];
}): Promise<OwnerCommandResult> {
  const { chatId, photos } = params;
  const text = params.text.trim();
  const lower = text.toLowerCase();

  if (!isOwnerTelegramChat(chatId)) {
    return { handled: true, response: ownerFallbackText() };
  }

  try {
    if (lower === '/start' || lower === '/help' || lower === 'help') {
      return { handled: true, response: helpText() };
    }

    if (lower.includes('what is in the site') || lower.includes('is there something in the site') || lower === '/summary') {
      return { handled: true, response: await summarizeSite() };
    }

    if (lower === '/lowstock' || lower === '/low-stock') {
      return { handled: true, response: await lowStockSummary() };
    }

    if (lower.startsWith('/stock ')) {
      return { handled: true, response: await handleStockCommand(chatId, text.slice(7), false) };
    }

    const flexibleStock = text.match(/(?:set|adjust|change).{0,20}(?:stock|amount|number).{0,20}(?:of|for)?\s*(.*?)\s*(?:to|=)\s*(\d+)/i);
    if (flexibleStock) {
      return { handled: true, response: await handleStockCommand(chatId, `${flexibleStock[1]} | ${flexibleStock[2]}`, false) };
    }

    if (lower.startsWith('/available ')) {
      return { handled: true, response: await handleStockCommand(chatId, text.slice(11), false) };
    }

    if (lower.startsWith('/order ')) {
      const updated = await upsertOverride(text.slice(7), { available_by_order: true, stock: null, hidden: false }, chatId);
      return { handled: true, response: `${updated.name} is now marked available by order.` };
    }

    if (lower.startsWith('/describe ')) {
      return { handled: true, response: await describeProduct(text.slice(10)) };
    }

    if (lower.startsWith('/find ')) {
      return { handled: true, response: await findProductsForOwner(text.slice(6)) };
    }

    const descriptionAsk = text.match(/(?:what is|show me|send me).{0,20}description.{0,20}(?:of|for)\s+(.+)/i);
    if (descriptionAsk) {
      return { handled: true, response: await describeProduct(descriptionAsk[1]) };
    }

    if (lower.startsWith('/setdesc ')) {
      const args = splitPipeArgs(text.slice(9));
      if (args.length < 2) return { handled: true, response: 'Use: /setdesc product name | new description' };
      const updated = await upsertOverride(args[0], { description: args.slice(1).join(' | ') }, chatId);
      return { handled: true, response: `${updated.name} description has been updated on the site.` };
    }

    if (lower.startsWith('/addproduct ')) {
      return { handled: true, response: await handleAddProduct(chatId, text.slice(12)) };
    }

    if (lower.startsWith('/hide ')) {
      const updated = await upsertOverride(text.slice(6), { hidden: true }, chatId);
      return { handled: true, response: `${updated.name} is now hidden from the public catalogue.` };
    }

    if (lower.startsWith('/show ')) {
      const updated = await upsertOverride(text.slice(6), { hidden: false }, chatId);
      return { handled: true, response: `${updated.name} is now visible in the public catalogue.` };
    }

    if (lower.startsWith('/setimage ')) {
      const fileId = latestPhotoFileId(photos);
      if (!fileId) return { handled: true, response: 'Send the product photo with caption: /setimage product name' };
      const updated = await upsertOverride(text.slice(10), { image_url: `/api/catalog/image?fileId=${encodeURIComponent(fileId)}` }, chatId);
      return { handled: true, response: `${updated.name} image has been updated on the site.` };
    }

    if (photos?.length) {
      return { handled: true, response: 'I received the image. To attach it to a product, resend it with caption: /setimage product name' };
    }

    return { handled: false, response: '' };
  } catch (error) {
    return { handled: true, response: error instanceof Error ? error.message : 'The owner command failed. Please try again.' };
  }
}
