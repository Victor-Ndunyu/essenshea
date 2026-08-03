import { getSupabaseAdmin } from './supabase-admin';

type Severity = 'warning' | 'error' | 'critical';

type OperationalEvent = {
  eventType: string;
  severity?: Severity;
  fingerprint?: string;
  safeMessage: string;
  metadata?: Record<string, string | number | boolean | null>;
};

function sanitizeMetadata(metadata: OperationalEvent['metadata'] = {}) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key.slice(0, 80), typeof value === 'string' ? value.slice(0, 300) : value]),
  );
}

export async function recordOperationalEvent(event: OperationalEvent): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin().from('operational_events').insert({
      event_type: event.eventType.slice(0, 120),
      severity: event.severity || 'warning',
      fingerprint: event.fingerprint?.slice(0, 500) || null,
      safe_message: event.safeMessage.slice(0, 1_000),
      metadata: sanitizeMetadata(event.metadata),
    });
    if (error) console.error('Operational event persistence failed:', error.message);
  } catch (error) {
    console.error('Operational event persistence failed:', error instanceof Error ? error.message : 'unknown error');
  }
}
