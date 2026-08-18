const DEFAULT_BASE_URL = 'https://api.safaricom.co.ke';

type MpesaConfig = {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackUrl: string;
  transactionType: 'CustomerBuyGoodsOnline' | 'CustomerPayBillOnline';
};

export type StkPushResult = {
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

function getConfig(): MpesaConfig {
  const siteUrl = required('NEXT_PUBLIC_SITE_URL').replace(/\/$/, '');
  const transactionType = process.env.MPESA_TRANSACTION_TYPE === 'CustomerPayBillOnline'
    ? 'CustomerPayBillOnline'
    : 'CustomerBuyGoodsOnline';
  return {
    baseUrl: (process.env.MPESA_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
    consumerKey: required('MPESA_CONSUMER_KEY'),
    consumerSecret: required('MPESA_CONSUMER_SECRET'),
    shortcode: required('MPESA_SHORTCODE'),
    passkey: required('MPESA_PASSKEY'),
    callbackUrl: `${siteUrl}/api/payments/mpesa/callback`,
    transactionType,
  };
}

export function normalizeKenyanPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  throw new Error('Enter a valid Kenyan Safaricom phone number');
}

function timestamp(date = new Date()): string {
  const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${eat.getUTCFullYear()}${pad(eat.getUTCMonth() + 1)}${pad(eat.getUTCDate())}${pad(eat.getUTCHours())}${pad(eat.getUTCMinutes())}${pad(eat.getUTCSeconds())}`;
}

async function accessToken(config: MpesaConfig): Promise<string> {
  const credentials = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
  const response = await fetch(`${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new Error(`Daraja authorization failed (${response.status})`);
  }
  return body.access_token;
}

export async function initiateStkPush(input: {
  amount: number;
  phone: string;
  reference: string;
}): Promise<StkPushResult> {
  const config = getConfig();
  const phone = normalizeKenyanPhone(input.phone);
  const amount = Math.round(input.amount);
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('M-Pesa amount must be at least KES 1');
  const time = timestamp();
  const password = Buffer.from(`${config.shortcode}${config.passkey}${time}`).toString('base64');
  const token = await accessToken(config);
  const response = await fetch(`${config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: config.shortcode,
      Password: password,
      Timestamp: time,
      TransactionType: config.transactionType,
      Amount: amount,
      PartyA: phone,
      PartyB: config.shortcode,
      PhoneNumber: phone,
      CallBackURL: config.callbackUrl,
      AccountReference: input.reference.slice(0, 12),
      TransactionDesc: `Essenshea ${input.reference}`.slice(0, 32),
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || body.ResponseCode !== '0') {
    const message = String(body.errorMessage || body.ResponseDescription || `Daraja request failed (${response.status})`);
    throw new Error(message);
  }
  return {
    merchantRequestId: String(body.MerchantRequestID),
    checkoutRequestId: String(body.CheckoutRequestID),
    responseCode: String(body.ResponseCode),
    responseDescription: String(body.ResponseDescription || ''),
    customerMessage: String(body.CustomerMessage || 'Check your phone to complete payment.'),
  };
}
