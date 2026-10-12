import type { CatalogData, CatalogProduct, CatalogCategory, CatalogOverrideRow } from './catalog';

export type CatalogIssue = { code: string; productSlug?: string; message: string };

export function mergeCatalogData(source: CatalogData, overrides: CatalogOverrideRow[], includeHidden = false): { catalog: CatalogData; issues: CatalogIssue[] } {
  const catalog: CatalogData = JSON.parse(JSON.stringify(source));
  const issues: CatalogIssue[] = [];
  const categories = catalog.categories || [];
  const categoryBySlug = new Map(categories.map(category => [category.slug, category]));
  const locationBySlug = new Map<string, CatalogCategory>();
  for (const category of categories) {
    for (const product of category.products || []) {
      if (locationBySlug.has(product.slug)) issues.push({ code: 'duplicate_product', productSlug: product.slug, message: product.name + ' is listed more than once; review its category assignments.' });
      else locationBySlug.set(product.slug, category);
    }
  }
  for (const override of overrides) {
    const origin = locationBySlug.get(override.product_slug);
    const base = origin?.products.find(product => product.slug === override.product_slug);
    if (!base && !override.is_new) {
      issues.push({ code: 'orphan_override', productSlug: override.product_slug, message: (override.product_name || override.product_slug) + ' has saved edits but no base product and is not marked as new; it is not listed.' });
      continue;
    }
    const targetSlug = override.category_slug?.trim();
    if (!targetSlug) {
      issues.push({ code: 'missing_category', productSlug: override.product_slug, message: (override.product_name || override.product_slug) + ' has no category assignment; saved edits cannot be listed safely.' });
      continue;
    }
    let target = categoryBySlug.get(targetSlug);
    if (!target) {
      target = { slug: targetSlug, title: targetSlug.replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()), description: 'Owner-managed Essenshea products.', image: '/assets/images/essenshea-logo.jpg', tag: 'Owner update', products: [] };
      categories.push(target);
      categoryBySlug.set(targetSlug, target);
      issues.push({ code: 'owner_category', productSlug: override.product_slug, message: 'Owner-created category "' + target.title + '" needs its display name, description and image reviewed.' });
    }
    const product: CatalogProduct = {
      ...(base || { slug: override.product_slug, name: override.product_slug.replace(/-/g, ' ') }),
      name: override.product_name || base?.name || override.product_slug.replace(/-/g, ' '),
      description: override.description ?? base?.description ?? '',
      price: override.price_text ?? base?.price ?? 'Price on request',
      priceValue: override.price_text !== null ? (override.price_value ?? null) : (override.price_value ?? base?.priceValue ?? null),
      image: override.image_url || base?.image || target.image || '/assets/images/essenshea-logo.jpg',
      stock: override.stock,
      bestFor: override.best_for ?? base?.bestFor,
      concerns: override.concerns ?? base?.concerns,
      benefits: override.benefits ?? base?.benefits,
      ingredients: override.ingredients ?? base?.ingredients,
      size: override.size_text ?? base?.size,
      variants: override.variants ?? base?.variants,
      availableByOrder: override.available_by_order ?? base?.availableByOrder ?? false,
      hidden: override.hidden ?? base?.hidden ?? false,
    };
    // An override owns one canonical listing, including when moving a base product.
    for (const category of categories) category.products = (category.products || []).filter(item => item.slug !== override.product_slug);
    target.products.push(product);
    locationBySlug.set(product.slug, target);
  }
  for (const category of categories) {
    for (const product of category.products || []) {
      if (product.hidden) continue;
      if (!product.name?.trim()) issues.push({ code: 'missing_name', productSlug: product.slug, message: product.slug + ' has no product name.' });
      if (!product.description?.trim() || product.description === 'See product listing for details.') issues.push({ code: 'missing_description', productSlug: product.slug, message: product.name + ' needs a useful description.' });
      if (!product.image || product.image === '/assets/images/essenshea-logo.jpg') issues.push({ code: 'missing_image', productSlug: product.slug, message: product.name + ' needs a product image.' });
      if (typeof product.priceValue !== 'number') issues.push({ code: 'unstructured_price', productSlug: product.slug, message: product.name + ': numeric price is not set; confirm a single price or size-specific variants before enabling numeric totals.' });
      if (typeof product.stock !== 'number') issues.push({ code: 'unknown_stock', productSlug: product.slug, message: product.name + ': stock is unknown, not confirmed in stock.' });
    }
    category.products = (category.products || []).filter(product => includeHidden || !product.hidden).sort((a,b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    category.items = category.products.length;
    category.image = category.image || category.products[0]?.image || '/assets/images/essenshea-logo.jpg';
  }
  catalog.categories = categories.filter(category => category.products.length);
  return { catalog, issues };
}
