# Owner agent: stage 1 catalogue foundation

## Data sources and fields
- website/data/catalog.json: original products and categories. 91 original products across 9 categories.
- Supabase catalog_overrides: live name, description, price_text, price_value, image_url, stock, available_by_order, hidden, category_slug, is_new, sort_order.
- /api/catalog: merged public source consumed by shop, category client, featured care and customer agent.
- Category server rendering now consumes that same merged source with no-store caching.
- website/data/fragrances.json: separate scent library, not the product catalogue. /fragrances intentionally displays scent options.
- Shop concerns and Best for labels (Hair growth, etc.): keyword-derived in website/assets/js/shop.js. They are not stored product fields.
- Product benefits and ingredients: extracted from the description.
- Variants: supported by shop extraction but not present as structured fields in original products or live override schema.
- Cart item quantity is a customer selection; stock is owner inventory; size/volume is currently embedded in names/descriptions.

## Verified live findings, 12 October 2026
- 91 public products across 10 categories: one hidden original product and one owner-added product.
- Body Scrubs is owner-created; its display metadata uses defaults.
- 90 public products lack stock counts. Unknown stock must not be described as verified inventory.
- 64 products lack a numeric price. Many have several size-specific prices embedded in descriptions; do not invent one price.
- 300g Turmeric Face & Body Scrub has price text ksh 1250 and stock 5, but price_value is null. Flagged for repair in stage 2.
- Virgin Olive Oil is hidden in saved owner data; do not restore it automatically.
- Current saved overrides have no category relocation or orphan record. The reported unnamed missing product cannot be conclusively identified without its name.

## Confirmed implementation defects fixed
- Existing products previously received edits only if the override category matched their original category. Category relocations could be ignored or duplicated. Merge now finds products globally by stable slug, preserves existing content, and applies one canonical listing in the assigned category.
- Category HTML server rendering previously loaded static data, disagreeing with shop live data and not initially rendering new categories. Uses the live merged catalogue now.
- Category availability ignored by-order and zero stock; corrected.
- Owner diagnostics now report orphan edits, empty category assignments, duplicate slugs, owner-created category metadata and unstructured prices.
- Failure to load live overrides is explicitly reported to owner diagnostics rather than presenting a clean audit of static data.
- Category client HTML escapes saved owner content.

## Validation and next stage
Regression coverage: category relocation, new categories, hidden moves, orphan/empty assignments, zero values and source immutability.
Stage 2 should add explicit price/variant and product label fields, validate approved edits and save previous values. Stage 3 replaces confirmation code copying with buttons.
No guessed category changes, prices, stock values or product claims were applied.
