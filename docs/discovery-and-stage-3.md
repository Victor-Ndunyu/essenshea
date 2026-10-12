# Public discovery and owner desk Stage 3

## Search and AI access

Production site: https://essenshea.vercel.app/

Public HTML now includes canonical URLs, page descriptions, social previews and verified Nairobi shop structured data. Collections have unique metadata and crawlable product links. Individual product URLs display the current public catalogue without requiring JavaScript, with a link to the existing request/options flow. Hidden products return 404. Unknown prices or stock are not invented in structured data.

The live sitemap includes the six public landing pages, every category and every public product. `/llms.txt` indexes the business and collections; `/llms-full.txt` includes the public descriptions, displayed prices, sizes and variants. These are generated from live catalogue data. A catalogue outage returns 503 for discovery feeds and product/collection pages instead of exposing stale hidden products. Account/admin pages are noindex; API and private routes are excluded from the sitemap.

Google does not require llms.txt for AI features, and indexing/ranking is never guaranteed:
https://developers.google.com/search/docs/appearance/ai-features

### Owner action to complete indexing submission

1. Open https://search.google.com/search-console and add the URL-prefix property `https://essenshea.vercel.app/`.
2. Choose HTML file verification and provide that exact verification file for deployment, or provide the exact HTML verification tag. No Google account password is needed.
3. After verification, submit `https://essenshea.vercel.app/sitemap.xml` under Sitemaps.
4. Inspect the homepage, shop and Carrier Oils collection, then request indexing. Check Pages for crawl/indexing errors.
5. Add this exact website URL to Essenshea's existing Instagram and verified Google Business Profile. Confirm current business address/phone in external profiles. Do not claim/create duplicate profiles or publish unverified business facts.

No Search Console submission or Business Profile edit is claimed by this implementation. Search results can take time to change; no promise of first-page ranking or AI recommendations is made.

## Telegram Stage 3

- Preview replies include Approve change / Cancel buttons while retaining typed commands.
- Ambiguous product edits show up to five named/category choices. Selecting one only prepares a fresh preview; it never approves the edit.
- Selection tokens are owner-scoped, expire in ten minutes and can be consumed once.
- `/products` opens paginated product buttons (eight per page), including hidden owner-managed products. Selecting a product shows current details. Use the existing field-edit commands to prepare changes.
- Callback requests require the webhook secret, a private chat, sender matching chat ID, and the owner allowlist before any owner data is read or changed.
- Approval reuses the existing atomic claim, stale edit checks, transactional history and read-back verification. Cancel now claims the pending row atomically too.
- The next authorized owner message checks the webhook and adds `callback_query` to allowed updates if needed, preserving the configured URL/secret and queued updates. `/api/telegram/setup` also registers both message and callback updates.
- Used buttons may remain visible in Telegram, but tokens refuse a second application. Fresh responses state their outcome.

## Verification

Unit and mocked integration tests cover disclosure prevention, callback parsing, owner-only routing, ambiguity/selection, replay, expiry, cancellation, stale previews, escaped HTML/JSON, missing prices/stock and sitemap/product links. Production build and deployed route checks are required before release. No real owner messages are sent during automated verification; the owner should send `/products` and preview a harmless edit to check the Telegram client UI.
