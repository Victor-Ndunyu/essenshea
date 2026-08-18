import { getMergedCatalog } from './catalog';
import type { ValidatedOrderItem } from './order-validation';

export type PricedOrder = {
  items: ValidatedOrderItem[];
  total: number;
};

export async function priceOrderForPayment(items: ValidatedOrderItem[]): Promise<PricedOrder> {
  const catalog = await getMergedCatalog();
  const products = new Map<string, { name: string; price?: string; priceValue?: number | null; hidden?: boolean }>();
  for (const category of catalog.categories || []) {
    for (const product of category.products || []) products.set(product.slug, product);
  }
  const priced = items.map((item) => {
    if (!item.productSlug) throw new Error(`${item.title} cannot be paid online until its price is confirmed`);
    const product = products.get(item.productSlug);
    if (!product || product.hidden) throw new Error(`${item.title} is no longer available for online payment`);
    if (typeof product.priceValue !== 'number' || !Number.isFinite(product.priceValue) || product.priceValue <= 0) {
      throw new Error(`${product.name} needs a confirmed price before M-Pesa payment`);
    }
    return { ...item, title: product.name, priceText: product.price || `KES ${product.priceValue}`, unitPrice: product.priceValue };
  });
  return { items: priced, total: priced.reduce((sum, item) => sum + (item.unitPrice || 0) * item.quantity, 0) };
}

