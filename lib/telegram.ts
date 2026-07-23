function getTelegramBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN must be set in environment');
  }
  return token;
}

function getAgentApiUrl(): string {
  const url = process.env.AGENT_API_URL;
  if (!url) {
    throw new Error('AGENT_API_URL must be set in environment');
  }
  return url;
}

export async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  if (!text || text.length === 0) {
    throw new Error('Message text cannot be empty');
  }

  const botToken = getTelegramBotToken();
  const truncatedText = text.substring(0, 4096);

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: truncatedText,
      }),
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram API error: ${response.statusText} - ${error}`);
  }
}

export async function sendTypingIndicator(chatId: number): Promise<void> {
  const botToken = getTelegramBotToken();
  await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      action: 'typing',
    }),
    signal: AbortSignal.timeout(5_000),
  }).catch((err) => console.error('Failed to send typing indicator:', err));
}

export async function callBusinessAgent(message: string, sessionId: string): Promise<string> {
  const agentUrl = getAgentApiUrl();
  const response = await fetch(agentUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      sessionId,
      source: 'telegram',
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    throw new Error(`Agent API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.response || data.text || 'No response from agent';
}
