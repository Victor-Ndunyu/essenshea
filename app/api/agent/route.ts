import { Anthropic } from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
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
`;

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

    const systemPrompt = `${assistantPersona}
${websiteContext}
${sourceInstruction}
If you do not know the answer, say so and offer to help the customer request the item or connect them with the seller.`;

    const response = await client.messages.create({
      model: preferredModel,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: message,
        },
      ],
    });

    let agentMessage = '';
    if (Array.isArray(response.content)) {
      const textBlock = response.content.find((block) => block.type === 'text') as { type: 'text'; text: string } | undefined;
      agentMessage = textBlock ? textBlock.text : '';
    }

    if (!agentMessage) {
      const fallbackResponse = await client.messages.create({
        model: fallbackModel,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: message,
          },
        ],
      });

      if (Array.isArray(fallbackResponse.content)) {
        const textBlock = fallbackResponse.content.find((block) => block.type === 'text') as { type: 'text'; text: string } | undefined;
        agentMessage = textBlock ? textBlock.text : 'No response generated.';
      }
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
