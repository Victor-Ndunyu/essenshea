/** Public, fixed sources. Owner messages never become fetch destinations. */
export const COMPETITORS = [
  { id: 'ythera', name: 'Ythera', origin: 'https://ytherake.com' },
  { id: 'cinnabar-green', name: 'Cinnabar Green', origin: 'https://cinnabargreen.com' },
] as const;
export type Competitor = typeof COMPETITORS[number];
export type CompetitorProduct = {
  key: string; name: string; variant: string; price: number; currency: string;
  compareAt: number | null; url: string; size: string | null;
};
export type CompetitorEvidence = { products: CompetitorProduct[]; sampled: boolean; currency: string };

export function robotsAllow(text: string, path: string): boolean {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let group = { agents: [] as string[], rules: [] as Array<{ allow: boolean; path: string }> };
  for (const line of text.split(/\r?\n/)) {
    const match = line.replace(/#.*/, '').trim().match(/^(user-agent|allow|disallow):\s*(.*)$/i);
    if (!match) continue;
    if (match[1].toLowerCase() === 'user-agent') {
      if (group.rules.length) { groups.push(group); group = { agents: [], rules: [] }; }
      group.agents.push(match[2].toLowerCase());
    } else if (group.agents.length && match[2]) group.rules.push({ allow: match[1].toLowerCase() === 'allow', path: match[2] });
  }
  groups.push(group);
  const specific = groups.filter(g => g.agents.some(a => a !== '*' && 'essenshearesearch'.startsWith(a)));
  const applicable = specific.length ? specific : groups.filter(g => g.agents.includes('*'));
  const matching = applicable.flatMap(g => g.rules).filter(rule => {
    const expression = rule.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
    return new RegExp('^' + expression).test(path);
  }).sort((a, b) => b.path.replace(/\*/g, '').length - a.path.replace(/\*/g, '').length || Number(b.allow) - Number(a.allow));
  return matching[0]?.allow ?? true;
}

async function boundedText(url: string, origin: string, fetcher: typeof fetch): Promise<string> {
  // No off-site redirects, credentials, arbitrary ports, or owner-supplied URLs.
  for (let redirects = 0; redirects < 3; redirects++) {
    if (new URL(url).origin !== origin) throw new Error('Source redirected outside its verified domain');
    const response = await fetcher(url, {
      headers: { 'User-Agent': 'EssensheaResearch/1.0 (+https://essenshea.vercel.app)' },
      redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(6000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Missing redirect destination');
      url = new URL(location, url).href;
      await response.body?.cancel();
      continue;
    }
    if (!response.ok) throw new Error('Public source unavailable');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Empty source');
    let bytes = 0;
    let text = '';
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 1_500_000) { await reader.cancel(); throw new Error('Source exceeds scan limit'); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  }
  throw new Error('Too many source redirects');
}

export function parseCompetitorProducts(raw: unknown, html: string, competitor: Competitor): CompetitorEvidence {
  const currency = html.match(/Shopify\.currency\s*=\s*\{\s*"active"\s*:\s*"([A-Z]{3})"/)?.[1];
  if (!currency) throw new Error('Source currency cannot be verified');
  const entries = (raw as { products?: unknown[] })?.products;
  if (!Array.isArray(entries) || !entries.length) throw new Error('No verified product records');
  const products: CompetitorProduct[] = [];
  for (const value of entries.slice(0, 100)) {
    const p = value as Record<string, any>;
    if (!p || typeof p.title !== 'string' || typeof p.handle !== 'string' || !/^[a-z0-9-]+$/.test(p.handle) || !Array.isArray(p.variants)) continue;
    for (const v of p.variants.slice(0, 20)) {
      if (!v || !/^\d+$/.test(String(v.id)) || !/^\d+(?:\.\d{1,2})?$/.test(String(v.price))) continue;
      const price = Number(v.price);
      if (!Number.isFinite(price) || price < 0 || price > 10_000_000) continue;
      const compareAt = /^\d+(?:\.\d{1,2})?$/.test(String(v.compare_at_price)) ? Number(v.compare_at_price) : null;
      const name = p.title.replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, 180);
      const variant = String(v.title || '').replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, 100);
      const size = (name + ' ' + variant).match(/\b(\d+(?:\.\d+)?)\s*(ml|g|kg|litres?|liters?|l)\b/i)?.[0] || null;
      products.push({ key: p.handle + ':' + v.id, name, variant, price, currency, compareAt, size, url: competitor.origin + '/products/' + p.handle });
    }
  }
  if (!products.length) throw new Error('Product records could not be validated');
  return { products, sampled: entries.length >= 100, currency };
}

export async function fetchCompetitor(competitor: Competitor, fetcher: typeof fetch = fetch): Promise<CompetitorEvidence> {
  if (!COMPETITORS.some(c => c.origin === competitor.origin && c.id === competitor.id)) throw new Error('Unknown source');
  const rules = await boundedText(competitor.origin + '/robots.txt', competitor.origin, fetcher);
  if (!robotsAllow(rules, '/') || !robotsAllow(rules, '/products.json?limit=100')) throw new Error('Source does not allow this scan');
  const [html, json] = await Promise.all([
    boundedText(competitor.origin + '/', competitor.origin, fetcher),
    boundedText(competitor.origin + '/products.json?limit=100', competitor.origin, fetcher),
  ]);
  return parseCompetitorProducts(JSON.parse(json), html, competitor);
}

export function compareCompetitor(current: CompetitorEvidence, previous?: CompetitorEvidence): string[] {
  if (!previous) return ['First recorded baseline. No change or launch date can be inferred yet.'];
  const old = new Map(previous.products.map(p => [p.key, p]));
  const changes: string[] = [];
  for (const p of current.products) {
    const before = old.get(p.key);
    if (!before) { changes.push('Newly observed listing: ' + p.name + '. This is not a verified launch date.'); continue; }
    if (p.currency !== before.currency || p.variant !== before.variant || p.size !== before.size) continue;
    if (p.price !== before.price) changes.push(`${p.name} (${p.variant}): ${p.currency} ${before.price} → ${p.price}.`);
    if (p.compareAt !== before.compareAt && p.compareAt !== null && p.compareAt > p.price) changes.push(`${p.name}: source now lists ${p.currency} ${p.price} against a comparison price of ${p.compareAt}; promotion terms need checking.`);
  }
  // A capped or failed scan cannot establish delistings, sales, or market-wide trends.
  return changes.length ? changes.slice(0, 8) : ['No observed price or newly listed-product changes in the comparable sample.'];
}
