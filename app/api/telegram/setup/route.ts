import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const setupSecret = process.env.TELEGRAM_SETUP_SECRET;
  const authorization = req.headers.get('authorization') || '';
  const providedSecret = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  if (!setupSecret || !secretsMatch(providedSecret, setupSecret)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!botToken || !webhookUrl || !webhookSecret) {
    return NextResponse.json({ error: 'Telegram webhook configuration is incomplete' }, { status: 503 });
  }
  if (!webhookUrl.startsWith('https://')) {
    return NextResponse.json({ error: 'Telegram webhook URL must use HTTPS' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ['message'],
        drop_pending_updates: false,
        max_connections: 20,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      return NextResponse.json({ error: 'Telegram rejected the webhook setup' }, { status: 502 });
    }
    return NextResponse.json({ success: true, webhookUrl });
  } catch (error) {
    console.error('Telegram setup failed:', error);
    return NextResponse.json({ error: 'Telegram setup failed' }, { status: 502 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Use an authenticated POST request' }, { status: 405 });
}
