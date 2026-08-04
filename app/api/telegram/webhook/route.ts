import { NextRequest, NextResponse } from 'next/server';
import {
  sendTelegramMessage,
  sendTypingIndicator,
} from '../../../../lib/telegram';
import { handleOwnerTelegramCommand } from '../../../../lib/owner-agent';
import { recordOperationalEvent } from '../../../../lib/operational-events';
import { secretsMatch } from '../../../../lib/security';

export const dynamic = 'force-dynamic';

function validWebhookSecret(provided: string): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return false;
  return secretsMatch(provided, expected);
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!validWebhookSecret(secret)) {
    await recordOperationalEvent({
      eventType: 'telegram_webhook_authentication_failed',
      safeMessage: 'Telegram webhook signature validation failed',
    });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const body = await req.json();
    const message = body?.message;
    if (typeof message?.chat?.id !== 'number') {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const senderId = message.from?.id;
    const chatType = String(message.chat?.type || '');
    const userMessage = String(message.text || message.caption || '').trim().slice(0, 2_000);
    const photos = Array.isArray(message.photo) ? message.photo : [];
    if (!userMessage && photos.length === 0) return NextResponse.json({ ok: true });

    await handleMessage(chatId, userMessage, photos, senderId, chatType);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook failed:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

async function handleMessage(
  chatId: number,
  userMessage: string,
  photos: Array<{ file_id: string; file_size?: number; width?: number; height?: number }> = [],
  senderId?: number,
  chatType = '',
) {
  try {
    await sendTypingIndicator(chatId);
    const canUseOwnerDesk = chatType === 'private' && senderId === chatId;
    if (canUseOwnerDesk && userMessage.toLowerCase() === '/id') {
      await sendTelegramMessage(chatId, `Your Telegram ID is ${chatId}. Add it to the server-only OWNER_TELEGRAM_CHAT_IDS allowlist to authorize this private owner desk.`);
      return;
    }
    const ownerResult = canUseOwnerDesk
      ? await handleOwnerTelegramCommand({ chatId, text: userMessage, photos })
      : { handled: false, response: '' };
    if (ownerResult.handled) {
      await sendTelegramMessage(chatId, ownerResult.response);
      return;
    }
    await recordOperationalEvent({
      eventType: 'telegram_owner_access_denied',
      severity: 'warning',
      safeMessage: 'An unauthorized or non-private Telegram chat attempted to use the owner desk',
      metadata: { chatType: chatType || 'unknown', directPrivateChat: canUseOwnerDesk },
    });
    await sendTelegramMessage(chatId, 'This is Essenshea’s private owner desk. This Telegram account is not authorized. Customer assistance is available on the Essenshea website.');
  } catch (error) {
    console.error('Telegram message processing failed:', error);
    await sendTelegramMessage(
      chatId,
      'The Essenshea owner desk is temporarily unavailable. Please try again shortly.',
    ).catch((sendError) => console.error('Telegram error reply failed:', sendError));
  }
}
