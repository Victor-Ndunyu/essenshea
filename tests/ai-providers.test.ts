import assert from 'node:assert/strict';
import test from 'node:test';
import {
  callChatModel,
  getModelAttempts,
  ModelCallError,
  isModelCoolingDown,
} from '../lib/ai-providers.ts';
import { checkMemoryRateLimit } from '../lib/memory-rate-limit.ts';

test('builds the current NVIDIA primary and fallback attempts', () => {
  const attempts = getModelAttempts({
    NVIDIA_AGENT_API_KEY: 'nvidia-secret',
  });

  assert.deepEqual(
    attempts.map(({ provider, model }) => ({ provider, model })),
    [
      { provider: 'nvidia', model: 'nvidia/nemotron-3-super-120b-a12b' },
      { provider: 'nvidia', model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning' },
      { provider: 'nvidia', model: 'nvidia/nemotron-3.5-lightning-30b-a3b' },
    ],
  );
});

test('adds Hugging Face and respects the configured provider order', () => {
  const attempts = getModelAttempts({
    NVIDIA_AGENT_API_KEY: 'nvidia-secret',
    HF_TOKEN: 'hf-secret',
    AGENT_PROVIDER_ORDER: 'huggingface,nvidia',
  });

  assert.equal(attempts.length, 5);
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
    NVIDIA_AGENT_SECOND_FALLBACK_MODEL: 'meta/llama-3.1-8b-instruct',
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


test('disables reasoning for short customer chat without changing other providers', async () => {
  for (const provider of ['nvidia', 'huggingface'] as const) {
    let body: Record<string, unknown> = {};
    const fetcher = async (_url: unknown, init: RequestInit | undefined) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({choices:[{message:{content:'Welcome'}}]}));
    };
    await callChatModel({ provider, model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', baseUrl:'https://example.test/v1', apiKey:'test-only' }, [{role:'user', content:'Hello'}], fetcher as typeof fetch);
    assert.deepEqual(body.chat_template_kwargs, provider === 'nvidia' ? {enable_thinking:false} : undefined);
  }
});


test('keeps every backup and puts independent routes before second models', () => {
  const attempts = getModelAttempts({NVIDIA_AGENT_API_KEY:'n', VERCEL_OIDC_TOKEN:'oidc', HF_TOKEN:'hf'});
  assert.deepEqual(attempts.map(a => a.provider), ['nvidia','gateway','huggingface','nvidia','gateway','huggingface','nvidia']);
  assert.equal(attempts[1].model, 'anthropic/claude-haiku-5.5');
  assert.equal(getModelAttempts({}).length, 0);
});

test('billing failure cools down all models using that credential, leaving independent routes available', async () => {
  const attempts = getModelAttempts({NVIDIA_AGENT_API_KEY:'billing-test', AI_GATEWAY_API_KEY:'gateway-test'});
  await assert.rejects(callChatModel(attempts[0], [], (async () => new Response('', {status:402})) as typeof fetch));
  assert.equal(isModelCoolingDown(attempts[0]), true);
  assert.equal(isModelCoolingDown(attempts[2]), true);
  assert.equal(isModelCoolingDown(attempts[1]), false);
  assert.equal(isModelCoolingDown(attempts[0], Date.now() + 61_000), false);
});

test('a retired model does not block another model on the same host', async () => {
  const attempts = getModelAttempts({NVIDIA_AGENT_API_KEY:'retired-test'});
  await assert.rejects(callChatModel(attempts[0], [], (async () => new Response('', {status:410})) as typeof fetch));
  assert.equal(isModelCoolingDown(attempts[0]), true);
  assert.equal(isModelCoolingDown(attempts[1]), false);
  let calls = 0;
  await assert.rejects(callChatModel(attempts[0], [], (async () => { calls++; return new Response('{}'); }) as typeof fetch));
  assert.equal(calls, 0);
});

test('malformed, empty and truncated replies fail over instead of being shown as successful answers', async () => {
  for (const [index, payload] of ['bad JSON', JSON.stringify({choices:[{message:{content:{foo:'bar'}}}]}), JSON.stringify({choices:[{message:{content:'Cut off'},finish_reason:'length'}]})].entries()) {
    const attempt = {provider:'gateway' as const, model:`invalid-${index}`, apiKey:'invalid-test', baseUrl:'https://example.test/v1'};
    await assert.rejects(callChatModel(attempt, [], (async () => new Response(payload)) as typeof fetch), ModelCallError);
  }
});

test('a timed-out primary falls through to a successful independent provider with identical context', async () => {
  const attempts = getModelAttempts({NVIDIA_AGENT_API_KEY:'outage-test', AI_GATEWAY_API_KEY:'outage-gateway'});
  const messages = [{role:'system' as const, content:'Verified catalogue only'}, {role:'user' as const, content:'Choose a gift'}];
  const received: unknown[] = [];
  const fetcher = async (_url: unknown, init?: RequestInit) => {
    received.push(JSON.parse(String(init?.body)).messages);
    if (received.length === 1) throw new Error('Timeout');
    return new Response(JSON.stringify({choices:[{message:{content:'What scent does the recipient like?'}}]}));
  };
  let result;
  for (const attempt of attempts) {
    try { result = await callChatModel(attempt, messages, fetcher as typeof fetch); break; } catch {}
  }
  assert.equal(result?.provider, 'gateway');
  assert.deepEqual(received, [messages, messages]);
});
