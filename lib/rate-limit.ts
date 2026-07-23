import { createHash } from 'crypto';
import { getSupabaseAdmin } from './supabase-admin';

type RateLimitOptions = {
  key: string;
  limit: number;
  windowSeconds: number;
};

export function getClientAddress(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') || 'unknown';
}

export async function checkRateLimit({ key, limit, windowSeconds }: RateLimitOptions): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const keyHash = createHash('sha256').update(key).digest('hex');
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);

  const { data: existing, error: selectError } = await supabase
    .from('api_rate_limits')
    .select('id, request_count')
    .eq('key_hash', keyHash)
    .eq('window_start', windowStart.toISOString())
    .maybeSingle();

  if (selectError) throw new Error(`Rate limit check failed: ${selectError.message}`);
  if (existing && existing.request_count >= limit) return false;

  if (existing) {
    const { error } = await supabase
      .from('api_rate_limits')
      .update({ request_count: existing.request_count + 1 })
      .eq('id', existing.id);
    if (error) throw new Error(`Rate limit update failed: ${error.message}`);
  } else {
    const { error } = await supabase.from('api_rate_limits').insert({
      key_hash: keyHash,
      window_start: windowStart.toISOString(),
      request_count: 1,
      expires_at: new Date(windowStart.getTime() + windowSeconds * 2000).toISOString(),
    });
    if (error && error.code !== '23505') {
      throw new Error(`Rate limit insert failed: ${error.message}`);
    }
  }

  return true;
}
