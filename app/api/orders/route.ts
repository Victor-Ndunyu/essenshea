import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { items, customer, type } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Order must include at least one item' },
        { status: 400 }
      );
    }

    if (!customer || !customer.name || (!customer.contact && !customer.email)) {
      return NextResponse.json(
        { error: 'Customer name and contact are required' },
        { status: 400 }
      );
    }

    const orderSummary = items
      .map((item: { title: string; quantity: number; priceText?: string }) => {
        const qty = item.quantity || 1;
        const price = item.priceText || 'Price on request';
        return `  - ${qty}x ${item.title} (${price})`;
      })
      .join('\n');

    const orderText = `New ${type || 'cart'} order received:\n\nCustomer: ${customer.name}\nContact: ${customer.contact}\n${customer.email ? `Email: ${customer.email}\n` : ''}${customer.notes ? `Notes: ${customer.notes}\n` : ''}\nItems:\n${orderSummary}\n`;

    console.log('Order received:', orderText);

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const notifyChatId = process.env.ORDERS_TELEGRAM_CHAT_ID;

    if (botToken && notifyChatId) {
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: notifyChatId,
            text: orderText,
          }),
        });
      } catch (err) {
        console.error('Failed to send order notification to Telegram:', err);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Order received. The seller will reach out to confirm price and schedule fulfillment.',
      orderId: `order_${Date.now()}`,
    });
  } catch (error) {
    console.error('Order error:', error);
    return NextResponse.json(
      { error: 'Failed to process order', details: String(error) },
      { status: 500 }
    );
  }
}
