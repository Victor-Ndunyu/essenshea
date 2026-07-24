import assert from 'node:assert/strict';
import test from 'node:test';
import {
  callChatModel,
  getModelAttempts,
  ModelCallError,
} from '../lib/ai-providers.ts';
import { checkMemoryRateLimit } from '../lib/memory-rate-limit.ts';

test('builds the tested NVIDIA primary and fallback attempts', () => {
  const attempts = getModelAttempts({
    NVIDIA_AGENT_API_KEY: 'nvidia-secret',
  });

  assert.deepEqual(
    attempts.map(({ provider, model }) => ({ provider, model })),
    [
      { provider: 'nvidia', model: 'meta/llama-3.3-70b-instruct' },
      { provider: 'nvidia', model: 'meta/llama-3.1-8b-instruct' },
    ],
  );
});

test('adds Hugging Face and respects the configured provider order', () => {
  const attempts = getModelAttempts({
    NVIDIA_AGENT_API_KEY: 'nvidia-secret',
    HF_TOKEN: 'hf-secret',
    AGENT_PROVIDER_ORDER: 'huggingface,nvidia',
  });

  assert.equal(attempts.length, 3);
  assert.equal(attempts[0].provider, 'huggingface');
  assert.equal(attempts[1].provider, 'nvidia');
  assert.equal(attempts[2].provider, 'huggingface');
  assert.equal(JSON.stringify(attempts).includes('hf-secret'), true);
});

test('deduplicates identical primary and fallback models', () => {
  const attempts = getModelAttempts({
    AGENT_API_KEY: 'legacy-secret',
    AGENT_MODEL: 'meta/llama-3.1-8b-instruct',
    AGENT_FALLBACK_MODEL: 'meta/llama-3.1-8b-instruct',
  });

  assert.equal(attempts.length, 1);
});

test('returns normalized content from an OpenAI-compatible provider', async () => {
  const fetcher = async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: '  Karibu Essenshea.  ' } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  const result = await callChatModel(
    {
      provider: 'nvidia',
      model: 'test-model',
      baseUrl: 'https://example.test/v1',
      apiKey: 'secret',
    },
    [{ role: 'user', content: 'Hello' }],
    fetcher as typeof fetch,
  );

  assert.equal(result.content, 'Karibu Essenshea.');
});

test('turns provider failures into a typed error suitable for fallback', async () => {
  const fetcher = async () => new Response('quota exceeded', { status: 429 });

  await assert.rejects(
    () =>
      callChatModel(
        {
          provider: 'huggingface',
          model: 'test-model',
          baseUrl: 'https://example.test/v1',
          apiKey: 'secret',
        },
        [{ role: 'user', content: 'Hello' }],
        fetcher as typeof fetch,
      ),
    (error: unknown) =>
      error instanceof ModelCallError &&
      error.provider === 'huggingface' &&
      error.status === 429,
  );
});

test('keeps a bounded in-memory rate limit when Supabase is unavailable', () => {
  const key = `agent-test-${Date.now()}-${Math.random()}`;
  assert.equal(
    checkMemoryRateLimit({ key, limit: 2, windowSeconds: 60 }),
    true,
  );
  assert.equal(
    checkMemoryRateLimit({ key, limit: 2, windowSeconds: 60 }),
    true,
  );
  assert.equal(
    checkMemoryRateLimit({ key, limit: 2, windowSeconds: 60 }),
    false,
  );
});
