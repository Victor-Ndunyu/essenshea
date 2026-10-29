import { COMPETITORS, fetchCompetitor, compareCompetitor, type CompetitorEvidence } from './competitor-sources';
import { getSupabaseAdmin } from './supabase-admin';
import { getCatalogSnapshot } from './catalog';
import { callChatModel, getRuntimeModelAttempts, isModelCoolingDown } from './ai-providers';
import { customerLearningContext } from './owner-research';

export type CompetitorSnapshot = { competitor_id: string; captured_at: string; status: 'ok' | 'unavailable'; evidence: CompetitorEvidence | null };

export function isCompetitorRequest(text: string): boolean {
  return /^\/competitors(?:\s|$)/i.test(text) || /\b(?:competitors?|competition|competing brands)\b/i.test(text);
}

export function canNudgeCompetitors(text: string, response: string, failed = false, hasPhotos = false): boolean {
  if (failed || hasPhotos || isCompetitorRequest(text)) return false;
  // Never interrupt actions, pending clarifications, payments, support, or approvals.
  if (/\/(?:confirm|cancel|choose)\b|approval preview|reply with.*category|which order reference|nothing.*changed/i.test(response)) return false;
  if (/order|payment|refund|complaint|urgent|error|problem|remember|remind|cancel|proceed|approve|confirm|change|update|move|edit|hide|delete|remove|stock|set|add|category|categories/i.test(text)) return false;
  return !text.startsWith('/') || /^\/(?:start|dashboard|summary|insights|learning)$/.test(text);
}

export async function scanCompetitors(): Promise<{ scanned: number; failed: number; skipped: boolean }> {
  const db = getSupabaseAdmin();
  const { data: runId, error: lockError } = await db.rpc('claim_competitor_scan');
  if (lockError) throw new Error('Competitor scan storage unavailable');
  if (!runId) return { scanned: 0, failed: 0, skipped: true };
  const results = await Promise.all(COMPETITORS.map(async c => {
    let evidence: CompetitorEvidence | null = null;
    try { evidence = await fetchCompetitor(c); } catch { /* An outage must not become a fake product change. */ }
    const status = evidence ? 'ok' : 'unavailable';
    const { error } = await db.from('competitor_snapshots').insert({ run_id: runId, competitor_id: c.id, status, evidence });
    if (error) throw new Error('Competitor observation could not be saved');
    return status;
  }));
  return { scanned: results.filter(r => r === 'ok').length, failed: results.filter(r => r !== 'ok').length, skipped: false };
}

async function snapshots(): Promise<CompetitorSnapshot[]> {
  const { data, error } = await getSupabaseAdmin().from('competitor_snapshots')
    .select('competitor_id,captured_at,status,evidence').order('captured_at', { ascending: false }).limit(80);
  if (error) throw new Error('Competitor history unavailable');
  return data || [];
}

export function competitorFacts(rows: CompetitorSnapshot[], now = Date.now()): { text: string; fresh: boolean; freshSources: number[] } {
  let fresh = false;
  const freshSources: number[] = [];
  const sections = COMPETITORS.map((c, index) => {
    const all = rows.filter(row => row.competitor_id === c.id);
    const good = all.filter(row => row.status === 'ok' && row.evidence);
    const current = good[0];
    if (!current) return `[${index + 1}] ${c.name}: unavailable; no verified baseline yet.\n${c.origin}`;
    const age = now - Date.parse(current.captured_at);
    const stale = !Number.isFinite(age) || age > 8 * 86400000 || age < 0;
    if (!stale) { fresh = true; freshSources.push(index + 1); }
    const evidence = current.evidence!;
    const changes = compareCompetitor(evidence, good[1]?.evidence || undefined);
    const examples = evidence.products.filter(p => !/clearance/i.test(p.name)).filter(p => /body|shea|butter|oil|mist|refill|gift/i.test(p.name)).slice(0, 3);
    return [`[${index + 1}] ${c.name} — observed ${current.captured_at.slice(0, 10)}${stale ? ' (STALE — refresh needed)' : ''}`,
      all[0]?.status === 'unavailable' ? 'Latest fetch failed; the following is the last successful observation.' : '',
      `${evidence.products.length} product variants observed${evidence.sampled ? ' in a capped sample of 100 products' : ''}; not a sales ranking.`,
      good[1] ? `Compared with ${good[1].captured_at.slice(0, 10)}:` : '',
      ...changes.map(change => '- ' + change),
      ...examples.map(p => `- ${p.name}${p.variant !== 'Default Title' ? ' — ' + p.variant : ''}: ${p.currency} ${p.price}${p.size ? '; '+p.size : '; size unverified'}\n${p.url}`),
      c.origin,
    ].filter(Boolean).join('\n');
  });
  return { text: sections.join('\n\n'), fresh, freshSources };
}

async function improvementAdvice(facts: string, question: string, freshSources: number[]): Promise<string> {
  const snapshot = await getCatalogSnapshot({ includeHidden: false });
  if (snapshot.issues.some(i => i.code === 'unverified_live_data')) return 'Your live catalogue could not be verified, so I cannot make a grounded comparison yet.';
  const products = snapshot.catalog.categories.flatMap(c => c.products);
  const sizeMissing = products.filter(p => !p.size && !/\b\d+(?:\.\d+)?\s*(?:ml|g|kg|litres?|liters?)\b/i.test(p.name + ' ' + (p.description || ''))).length;
  const ingredientsMissing = products.filter(p => !p.ingredients && !/ingredients?\s*:/i.test(p.description || '')).length;
  const priceMissing = products.filter(p => typeof p.priceValue !== 'number').length;
  return `Catalogue review: ${sizeMissing} listings have no size detected in structured fields, name or description; ${ingredientsMissing} have no ingredient field or labelled ingredient text detected; ${priceMissing} lack a structured numeric price. These are extraction checks, not proof that customer-facing information is absent. Custom and multi-size offers may legitimately need individual pricing.\n\nNext step: select an existing Essenshea product and verify a same-category competitor variant, size, currency and regular price from its linked listing before comparing value. Clearance offers must be evaluated separately. No new variant or discount is recommended from this baseline alone.\nMeasure any agreed experiment using completed orders and gross margin, not competitor listing presence. Public listings do not establish demand or promotion effectiveness.`;

}

export async function competitorReport(chatId: number, text: string): Promise<string> {
  const db = getSupabaseAdmin();
  const control = text.trim().match(/^\/competitors\s+(off|on|snooze)$/i);
  if (control) {
    const option = control[1].toLowerCase();
    const { error } = await db.from('owner_competitor_preferences').upsert({ telegram_chat_id: chatId,
      ...(option === 'snooze' ? { snoozed_until: new Date(Date.now() + 30 * 86400000).toISOString() } : { nudges_enabled: option === 'on', snoozed_until: null }),
    }, { onConflict: 'telegram_chat_id' });
    if (error) return 'That reminder preference could not be saved. Please retry.';
    return option === 'snooze' ? 'Competitor nudges paused for 30 days. You can still ask for a review anytime.' : `Competitor nudges ${option === 'on' ? 'enabled' : 'disabled'}. Weekly research continues; /competitors shows the latest observations.`;
  }
  const { error: preferenceError } = await db.from('owner_competitor_preferences').upsert({ telegram_chat_id: chatId, last_reviewed_at: new Date().toISOString() }, { onConflict: 'telegram_chat_id' });
  let rows = await snapshots();
  const latest = rows[0];
  let refreshProblem = '';
  if (/\brefresh\b/i.test(text) || !latest || Date.now() - Date.parse(latest.captured_at) > 86400000) {
    try {
      const result = await scanCompetitors();
      if (result.skipped) refreshProblem = 'A scan is already running or was attempted in the last 15 minutes. Showing saved observations.';
      rows = await snapshots();
    } catch { refreshProblem = 'The refresh could not be saved. Showing the available history.'; }
  }
  const facts = competitorFacts(rows);
  const advice = facts.fresh ? await improvementAdvice(facts.text, text, facts.freshSources) : 'Fresh competitor evidence is unavailable. I cannot claim current competitor trends. Try /competitors refresh later.';
  return ['Competitor review — ' + COMPETITORS.map(c => c.name).join(', '), refreshProblem, facts.text, advice,
    'Coverage: selected public catalogue listings; prices are observed asking prices. Social posts, ads, private sales and the wider market are not covered. Newly observed does not mean newly launched.',
    'Weekly checks: Mondays around 8 AM Nairobi time. Nudges: after 14 days without a review, at most once per 14 days during a suitable owner conversation. /competitors snooze pauses them for 30 days; /competitors off disables nudges.',
    preferenceError ? 'The review was generated, but its reminder timestamp could not be saved.' : '',
  ].filter(Boolean).join('\n\n');
}

export async function competitorNudge(chatId: number): Promise<string> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc('claim_competitor_nudge', { p_chat_id: chatId });
    if (error || !data) return '';
    return 'Small business check-in: it has been a while since your competitor review. Ask “What can we improve based on competitors?” when you have a moment. /competitors snooze keeps this quiet for 30 days.';
  } catch { return ''; }
}
