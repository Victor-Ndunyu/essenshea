import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const webhookUrl = req.nextUrl.searchParams.get('url');

  if (!webhookUrl) {
    return NextResponse.json(
      { error: "Missing 'url' parameter. Example: ?url=https://yourdomain.com/api/telegram/webhook" },
      { status: 400 }
    );
  }

  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return NextResponse.json(
        { error: 'TELEGRAM_BOT_TOKEN not configured in environment' },
        { status: 400 }
      );
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          max_connections: 40,
        }),
      }
    );

    const data = await response.json();

    if (data.ok) {
      return NextResponse.json({
        success: true,
        message: 'Webhook registered successfully',
        webhook_url: webhookUrl,
      });
    } else {
      return NextResponse.json(
        { error: 'Failed to register webhook', details: data },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json(
      { error: 'Setup failed', details: String(error) },
      { status: 500 }
    );
  }
}
