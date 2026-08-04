import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getMergedCatalog, type CatalogData, type CatalogProduct } from './catalog';
import { getSupabaseAdmin } from './supabase-admin';
import { formatSiteFacts } from './site-facts';
import { ownerLowStockThreshold } from './owner-command';

type RecentOrder = {
  reference: string;
  status: string;
  order_type: string;
  fulfilment_method: string;
  payment_status: string;
  notification_status: string;
  created_at: string;
  order_items?: Array<{ title: string; quantity: number }>;
};

type SiteReview = { author: string; role: string | null; text: string; is_visible: boolean };

export type OwnerBusinessData = {
  catalog: CatalogData;
  reviews: SiteReview[];
  recentOrders: RecentOrder[];
  ecoRewards: { activeAccounts: number | null; availableRewards: number | null };
  publicPageText: string;
};

async function loadReviews(): Promise<SiteReview[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('site_reviews')
    .select('author, role, text, is_visible')
    .order('order_index', { ascending: true })
    .limit(30);
  if (error) throw error;
  return (data || []) as SiteReview[];
}

async function loadRecentOrders(): Promise<RecentOrder[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('orders')
    .select('reference, status, order_type, fulfilment_method, payment_status, notification_status, created_at, order_items(title, quantity)')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data || []) as RecentOrder[];
}

async function countRows(table: string, filters: Array<[string, unknown]>): Promise<number | null> {
  let query = getSupabaseAdmin().from(table).select('*', { count: 'exact', head: true });
  for (const [column, value] of filters) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw error;
  return count;
}

async function safeLoad<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    console.error(`Owner data ${label} unavailable:`, error);
    return fallback;
  }
}

async function loadPublicPageText(): Promise<string> {
  const pages = ['index.html', 'about.html', 'shop.html', 'fragrances.html', 'eco-rewards.html', 'reviews.html', 'category.html', 'catalog.html'];
  const sections = await Promise.all(pages.map(async (file) => {
    const html = await fs.readFile(path.join(process.cwd(), 'website', file), 'utf8');
    const text = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(?:39|x27);/gi, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4_000);
    return `${file.replace('.html', '')}: ${text}`;
  }));
  return sections.join('\n');
}

export async function loadOwnerBusinessData(): Promise<OwnerBusinessData> {
  const [catalog, reviews, recentOrders, activeAccounts, availableRewards, publicPageText] = await Promise.all([
    getMergedCatalog({ includeHidden: true }),
    safeLoad('reviews', loadReviews, []),
    safeLoad('orders', loadRecentOrders, []),
    safeLoad('eco accounts', () => countRows('eco_reward_accounts', [['active', true]]), null),
    safeLoad('eco rewards', () => countRows('eco_reward_benefits', [['status', 'available']]), null),
    safeLoad('public pages', loadPublicPageText, 'Public page text unavailable.'),
  ]);
  return { catalog, reviews, recentOrders, ecoRewards: { activeAccounts, availableRewards }, publicPageText };
}

function productStatus(product: CatalogProduct): string {
  if (product.hidden) return 'hidden';
  if (product.availableByOrder) return 'available by order';
  if (typeof product.stock === 'number' && product.stock <= 0) return 'out of stock';
  return 'public';
}

export function formatOwnerBusinessContext(data: OwnerBusinessData): string {
  const catalogue = data.catalog.categories.flatMap((category) =>
    category.products.map((product) => {
      const stock = typeof product.stock === 'number' ? String(product.stock) : 'not set';
      const description = String(product.description || 'description missing').replace(/\s+/g, ' ').slice(0, 320);
      return `- ${product.name} [${product.slug}] | ${category.title} | ${product.price || 'Price on request'} | stock ${stock} | ${productStatus(product)} | ${description}`;
    }),
  );
  const orders = data.recentOrders.map((order) => {
    const items = (order.order_items || []).map((item) => `${item.quantity}× ${item.title}`).join(', ') || 'items unavailable';
    return `- ${order.reference}: ${order.status}; ${order.payment_status}; ${order.fulfilment_method}; ${items}; ${order.created_at}`;
  });
  const reviews = data.reviews.map((review) =>
    `- ${review.is_visible ? 'visible' : 'hidden'}: ${review.author}${review.role ? ` (${review.role})` : ''} — ${review.text.slice(0, 240)}`,
  );
  return [
    'VERIFIED STATIC WEBSITE FACTS',
    formatSiteFacts(),
    '',
    'CURRENT PUBLIC PAGE TEXT (authoritative checked-in website copy)',
    data.publicPageText,
    '',
    'LIVE CATALOGUE (includes hidden owner-managed items)',
    ...catalogue,
    '',
    'RECENT ORDER OPERATIONS (no customer contact details)',
    ...(orders.length ? orders : ['- No recent orders were returned.']),
    '',
    'SITE REVIEWS',
    ...(reviews.length ? reviews : ['- No reviews were returned.']),
    '',
    'ECO-REWARDS OPERATIONS',
    `- Active accounts: ${data.ecoRewards.activeAccounts ?? 'unavailable'}`,
    `- Available rewards: ${data.ecoRewards.availableRewards ?? 'unavailable'}`,
  ].join('\n');
}

export function formatLowStock(data: OwnerBusinessData): string {
  const threshold = ownerLowStockThreshold();
  const items = data.catalog.categories.flatMap((category) =>
    category.products
      .filter((product) => !product.hidden && typeof product.stock === 'number' && product.stock <= threshold)
      .map((product) => `${product.name}: ${product.stock} (${category.title}${product.availableByOrder ? ', by order' : ''})`),
  );
  const unset = data.catalog.categories.flatMap((category) =>
    category.products.filter((product) => !product.hidden && typeof product.stock !== 'number').map((product) => product.name),
  );
  const lines = items.length
    ? [`Products at or below ${threshold}:`, ...items.map((item) => `- ${item}`)]
    : [`No public products are at or below the low-stock threshold of ${threshold}.`];
  if (unset.length) lines.push(`Stock is not set for ${unset.length} product${unset.length === 1 ? '' : 's'}; those items are not counted as healthy stock.`);
  return lines.join('\n');
}

export function formatCatalogHealth(data: OwnerBusinessData): string {
  const publicProducts = data.catalog.categories.flatMap((category) => category.products.filter((product) => !product.hidden));
  const issues = {
    stock: publicProducts.filter((product) => typeof product.stock !== 'number').map((product) => product.name),
    description: publicProducts.filter((product) => !String(product.description || '').trim()).map((product) => product.name),
    image: publicProducts.filter((product) => !String(product.image || '').trim()).map((product) => product.name),
    price: publicProducts.filter((product) => !String(product.price || '').trim()).map((product) => product.name),
  };
  const lines = [
    'Catalogue health:',
    `- Public products: ${publicProducts.length}`,
    `- Hidden products: ${data.catalog.categories.flatMap((category) => category.products).filter((product) => product.hidden).length}`,
    `- Missing stock counts: ${issues.stock.length}`,
    `- Missing descriptions: ${issues.description.length}`,
    `- Missing images: ${issues.image.length}`,
    `- Missing prices: ${issues.price.length}`,
  ];
  for (const [label, products] of Object.entries(issues)) {
    if (products.length) lines.push(`${label} issues: ${products.slice(0, 12).join(', ')}${products.length > 12 ? '…' : ''}`);
  }
  return lines.join('\n');
}

export function formatRecentOrders(data: OwnerBusinessData): string {
  if (!data.recentOrders.length) return 'No recent order requests were returned.';
  return ['Recent order requests:', ...data.recentOrders.slice(0, 10).map((order) => {
    const items = (order.order_items || []).map((item) => `${item.quantity}× ${item.title}`).join(', ') || 'items unavailable';
    const when = new Date(order.created_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
    return `- ${order.reference} — ${order.status}, ${order.payment_status}, ${order.fulfilment_method}; ${items}; ${when}`;
  })].join('\n');
}
