export type AiProviderName = 'nvidia' | 'huggingface';

export type ModelAttempt = {
  provider: AiProviderName;
  model: string;
  baseUrl: string;
  apiKey: string;
};

export type ChatMessage = {
  role: 'system' | 'user';
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
const DEFAULT_PROVIDER_ORDER: AiProviderName[] = ['nvidia', 'huggingface'];
const MAX_MODEL_ATTEMPTS = 3;

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
        item === 'nvidia' || item === 'huggingface',
    );

  return requested.length ? [...new Set(requested)] : DEFAULT_PROVIDER_ORDER;
}

export function getModelAttempts(env: Environment = process.env): ModelAttempt[] {
  const nvidiaKey = nonEmpty(env.NVIDIA_AGENT_API_KEY) || nonEmpty(env.AGENT_API_KEY);
  const huggingFaceKey = nonEmpty(env.HF_TOKEN);

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
              'meta/llama-3.3-70b-instruct',
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
              'meta/llama-3.1-8b-instruct',
          },
        ]
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

  return attempts.slice(0, MAX_MODEL_ATTEMPTS);
}

export async function callChatModel(
  attempt: ModelAttempt,
  messages: ChatMessage[],
  fetcher: typeof fetch = fetch,
): Promise<ModelCallResult> {
  let response: Response;
  try {
    response = await fetcher(`${attempt.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${attempt.apiKey}`,
      },
      body: JSON.stringify({
        model: attempt.model,
        messages,
        max_tokens: 450,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new ModelCallError(
      `Request failed: ${error instanceof Error ? error.message : String(error)}`,
      attempt.provider,
      attempt.model,
    );
  }

  if (!response.ok) {
    throw new ModelCallError(
      `Provider returned status ${response.status}`,
      attempt.provider,
      attempt.model,
      response.status,
    );
  }

  const data = await response.json();
  const content = String(data.choices?.[0]?.message?.content || '').trim();
  if (!content) {
    throw new ModelCallError(
      'Provider returned an empty response',
      attempt.provider,
      attempt.model,
      response.status,
    );
  }

  return {
    content,
    provider: attempt.provider,
    model: attempt.model,
  };
}
