# Owner agent Stage 2

## Supported product edits
Name, description, numeric price and price text together, stock, category moves, card labels, concern filters, benefits/notes, ingredients, displayed size, variant price lists, availability, visibility, and existing photo updates.

Examples:
- Change the price of Amla Oil to KSh 850
- Move Amla Oil to Haircare
- /edit Amla Oil | price=850 | stock=12
- /setlabels Amla Oil | Hair growth; Scalp comfort
- /setbenefits Amla Oil | Owner-approved note; Another note
- /setingredients Amla Oil | ingredients supplied by owner
- /setsize Amla Oil | 100ml
- /setvariants Amla Oil | 100ml:550;250ml:800
- /categories
- /edit Amla Oil | concerns=hair-growth;scalp-comfort
- Use clear to remove optional lists; price=price on request clears numeric price.

Edits preserve the stable product slug. Category names must match an existing category; no typo-generated categories. New product creation rejects duplicate slugs and saves numeric prices when supplied. Variant prices are displayed as a list; selecting variants for checkout is not added in this stage.

## Reliability
Expanded and legacy product edits use an expiring before/after preview. An approval checks that the product still matches the preview. Database changes and full before/after override history are saved in one transaction. Competing writes use a lock and expected-row comparison. Server reads back the merged product to verify saved fields.
An error is recorded as a failed approval, never as a successful application.
The atomic edit function is security invoker and executable only by service_role. Existing table RLS remains enabled.
Previous values are saved for a future undo interface; this stage does not expose an undo command.
Telegram buttons and guided product selection remain Stage 3.

## Website consistency
Explicit labels/concerns/benefits/ingredients/size/variants override keyword and description-derived values in the shop. Empty arrays deliberately suppress derived labels.
Homepage catalogue navigation now follows live /api/catalog categories, including Body Scrubs.
Reveal threshold corrected in PR 43 for long category sections.
Header signature sits beneath logo and wordmark and remains visible on mobile.
Asset versions are bumped so prior cached styles/scripts refresh.

## Verification
Six product-edit regression tests pass. Database transaction tested under service_role with product fields, atomic audit, and stale rejection; rolled back and verified no persistent test products. Preview build and public-route verification performed before merge.
Owner-account Telegram interaction requires the owner to send an actual request; no Telegram messages were sent on the owner's behalf.
