export const MAX_REQUEST_BYTES = 32_000;
export const MAX_ITEMS = 50;
export const MAX_QUANTITY = 100;

const ORDER_TYPES = new Set([
  'cart',
  'product_request',
  'custom_request',
  'wholesale',
  'retail',
  'general',
  'agent_handoff',
]);

const CONTACT_METHODS = new Set(['phone', 'whatsapp', 'email', 'telegram']);
const FULFILMENT_METHODS = new Set(['delivery', 'pickup', 'discuss']);

export type ValidatedOrderItem = {
  productSlug: string | null;
  title: string;
  quantity: number;
  priceText: string;
  unitPrice: number | null;
};

export type ValidatedOrder = {
  type: string;
  source: string;
  customer: {
    name: string;
    phone: string | null;
    email: string | null;
    contact: string;
    preferredContact: string;
    fulfilmentMethod: string;
    deliveryLocation: string | null;
    notes: string | null;
    ecoRewardsOptIn: boolean;
  };
  items: ValidatedOrderItem[];
};

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeEmail(value: unknown): string | null {
  const email = cleanText(value, 254).toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new ValidationError('Please enter a valid email address');
  }
  return email;
}

function normalizePhone(value: unknown): string | null {
  const raw = cleanText(value, 40);
  if (!raw) return null;
  const phone = raw.replace(/[^\d+]/g, '');
  if (!/^\+?\d{7,15}$/.test(phone)) {
    throw new ValidationError('Please enter a valid phone number');
  }
  return phone;
}

function normalizeType(value: unknown): string {
  const type = cleanText(value, 40).toLowerCase().replace(/\s+/g, '_');
  if (type === 'custom') return 'custom_request';
  return ORDER_TYPES.has(type) ? type : 'general';
}

export function validateOrderPayload(payload: unknown): ValidatedOrder {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('Invalid order request');
  }

  const body = payload as Record<string, unknown>;
  if (cleanText(body.companyWebsite ?? body.website, 200)) {
    throw new ValidationError('Invalid order request');
  }
  const rawItems = body.items;
  const rawCustomer = body.customer;

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new ValidationError('Order must include at least one item');
  }
  if (rawItems.length > MAX_ITEMS) {
    throw new ValidationError(`An order can contain at most ${MAX_ITEMS} items`);
  }
  if (!rawCustomer || typeof rawCustomer !== 'object' || Array.isArray(rawCustomer)) {
    throw new ValidationError('Customer details are required');
  }

  const customer = rawCustomer as Record<string, unknown>;
  const name = cleanText(customer.name, 120);
  const email = normalizeEmail(customer.email);
  const phone = normalizePhone(customer.phone);
  const legacyContact = cleanText(customer.contact, 254);

  if (!name) throw new ValidationError('Customer name is required');
  if (!phone && !email && !legacyContact) {
    throw new ValidationError('A phone number or email address is required');
  }

  const contact = phone || email || legacyContact;
  const preferred = cleanText(customer.preferredContact, 20).toLowerCase();
  const preferredContact = CONTACT_METHODS.has(preferred)
    ? preferred
    : phone
      ? 'phone'
      : 'email';
  const fulfilment = cleanText(customer.fulfilmentMethod, 20).toLowerCase();
  const fulfilmentMethod = FULFILMENT_METHODS.has(fulfilment) ? fulfilment : 'discuss';
  const deliveryLocation = cleanText(customer.deliveryLocation, 200) || null;

  if (fulfilmentMethod === 'delivery' && !deliveryLocation) {
    throw new ValidationError('Please provide a delivery town or area');
  }

  const items = rawItems.map((rawItem, index): ValidatedOrderItem => {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      throw new ValidationError(`Item ${index + 1} is invalid`);
    }
    const item = rawItem as Record<string, unknown>;
    const title = cleanText(item.title ?? item.name, 180);
    if (!title) throw new ValidationError(`Item ${index + 1} needs a product name`);

    const numericQuantity = Number(item.quantity ?? 1);
    if (!Number.isInteger(numericQuantity) || numericQuantity < 1 || numericQuantity > MAX_QUANTITY) {
      throw new ValidationError(`Item ${index + 1} quantity must be between 1 and ${MAX_QUANTITY}`);
    }

    const rawUnitPrice = item.unitPrice ?? item.priceValue;
    const parsedUnitPrice =
      rawUnitPrice === null || rawUnitPrice === undefined || rawUnitPrice === ''
        ? null
        : Number(rawUnitPrice);
    if (parsedUnitPrice !== null && (!Number.isFinite(parsedUnitPrice) || parsedUnitPrice < 0)) {
      throw new ValidationError(`Item ${index + 1} has an invalid price`);
    }

    return {
      productSlug: cleanText(item.productSlug ?? item.slug ?? item.id, 180) || null,
      title,
      quantity: numericQuantity,
      priceText: cleanText(item.priceText ?? item.price, 80) || 'Price on request',
      unitPrice: parsedUnitPrice,
    };
  });

  return {
    type: normalizeType(body.type),
    source: cleanText(body.source, 40) || 'website',
    customer: {
      name,
      phone,
      email,
      contact,
      preferredContact,
      fulfilmentMethod,
      deliveryLocation,
      notes: cleanText(customer.notes, 2_000) || null,
      ecoRewardsOptIn: customer.ecoRewardsOptIn === true,
    },
    items,
  };
}

export function requestBodyIsTooLarge(contentLength: string | null): boolean {
  if (!contentLength) return false;
  const bytes = Number(contentLength);
  return Number.isFinite(bytes) && bytes > MAX_REQUEST_BYTES;
}
