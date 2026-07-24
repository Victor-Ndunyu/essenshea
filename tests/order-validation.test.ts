import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_ITEMS,
  MAX_REQUEST_BYTES,
  requestBodyIsTooLarge,
  validateOrderPayload,
  ValidationError,
} from '../lib/order-validation.ts';
import { createOrderReference } from '../lib/order-reference.ts';

function validPayload() {
  return {
    type: 'cart',
    source: 'website_cart',
    customer: {
      name: 'Amina Njeri',
      phone: '+254 727 349 749',
      preferredContact: 'whatsapp',
      fulfilmentMethod: 'delivery',
      deliveryLocation: 'Westlands, Nairobi',
      ecoRewardsOptIn: true,
    },
    items: [
      {
        productSlug: 'raw-whipped-shea',
        title: 'Raw Whipped Shea',
        quantity: 2,
        priceText: 'KES 850',
        unitPrice: 850,
      },
    ],
  };
}

test('normalizes a valid order without trusting presentation formatting', () => {
  const order = validateOrderPayload(validPayload());
  assert.equal(order.customer.phone, '+254727349749');
  assert.equal(order.customer.preferredContact, 'whatsapp');
  assert.equal(order.customer.ecoRewardsOptIn, true);
  assert.equal(order.items[0].quantity, 2);
  assert.equal(order.items[0].unitPrice, 850);
});

test('maps the existing custom form type to custom_request', () => {
  const payload = validPayload();
  payload.type = 'custom';
  assert.equal(validateOrderPayload(payload).type, 'custom_request');
});

test('requires a delivery location for delivery orders', () => {
  const payload = validPayload();
  payload.customer.deliveryLocation = '';
  assert.throws(() => validateOrderPayload(payload), /delivery town or area/i);
});

test('rejects malformed contact details', () => {
  const payload = validPayload();
  payload.customer.phone = '123';
  assert.throws(() => validateOrderPayload(payload), /valid phone number/i);
});

test('rejects quantity and item-count abuse', () => {
  const payload = validPayload();
  payload.items[0].quantity = 101;
  assert.throws(() => validateOrderPayload(payload), /quantity must be between/i);

  const tooMany = validPayload();
  tooMany.items = Array.from({ length: MAX_ITEMS + 1 }, () => ({
    productSlug: 'shea',
    title: 'Shea',
    quantity: 1,
    priceText: 'Price on request',
    unitPrice: 0,
  }));
  assert.throws(() => validateOrderPayload(tooMany), /at most/i);
});

test('rejects the hidden bot-trap field', () => {
  assert.throws(
    () => validateOrderPayload({ ...validPayload(), companyWebsite: 'spam.example' }),
    ValidationError,
  );
});

test('detects declared oversized payloads', () => {
  assert.equal(requestBodyIsTooLarge(String(MAX_REQUEST_BYTES + 1)), true);
  assert.equal(requestBodyIsTooLarge(String(MAX_REQUEST_BYTES)), false);
  assert.equal(requestBodyIsTooLarge(null), false);
});

test('creates non-sequential, customer-friendly references', () => {
  const date = new Date('2026-07-23T10:00:00.000Z');
  const first = createOrderReference(date);
  const second = createOrderReference(date);
  assert.match(first, /^ESS-20260723-[A-HJ-NP-Z2-9]{4}$/);
  assert.notEqual(first, second);
});
