export const ANALYTICS_EVENT_TYPES = [
  'search_no_results',
  'product_view',
  'request_item_added',
  'checkout_started',
  'order_submitted',
  'eco_rewards_interest',
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export type AnalyticsEvent = {
  eventType: AnalyticsEventType;
  productSlug: string | null;
  categorySlug: string | null;
  searchTerm: string | null;
  metadata: Record<string, string | number | boolean | string[]>;
};

const EVENT_TYPES = new Set<string>(ANALYTICS_EVENT_TYPES);
const SAFE_METADATA_KEYS = new Set(['source', 'resultCount', 'itemCount', 'productSlugs', 'fulfilmentMethod']);

function safeSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return clean ? clean.slice(0, 120) : null;
}

function safeSearchTerm(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.toLowerCase().replace(/[^a-z0-9\s-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length >= 2 ? clean.slice(0, 80) : null;
}

function safeMetadata(value: unknown): AnalyticsEvent['metadata'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: AnalyticsEvent['metadata'] = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!SAFE_METADATA_KEYS.has(key)) continue;
    if (typeof entry === 'string') result[key] = entry.slice(0, 120);
    else if (typeof entry === 'number' && Number.isFinite(entry)) result[key] = Math.max(0, Math.min(entry, 10_000));
    else if (typeof entry === 'boolean') result[key] = entry;
    else if (Array.isArray(entry) && key === 'productSlugs') {
      result[key] = entry.map(safeSlug).filter((item): item is string => Boolean(item)).slice(0, 25);
    }
  }
  return result;
}

export function validateAnalyticsEvent(value: unknown): AnalyticsEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid analytics event');
  const input = value as Record<string, unknown>;
  if (typeof input.eventType !== 'string' || !EVENT_TYPES.has(input.eventType)) throw new Error('Unsupported analytics event');
  const eventType = input.eventType as AnalyticsEventType;
  const event: AnalyticsEvent = {
    eventType,
    productSlug: safeSlug(input.productSlug),
    categorySlug: safeSlug(input.categorySlug),
    searchTerm: eventType === 'search_no_results' ? safeSearchTerm(input.searchTerm) : null,
    metadata: safeMetadata(input.metadata),
  };
  if (eventType === 'search_no_results' && !event.searchTerm) throw new Error('A search term is required');
  return event;
}

export function percentageChange(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? 'no change' : 'new activity';
  const change = Math.round(((current - previous) / previous) * 100);
  return change === 0 ? 'no change' : `${change > 0 ? '+' : ''}${change}%`;
}
