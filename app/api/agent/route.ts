import { promises as fs } from 'fs';
import path from 'path';

const AGENT_API_KEY = process.env.AGENT_API_KEY || process.env.NVIDIA_AGENT_API_KEY || '';
const AGENT_BASE_URL = process.env.AGENT_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const preferredModel = process.env.AGENT_MODEL || 'google/gemini-2.5-flash';
const fallbackModel = process.env.AGENT_FALLBACK_MODEL || 'groq/llama-3.3-70b-versatile';

const assistantPersona = `You are Essenshea's customer care assistant.
You know the catalog, the collections, and how to explain Essenshea's natural luxury products in calm, clear, warm language.
You speak like a knowledgeable boutique host: polite, helpful, and always oriented around the customer's request.
You can answer questions about product ingredients, request-only ordering, shipping, pickup, and the ritual of self-care.
You are not a salesperson; you are a trusted guide who helps customers choose and request the right items.
`;

const websiteContext = `Essenshea is a premium natural beauty boutique offering body butters, carrier oils, essential oils, hydrosols, gift sets, haircare, and raw butters.
Products are often priced by request and fulfilled with care. The customer can browse categories, request items, and ask for availability or shipping details.
Contact: +254 727 349749 | M-Pesa Till: 9402567
`;

let catalogSummary: string | null = null;

async function getCatalogSummary(): Promise<string> {
  if (catalogSummary) return catalogSummary;

  try {
    const catalogPath = path.join(process.cwd(), 'website', 'data', 'catalog.json');
    const raw = await fs.readFile(catalogPath, 'utf-8');
    const data = JSON.parse(raw);

    const lines: string[] = ['Here is the current Essenshea product catalog:'];

    for (const category of data.categories || []) {
      lines.push(`\n## ${category.title} (${category.items} products)`);
      for (const product of category.products || []) {
        const price = product.price || 'Price on request';
        lines.push(`- ${product.name} — ${price}`);
      }
    }

    catalogSummary = lines.join('\n');
  } catch (err) {
    console.error('Failed to load catalog for agent prompt:', err);
    catalogSummary = '';
  }

  return catalogSummary;
}

async function callModel(model: string, systemPrompt: string, userMessage: string): Promise<string> {
  if (!AGENT_API_KEY) {
    throw new Error('AGENT_API_KEY or NVIDIA_AGENT_API_KEY must be set in environment');
  }

  const response = await fetch(`${AGENT_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AGENT_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Model API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  return content || '';
}

export async function POST(req: Request) {
  try {
    const { message, sessionId, source } = await req.json();

    if (!message || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Message cannot be empty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sourceInstruction =
      source === 'telegram'
        ? 'You are communicating via Telegram. Keep responses concise, conversational, and formatted with Markdown where helpful.'
        : 'You are communicating via the website interface. Keep responses friendly, rich, and helpful.';

    const catalog = await getCatalogSummary();

    const systemPrompt = `${assistantPersona}
${websiteContext}
${catalog}
${sourceInstruction}
If you do not know the answer, say so and offer to help the customer request the item or connect them with the seller.`;

    let agentMessage = await callModel(preferredModel, systemPrompt, message);

    if (!agentMessage) {
      console.warn(`Primary model ${preferredModel} returned empty response, trying fallback ${fallbackModel}`);
      agentMessage = await callModel(fallbackModel, systemPrompt, message);
    }

    if (!agentMessage) {
      agentMessage = 'No response generated.';
    }

    return new Response(
      JSON.stringify({ response: agentMessage, sessionId, source }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Agent error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process message', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
