import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCatalogData } from '../lib/catalog-merge.ts';
import type { CatalogData, CatalogOverrideRow } from '../lib/catalog';

const source: CatalogData = { categories: [
  { slug: 'oils', title: 'Oils', products: [{ slug: 'sample', name: 'Sample Oil', description: 'Original', price: 'KES 500', priceValue: 500, image: '/oil.jpg', stock: 8 }] },
  { slug: 'haircare', title: 'Haircare', products: [] },
] };
function override(patch: Partial<CatalogOverrideRow> = {}): CatalogOverrideRow {
  return { product_slug: 'sample', category_slug: 'oils', product_name: null, description: null, price_text: null, price_value: null, image_url: null, stock: null, available_by_order: null, hidden: null, is_new: false, sort_order: null, ...patch };
}
test('moving an existing product keeps its content and only one listing', () => {
  const result = mergeCatalogData(source, [override({ category_slug: 'haircare', stock: 3 })]);
  assert.deepEqual(result.catalog.categories.map(category => category.slug), ['haircare']);
  assert.equal(result.catalog.categories[0].products[0].description, 'Original');
  assert.equal(result.catalog.categories[0].products[0].stock, 3);
  assert.equal(source.categories[0].products.length, 1);
});
test('owner-created category contains new products and is flagged for review', () => {
  const result = mergeCatalogData(source, [override({ product_slug: 'scrub', category_slug: 'body-scrubs', product_name: 'Scrub', is_new: true })]);
  assert.equal(result.catalog.categories.find(category => category.slug === 'body-scrubs')?.products.length, 1);
  assert.ok(result.issues.some(issue => issue.code === 'owner_category'));
});
test('hidden products stay hidden after category moves', () => {
  const rows = [override({ category_slug: 'haircare', hidden: true })];
  assert.equal(mergeCatalogData(source, rows).catalog.categories.length, 0);
  assert.equal(mergeCatalogData(source, rows, true).catalog.categories[0].products[0].hidden, true);
});
test('orphan edits and missing category assignments are reported without adding phantom items', () => {
  const result = mergeCatalogData(source, [override({ product_slug: 'missing' }), override({ category_slug: ' ' })]);
  assert.ok(result.issues.some(issue => issue.code === 'orphan_override'));
  assert.ok(result.issues.some(issue => issue.code === 'missing_category'));
  assert.equal(result.catalog.categories[0].products.length, 1);
});
test('zero price and stock are preserved and unset prices are reported', () => {
  const result = mergeCatalogData(source, [override({ price_value: 0, price_text: 'KES 0', stock: 0 })]);
  assert.equal(result.catalog.categories[0].products[0].priceValue, 0);
  assert.equal(result.catalog.categories[0].products[0].stock, 0);
  assert.ok(!result.issues.some(issue => issue.code === 'unknown_stock'));
});
