import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  sendTelegramMessage,
  sendTypingIndicator,
  callBusinessAgent,
} from '../../../../lib/telegram';
import { getOrCreateSession } from '../../../../lib/telegram-sessions';

export const dynamic = 'force-dynamic';

function validWebhookSecret(provided: string): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!validWebhookSecret(secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const body = await req.json();
    const message = body?.message;
    if (!message?.text || typeof message.chat?.id !== 'number') {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const userMessage = String(message.text).trim().slice(0, 2_000);
    if (!userMessage) return NextResponse.json({ ok: true });

    await handleMessage(chatId, userMessage);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook failed:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

async function handleMessage(chatId: number, userMessage: string) {
  try {
    await sendTypingIndicator(chatId);
    const sessionId = await getOrCreateSession(chatId);
    const agentResponse = await callBusinessAgent(userMessage, sessionId);
    await sendTelegramMessage(chatId, agentResponse);
  } catch (error) {
    console.error('Telegram message processing failed:', error);
    await sendTelegramMessage(
      chatId,
      'The Essenshea assistant is temporarily unavailable. Please try again or contact +254 727 349 749.',
    ).catch((sendError) => console.error('Telegram error reply failed:', sendError));
  }
}
