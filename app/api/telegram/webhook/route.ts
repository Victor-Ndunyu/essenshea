import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramMessage, sendTypingIndicator, callBusinessAgent } from '../../../../lib/telegram';
import { getOrCreateSession } from '../../../../lib/telegram-sessions';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message;

    if (!message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const userMessage = message.text;

    handleMessage(chatId, userMessage).catch((err) =>
      console.error('Message handling error:', err)
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
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
    console.error(`Error processing message from ${chatId}:`, error);

    try {
      await sendTelegramMessage(
        chatId,
        'Sorry, I encountered an error processing your message. Please try again.'
      );
    } catch (sendError) {
      console.error('Failed to send error message:', sendError);
    }
  }
}
