import { promises as fs } from 'fs';
import path from 'path';
import { getSupabaseAdmin } from './supabase-admin';

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

type CatalogOverrideRow = {
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

async function loadCatalogOverrides(): Promise<CatalogOverrideRow[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('catalog_overrides')
      .select('product_slug, category_slug, product_name, description, price_text, price_value, image_url, stock, available_by_order, hidden, is_new, sort_order')
      .order('sort_order', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Catalog overrides unavailable:', error);
    return [];
  }
}

function applyOverride(product: CatalogProduct, override: CatalogOverrideRow): CatalogProduct {
  return {
    ...product,
    name: override.product_name || product.name,
    description: override.description ?? product.description,
    price: override.price_text ?? product.price,
    priceValue: override.price_value ?? product.priceValue ?? null,
    image: override.image_url || product.image,
    stock: override.stock,
    availableByOrder: override.available_by_order ?? product.availableByOrder ?? false,
    hidden: override.hidden ?? false,
  };
}

export async function getMergedCatalog(): Promise<CatalogData> {
  const catalog = await loadStaticCatalog();
  const overrides = await loadCatalogOverrides();
  const categories = catalog.categories || [];
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));

  for (const override of overrides) {
    let category = categoryBySlug.get(override.category_slug);
    if (!category) {
      category = {
        slug: override.category_slug,
        title: override.category_slug.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
        description: 'Owner-managed Essenshea products.',
        image: '/assets/images/essenshea-logo.jpg',
        tag: 'Owner update',
        products: [],
      };
      categories.push(category);
      categoryBySlug.set(category.slug, category);
    }

    const index = (category.products || []).findIndex((product) => product.slug === override.product_slug);
    if (index >= 0) {
      category.products[index] = applyOverride(category.products[index], override);
    } else if (override.is_new) {
      category.products = category.products || [];
      category.products.push(applyOverride({
        slug: override.product_slug,
        name: override.product_name || override.product_slug.replace(/-/g, ' '),
        description: override.description || 'Owner-added Essenshea product. Details will be confirmed before fulfilment.',
        price: override.price_text || 'Price on request',
        priceValue: override.price_value,
        image: override.image_url || categoryFallbackImage(category),
      }, override));
    }
  }

  for (const category of categories) {
    category.products = (category.products || [])
      .filter((product) => !product.hidden)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
    category.items = category.products.length;
    category.image = categoryFallbackImage(category);
  }

  catalog.categories = categories.filter((category) => (category.products || []).length > 0);
  return catalog;
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
  const clean = query.toLowerCase().trim();
  if (!clean) return null;
  const catalog = await getMergedCatalog();
  let best: { category: CatalogCategory; product: CatalogProduct; score: number } | null = null;
  for (const category of catalog.categories || []) {
    for (const product of category.products || []) {
      const haystack = `${product.name} ${product.slug} ${category.title}`.toLowerCase();
      let score = 0;
      for (const word of clean.split(/\s+/).filter((item) => item.length > 2)) {
        if (haystack.includes(word)) score += 1;
      }
      if (haystack.includes(clean)) score += 4;
      if (!best || score > best.score) best = { category, product, score };
    }
  }
  return best && best.score > 0 ? { category: best.category, product: best.product } : null;
}
