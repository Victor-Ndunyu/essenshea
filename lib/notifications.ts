import { getSupabaseAdmin } from './supabase-admin';

export type NotificationChannel = 'telegram' | 'whatsapp' | 'email';

export type OrderAlert = {
  orderId: string;
  reference: string;
  text: string;
};

type AttemptResult = {
  channel: NotificationChannel;
  delivered: boolean;
  providerMessageId?: string;
  error?: string;
};

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown notification error';
}

async function recordAttempt(alert: OrderAlert, result: AttemptResult): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('notification_attempts').insert({
    order_id: alert.orderId,
    channel: result.channel,
    status: result.delivered ? 'accepted' : 'failed',
    provider_message_id: result.providerMessageId || null,
    error_message: result.error || null,
  });
  if (error) console.error('Could not record notification attempt:', error.message);
}

async function sendTelegram(text: string): Promise<Omit<AttemptResult, 'channel'>> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.ORDERS_TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('Telegram order notifications are not configured');

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096) }),
    signal: AbortSignal.timeout(8_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error(`Telegram rejected the alert (${response.status})`);
  return { delivered: true, providerMessageId: String(payload.result?.message_id || '') };
}

async function sendWhatsApp(text: string): Promise<Omit<AttemptResult, 'channel'>> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const recipient = process.env.OWNER_WHATSAPP_NUMBER;
  const templateName = process.env.WHATSAPP_ORDER_TEMPLATE;
  if (!token || !phoneNumberId || !recipient || !templateName) {
    throw new Error('WhatsApp owner notifications are not configured');
  }

  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'template',
      template: {
        name: templateName,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: text.slice(0, 900) }] }],
      },
    }),
    signal: AbortSignal.timeout(8_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`WhatsApp rejected the alert (${response.status})`);
  return { delivered: true, providerMessageId: String(payload.messages?.[0]?.id || '') };
}

async function sendEmail(
  subject: string,
  text: string,
  idempotencyKey: string,
): Promise<Omit<AttemptResult, 'channel'>> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_EMAIL_FROM;
  const to = process.env.ALERT_EMAIL_TO || 'kingorivictorki@gmail.com';
  if (!apiKey || !from) throw new Error('Email alerts are not configured');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
    signal: AbortSignal.timeout(8_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Email provider rejected the alert (${response.status})`);
  return { delivered: true, providerMessageId: String(payload.id || '') };
}

export async function notifyOwnerOfOrder(alert: OrderAlert): Promise<AttemptResult[]> {
  const senders: Array<[NotificationChannel, () => Promise<Omit<AttemptResult, 'channel'>>]> = [
    ['telegram', () => sendTelegram(alert.text)],
    ['whatsapp', () => sendWhatsApp(alert.text)],
    [
      'email',
      () =>
        sendEmail(
          `Essenshea order ${alert.reference}`,
          alert.text,
          `essenshea-order-${alert.reference}`,
        ),
    ],
  ];
  const results: AttemptResult[] = [];

  for (const [channel, send] of senders) {
    try {
      const result = { channel, ...(await send()) };
      results.push(result);
      await recordAttempt(alert, result);
      if (result.delivered) break;
    } catch (error) {
      const result: AttemptResult = { channel, delivered: false, error: safeError(error) };
      results.push(result);
      await recordAttempt(alert, result);
      if (channel === 'telegram') {
        await recordRepeatedOperationalFailure(
          'telegram_order_notification_failed',
          'telegram-order-notification',
          result.error || 'Telegram order notification failed',
        );
      }
    }
  }

  return results;
}

async function recordRepeatedOperationalFailure(
  eventType: string,
  fingerprint: string,
  message: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await supabase.from('operational_events').insert({
    event_type: eventType,
    severity: 'error',
    fingerprint,
    safe_message: message.slice(0, 1_000),
  });
  const { count } = await supabase
    .from('operational_events')
    .select('id', { count: 'exact', head: true })
    .eq('fingerprint', fingerprint)
    .gte('created_at', since);

  if (count === 3) {
    try {
      await sendEmail(
        'Essenshea Telegram notifications need attention',
        'Telegram order alerts have failed three times within one hour. Orders remain stored in Supabase; please check the bot token and owner chat ID.',
        `telegram-failure-${new Date().toISOString().slice(0, 13)}`,
      );
    } catch (error) {
      console.error('Repeated-failure email alert failed:', safeError(error));
    }
  }
}

export async function sendOperationalAlert(subject: string, text: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const fingerprint = `${subject}:${text}`.slice(0, 500);
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from('operational_events')
    .select('id')
    .eq('fingerprint', fingerprint)
    .gte('created_at', since)
    .limit(1);
  if (recent?.length) return;

  await supabase.from('operational_events').insert({
    event_type: 'notification_or_provider_failure',
    severity: 'critical',
    fingerprint,
    safe_message: text.slice(0, 1_000),
  });

  try {
    await sendEmail(subject, text, `operational-${fingerprint}`);
  } catch (error) {
    console.error('Operational email alert failed:', safeError(error));
  }
}
