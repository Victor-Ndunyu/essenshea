import { promises as fs } from 'fs';
import path from 'path';
import { getSupabaseAdmin } from './supabase-admin';
import { mergeCatalogData } from './catalog-merge';

export type CatalogProduct = {
  slug: string;
  name: string;
  price?: string;
  priceValue?: number | null;
  description?: string;
  image?: string;
  stock?: number | null;
  availableByOrder?: boolean;
  hidden?: boolean;
  bestFor?: string[] | null;
  concerns?: string[] | null;
  benefits?: string[] | null;
  ingredients?: string | null;
  size?: string | null;
  variants?: Array<{ size: string; priceValue: number; price: string }> | null;
  [key: string]: unknown;
};

export type CatalogCategory = {
  slug: string;
  title: string;
  description?: string;
  image?: string;
  tag?: string;
  items?: number;
  products: CatalogProduct[];
  [key: string]: unknown;
};

export type CatalogData = {
  categories: CatalogCategory[];
};

export type CatalogOverrideRow = {
  product_slug: string;
  category_slug: string;
  product_name: string | null;
  description: string | null;
  price_text: string | null;
  price_value: number | null;
  image_url: string | null;
  stock: number | null;
  available_by_order: boolean | null;
  hidden: boolean | null;
  is_new: boolean | null;
  sort_order: number | null;
  best_for?: string[] | null;
  concerns?: string[] | null;
  benefits?: string[] | null;
  ingredients?: string | null;
  size_text?: string | null;
  variants?: Array<{ size: string; priceValue: number; price: string }> | null;
};

let staticCatalogCache: CatalogData | null = null;

export function slugifyCatalogValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `product-${Date.now()}`;
}

export async function loadStaticCatalog(): Promise<CatalogData> {
  if (staticCatalogCache) return JSON.parse(JSON.stringify(staticCatalogCache));
  const raw = await fs.readFile(path.join(process.cwd(), 'website', 'data', 'catalog.json'), 'utf-8');
  staticCatalogCache = JSON.parse(raw);
  return JSON.parse(JSON.stringify(staticCatalogCache));
}

function categoryFallbackImage(category: CatalogCategory): string {
  return category.image || category.products?.[0]?.image || '/assets/images/essenshea-logo.jpg';
}

async function loadCatalogOverrides(): Promise<{ rows: CatalogOverrideRow[]; available: boolean }> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('catalog_overrides')
      .select('product_slug, category_slug, product_name, description, price_text, price_value, image_url, stock, available_by_order, hidden, is_new, sort_order, best_for, concerns, benefits, ingredients, size_text, variants')
      .order('sort_order', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return { rows: data || [], available: true };
  } catch (error) {
    console.error('Catalog overrides unavailable:', error);
    return { rows: [], available: false };
  }
}

export async function getCatalogSnapshot(options: { includeHidden?: boolean } = {}) {
  const source = await loadStaticCatalog();
  const overrides = await loadCatalogOverrides();
  const snapshot = mergeCatalogData(source, overrides.rows, Boolean(options.includeHidden));
  if (!overrides.available) snapshot.issues.unshift({ code: 'unverified_live_data', message: 'Live saved edits could not be loaded. This is the original catalogue only; category and stock checks are incomplete.' });
  return snapshot;
}

export async function getMergedCatalog(options: { includeHidden?: boolean } = {}): Promise<CatalogData> {
  return (await getCatalogSnapshot(options)).catalog;
}

export async function getCatalogSummary(): Promise<string> {
  const data = await getMergedCatalog();
  const lines: string[] = ['Current Essenshea catalog:'];
  for (const category of data.categories || []) {
    lines.push(`\n## ${category.title}`);
    for (const product of category.products || []) {
      const stock = typeof product.stock === 'number' ? `, stock ${product.stock}` : '';
      const order = product.availableByOrder ? ', available by order' : '';
      lines.push(`- ${product.name} - ${product.price || 'Price on request'}${stock}${order}`);
    }
  }
  return lines.join('\n');
}

export async function findCatalogProduct(query: string): Promise<{ category: CatalogCategory; product: CatalogProduct } | null> {
  const result = await resolveCatalogProduct(query);
  return result.status === 'matched' ? result.match : null;
}

export type CatalogResolution =
  | { status: 'matched'; match: { category: CatalogCategory; product: CatalogProduct } }
  | { status: 'ambiguous'; matches: Array<{ category: CatalogCategory; product: CatalogProduct }> }
  | { status: 'not_found'; matches: [] };

function normalizeCatalogQuery(value: string): string {
  return value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

export async function resolveCatalogProduct(query: string): Promise<CatalogResolution> {
  const clean = normalizeCatalogQuery(query);
  if (!clean) return { status: 'not_found', matches: [] };
  const catalog = await getMergedCatalog({ includeHidden: true });
  const candidates: Array<{ category: CatalogCategory; product: CatalogProduct; score: number }> = [];
  for (const category of catalog.categories || []) {
    for (const product of category.products || []) {
      const normalizedName = normalizeCatalogQuery(product.name);
      const normalizedSlug = normalizeCatalogQuery(product.slug);
      if (clean === normalizedName || clean === normalizedSlug) {
        return { status: 'matched', match: { category, product } };
      }
      const haystack = normalizeCatalogQuery(`${product.name} ${product.slug} ${category.title}`);
      let score = 0;
      const words = clean.split(/\s+/).filter((item) => item.length > 1);
      for (const word of words) {
        if (haystack.split(' ').includes(word)) score += 2;
        else if (haystack.includes(word)) score += 1;
      }
      if (normalizedName.includes(clean)) score += 6;
      if (clean.includes(normalizedName)) score += 5;
      if (score > 0) candidates.push({ category, product, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
  if (!candidates.length) return { status: 'not_found', matches: [] };
  const bestScore = candidates[0].score;
  const plausible = candidates.filter((candidate) => candidate.score >= Math.max(3, bestScore - 1)).slice(0, 5);
  if (plausible.length !== 1) {
    return { status: 'ambiguous', matches: plausible.map(({ category, product }) => ({ category, product })) };
  }
  return { status: 'matched', match: { category: plausible[0].category, product: plausible[0].product } };
}
