const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const AGENT_API_URL = process.env.AGENT_API_URL!;

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN must be set in environment');
}

if (!AGENT_API_URL) {
  throw new Error('AGENT_API_URL must be set in environment');
}

export async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  if (!text || text.length === 0) {
    throw new Error('Message text cannot be empty');
  }

  const truncatedText = text.substring(0, 4096);

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: truncatedText,
        parse_mode: 'Markdown',
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram API error: ${response.statusText} - ${error}`);
  }
}

export async function sendTypingIndicator(chatId: number): Promise<void> {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      action: 'typing',
    }),
  }).catch((err) => console.error('Failed to send typing indicator:', err));
}

export async function callBusinessAgent(message: string, sessionId: string): Promise<string> {
  const response = await fetch(AGENT_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      sessionId,
      source: 'telegram',
    }),
  });

  if (!response.ok) {
    throw new Error(`Agent API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.response || data.text || 'No response from agent';
}
