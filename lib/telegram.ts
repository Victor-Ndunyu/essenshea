import type { InlineKeyboard } from './telegram-ui';
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

export async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: InlineKeyboard): Promise<void> {
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
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
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

export async function answerTelegramCallback(callbackId: string, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${getTelegramBotToken()}/answerCallbackQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId, text: text.slice(0, 200) }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error('Telegram callback acknowledgement failed');
}

let callbackUpdatesCheckedAt = 0;
let callbackUpdatesCheck: Promise<void> | null = null;

// Upgrade the existing webhook on the next authorized owner message after release.
// This preserves the configured URL, secret, queued updates and connection limit.
export async function ensureTelegramCallbackUpdates(): Promise<void> {
  if (Date.now() - callbackUpdatesCheckedAt < 300_000) return;
  if (callbackUpdatesCheck) return callbackUpdatesCheck;
  callbackUpdatesCheck = (async () => {
    const token = getTelegramBotToken();
    const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, { signal: AbortSignal.timeout(5_000) });
    const info = await response.json();
    if (!response.ok || !info.ok) throw new Error('Telegram webhook status could not be checked');
    if (!info.result.allowed_updates?.includes('callback_query')) {
      const url = process.env.TELEGRAM_WEBHOOK_URL;
      const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
      if (!url || !secret || info.result.url !== url) throw new Error('Telegram webhook does not match this owner desk');
      const update = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({url,secret_token:secret,allowed_updates:[...new Set([...(info.result.allowed_updates || []),'message','callback_query'])],drop_pending_updates:false,max_connections:info.result.max_connections || 20}),
        signal:AbortSignal.timeout(5_000),
      });
      const result = await update.json();
      if (!update.ok || !result.ok) throw new Error('Telegram approval buttons could not be enabled');
    }
    callbackUpdatesCheckedAt = Date.now();
  })();
  try { await callbackUpdatesCheck; } finally { callbackUpdatesCheck = null; }
}
