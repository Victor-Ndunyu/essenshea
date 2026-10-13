import { getVercelOidcToken } from '@vercel/oidc';

export type AiProviderName = 'nvidia' | 'huggingface' | 'gateway';

export type ModelAttempt = {
  provider: AiProviderName;
  model: string;
  baseUrl: string;
  apiKey: string;
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ModelCallResult = {
  content: string;
  provider: AiProviderName;
  model: string;
};

export class ModelCallError extends Error {
  readonly provider: AiProviderName;
  readonly model: string;
  readonly status?: number;

  constructor(
    message: string,
    provider: AiProviderName,
    model: string,
    status?: number,
  ) {
    super(message);
    this.name = 'ModelCallError';
    this.provider = provider;
    this.model = model;
    this.status = status;
  }
}

type Environment = Record<string, string | undefined>;

const DEFAULT_NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_HUGGING_FACE_BASE_URL = 'https://router.huggingface.co/v1';
const DEFAULT_PROVIDER_ORDER: AiProviderName[] = ['nvidia', 'gateway', 'huggingface'];
export const MODEL_CHAIN_BUDGET_MS = 28_000;
const cooldowns = new Map<string, number>();
const providerKey = (attempt: ModelAttempt) => `${attempt.provider}:${attempt.baseUrl}:${attempt.apiKey}`;
const modelKey = (attempt: ModelAttempt) => `${providerKey(attempt)}:${attempt.model}`;

export function isModelCoolingDown(attempt: ModelAttempt, now = Date.now()): boolean {
  return [providerKey(attempt), modelKey(attempt)].some(key => (cooldowns.get(key) || 0) > now);
}

function coolDown(attempt: ModelAttempt, status?: number) {
  // Auth, billing and rate limits affect a credential; model errors affect one model.
  const shared = status !== undefined && [401, 402, 403, 429].includes(status);
  for (const [key, until] of cooldowns) if (until <= Date.now()) cooldowns.delete(key);
  if (cooldowns.size >= 100) cooldowns.delete(cooldowns.keys().next().value!);
  cooldowns.set(shared ? providerKey(attempt) : modelKey(attempt), Date.now() + (shared ? 60_000 : 30_000));
}

function nonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function providerOrder(value: string | undefined): AiProviderName[] {
  const requested = (value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(
      (item): item is AiProviderName =>
        item === 'nvidia' || item === 'huggingface' || item === 'gateway',
    );

  return requested.length ? [...new Set(requested)] : DEFAULT_PROVIDER_ORDER;
}

export function getModelAttempts(env: Environment = process.env): ModelAttempt[] {
  const nvidiaKey = nonEmpty(env.NVIDIA_AGENT_API_KEY) || nonEmpty(env.AGENT_API_KEY);
  const huggingFaceKey = nonEmpty(env.HF_TOKEN);
  const gatewayKey = nonEmpty(env.AI_GATEWAY_API_KEY) || nonEmpty(env.VERCEL_OIDC_TOKEN);

  const attemptsByProvider: Record<AiProviderName, ModelAttempt[]> = {
    nvidia: nvidiaKey
      ? [
          {
            provider: 'nvidia',
            baseUrl:
              nonEmpty(env.NVIDIA_AGENT_BASE_URL) ||
              nonEmpty(env.AGENT_BASE_URL) ||
              DEFAULT_NVIDIA_BASE_URL,
            apiKey: nvidiaKey,
            model:
              nonEmpty(env.NVIDIA_AGENT_MODEL) ||
              nonEmpty(env.AGENT_MODEL) ||
              'nvidia/nemotron-3-super-120b-a12b',
          },
          {
            provider: 'nvidia',
            baseUrl:
              nonEmpty(env.NVIDIA_AGENT_BASE_URL) ||
              nonEmpty(env.AGENT_BASE_URL) ||
              DEFAULT_NVIDIA_BASE_URL,
            apiKey: nvidiaKey,
            model:
              nonEmpty(env.NVIDIA_AGENT_FALLBACK_MODEL) ||
              nonEmpty(env.AGENT_FALLBACK_MODEL) ||
              'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
          },
          {
            provider: 'nvidia',
            baseUrl: nonEmpty(env.NVIDIA_AGENT_BASE_URL) || nonEmpty(env.AGENT_BASE_URL) || DEFAULT_NVIDIA_BASE_URL,
            apiKey: nvidiaKey,
            model: nonEmpty(env.NVIDIA_AGENT_SECOND_FALLBACK_MODEL) || 'nvidia/nemotron-3.5-lightning-30b-a3b',
          },
        ]
      : [],
    gateway: gatewayKey
      ? ['AI_GATEWAY_AGENT_MODEL', 'AI_GATEWAY_AGENT_FALLBACK_MODEL'].map((key, index) => ({
          provider: 'gateway' as const,
          baseUrl: 'https://ai-gateway.vercel.sh/v1',
          apiKey: gatewayKey,
          model: nonEmpty(env[key]) || ['anthropic/claude-haiku-5.5', 'google/gemini-3.8-flash'][index],
        }))
      : [],
    huggingface: huggingFaceKey
      ? [
          {
            provider: 'huggingface',
            baseUrl:
              nonEmpty(env.HF_AGENT_BASE_URL) || DEFAULT_HUGGING_FACE_BASE_URL,
            apiKey: huggingFaceKey,
            model:
              nonEmpty(env.HF_AGENT_MODEL) ||
              'meta-llama/Llama-3.3-70B-Instruct:fastest',
          },
          {
            provider: 'huggingface',
            baseUrl:
              nonEmpty(env.HF_AGENT_BASE_URL) || DEFAULT_HUGGING_FACE_BASE_URL,
            apiKey: huggingFaceKey,
            model:
              nonEmpty(env.HF_AGENT_FALLBACK_MODEL) ||
              'meta-llama/Llama-3.1-8B-Instruct:fastest',
          },
        ]
      : [],
  };

  const seen = new Set<string>();
  const attempts: ModelAttempt[] = [];
  const orderedProviders = providerOrder(env.AGENT_PROVIDER_ORDER);
  const widestProviderChain = Math.max(
    ...orderedProviders.map((provider) => attemptsByProvider[provider].length),
    0,
  );

  for (let modelIndex = 0; modelIndex < widestProviderChain; modelIndex += 1) {
    for (const provider of orderedProviders) {
      const attempt = attemptsByProvider[provider][modelIndex];
      if (!attempt) continue;
      const key = `${attempt.provider}:${attempt.model}`;
      if (seen.has(key)) continue;
      seen.add(key);
      attempts.push(attempt);
    }
  }

  return attempts;
}

// Vercel Functions carry fresh OIDC tokens in request context, not necessarily env.
export async function getRuntimeModelAttempts(
  env: Environment = process.env,
  readToken: () => Promise<string> = getVercelOidcToken,
): Promise<ModelAttempt[]> {
  if (!nonEmpty(env.AI_GATEWAY_API_KEY) && env.VERCEL === '1') {
    try {
      const token = await readToken();
      return getModelAttempts({ ...env, VERCEL_OIDC_TOKEN: token });
    } catch {
      console.warn('Customer AI Gateway OIDC token unavailable');
    }
  }
  return getModelAttempts(env);
}

export async function callChatModel(
  attempt: ModelAttempt,
  messages: ChatMessage[],
  fetcher: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<ModelCallResult> {
  if (isModelCoolingDown(attempt)) {
    throw new ModelCallError('Provider is temporarily cooling down', attempt.provider, attempt.model);
  }
  let response: Response;
  try {
    response = await fetcher(`${attempt.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${attempt.apiKey}`,
      },
      body: JSON.stringify({
        model: attempt.model,
        messages,
        max_tokens: attempt.provider === 'gateway' ? 1_200 : 450,
        ...(attempt.provider === 'gateway' && attempt.model === 'anthropic/claude-haiku-5.5'
          ? { reasoning: { effort: 'none' } } : {}),
        ...(attempt.provider === 'gateway' && attempt.model === 'google/gemini-3.8-flash'
          ? { reasoning: { effort: 'low' } } : {}),
        temperature: 0.3,
        ...(attempt.provider === 'nvidia' && /^nvidia\/nemotron-3(?:-|\.)/.test(attempt.model)
          ? { chat_template_kwargs: { enable_thinking: false } }
          : {}),
      }),
      signal: AbortSignal.timeout(Math.max(1, Math.min(10_000, timeoutMs))),
    });
  } catch {
    coolDown(attempt);
    throw new ModelCallError(
      'Request failed or timed out',
      attempt.provider,
      attempt.model,
    );
  }

  if (!response.ok) {
    coolDown(attempt, response.status);
    await response.body?.cancel();
    throw new ModelCallError(
      `Provider returned status ${response.status}`,
      attempt.provider,
      attempt.model,
      response.status,
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    coolDown(attempt);
    throw new ModelCallError('Provider returned invalid JSON', attempt.provider, attempt.model);
  }
  const message = data?.choices?.[0]?.message?.content;
  const content = typeof message === 'string' ? message.trim() : '';
  if (!content || data?.choices?.[0]?.finish_reason === 'length') {
    coolDown(attempt);
    throw new ModelCallError(
      'Provider returned an empty or incomplete response',
      attempt.provider,
      attempt.model,
      response.status,
    );
  }

  cooldowns.delete(modelKey(attempt));
  return {
    content,
    provider: attempt.provider,
    model: attempt.model,
  };
}
