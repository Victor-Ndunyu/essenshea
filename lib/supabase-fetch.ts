// Only replay read-only requests. A write with a lost response may have committed.
export async function resilientSupabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const attempts = method === 'GET' || method === 'HEAD' ? 2 : 1;
  for (let i = 0; i < attempts; i++) {
    try {
      const signal = init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000);
      const response = await fetcher(input, { ...init, signal });
      if (i + 1 < attempts && [502, 503, 504].includes(response.status)) {
        await response.body?.cancel();
        continue;
      }
      return response;
    } catch (error) {
      if (i + 1 === attempts || init?.signal?.aborted) throw error;
    }
  }
  throw new Error('Business data unavailable');
}
