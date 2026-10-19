# Owner agent changes and verification — 19 October 2026

## Behaviour delivered

- Every owner turn, including deterministic replies, is retained in recent conversation memory. Permanent owner notes are retrieved separately so chat traffic does not crowd them out.
- Men's product counts and highest-price comparisons are computed from the same product set. Turmeric questions support the spelling “tumeric”; ingredient answers distinguish catalogue mentions from complete verified ingredient lists.
- Confirmation guidance is no longer rejected merely for mentioning confirmation. Fake model execution claims remain blocked.
- Order status, payment status, fulfilment, agreed total and delivery location have saved previews, expiry/cancellation, single approval claims, database stale-write checks and an atomic audit. Order confirmation does not mark payment as received, adjust stock or contact customers.
- Private order details show the customer's recorded contact; follow-up drafts are explicitly unsent. Requested-unit rankings distinguish completed paid quantities from requested quantities and disclose retention limits.
- Customer support requests, complaints, product-reaction reports and answers indicating missing information enter a private escalation queue. Phone/email patterns are redacted from the alert. Delivery uses the current owner allowlist, a two-minute retry lease, per-recipient receipts and at most five attempts. Further attempts occur on subsequent customer traffic or /escalations; there is no independent delivery scheduler. Telegram acceptance is not proof the owner read the message. A process failure between Telegram acceptance and receipt storage can still duplicate an alert.
- Anonymous customer topic signals are available through /learning and included in owner advice. They count mentions, not distinct customers or sales, and never become owner instructions.
- /market scans recent news headlines with links and dates. It does not claim to have verified full articles or comprehensive market coverage. Stored evidence expires after seven days. If the feed fails or returns no current evidence, the agent says so. No owner messages or contact details are forwarded in the search query.
- Explicit natural-language memory requests check storage success; category-topic reminders are surfaced on later category questions.

## Sequential verification

1. Transcript regressions: computed counts, contextual price/category questions, legitimate confirmation language, false execution claims, actual catalogue resolver spelling correction.
2. Orders: full handler preview → approval integration, payment independence, invalid transitions, fulfilment mismatch, stale write failures, draft labeling. Production database transaction test verified stale-write rejection, invalid progression, atomic audit and rollback (zero fixture orders remained).
3. Escalations: saved failures, retry success, repeated-request deduplication, contact redaction and authorized recipient selection. Queue leases prevent concurrent workers from immediately reclaiming an in-flight message.
4. Learning/research: source age filtering, private text exclusion from search queries, topic classification, honest provider outages and evidence persistence.
5. Final results: 109 tests passed, production build passed, git diff --check passed. The transcript replay includes persisted deterministic turns and the saved category reminder; eight concurrent escalation workers produce one accepted delivery in the test. Existing regression suite: product approvals, expiry, races, outsiders/groups, reviews, customer separation, model fallbacks and delivery behaviour. Production build and whitespace checks.

## Limits and acceptance checks

Automated tests include dependency doubles; they do not establish every live model response or signed-in Telegram client interaction. Run the original conversation again, then /orderhelp, /orderdetails REFERENCE, /followup REFERENCE, /learning and /market skincare. Use a disposable order for status mutations. Live news-feed access from the deployed runtime still requires an owner /market check.

Customer follow-up messages are drafts, not automatic outbound WhatsApp/email. Inventory reservation, payment collection/refund execution, delivery-provider tracking, scheduled customer follow-ups and unrestricted autonomous web learning are not implemented by this change.

The Supabase security advisor reports the new tables as RLS-enabled with no client policies, intentionally private to the service role. Client grants were checked as denied. Existing unrelated public-schema visibility and Auth leaked-password warnings were not changed; see https://supabase.com/docs/guides/database/database-linter and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
