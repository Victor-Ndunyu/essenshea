import assert from 'node:assert/strict';
import test from 'node:test';
import { getWelcomeReply, getServiceReply, getCatalogReply, formatCustomerCatalog, hasUnsupportedTreatmentClaim, getCustomerReplyActions } from '../lib/customer-guide.ts';
import { ESSENSHEA_SITE_FACTS } from '../lib/site-facts.ts';

const catalog = { categories: [{ slug: 'carrier-oils', title: 'Carrier Oils', products: [
  { slug: 'amla-oil', name: 'Amla Oil', price: 'KSh 500', description: 'Catalogue description', ingredients: 'Amla', hidden: false },
  { slug: 'hidden-amla', name: 'Amla Secret', price: 'KSh 900', hidden: true },
  { slug: 'castor-oil', name: 'Castor Oil', price: 'KSh 300' },
] }] };

test('greets without treating a mixed greeting and question as small talk', () => {
  assert.match(getWelcomeReply('Hi!!!')!.response, /Welcome to Essenshea/);
  assert.match(getWelcomeReply('habari')!.response, /Karibu/);
  assert.equal(getWelcomeReply('Hi, do you have amla oil?'), null);
  assert.equal(getWelcomeReply('thank you, but how much is delivery?'), null);
});

test('service answers use published facts without inventing delivery costs', () => {
  assert.match(getServiceReply('Where are you?', ESSENSHEA_SITE_FACTS)!.response, /Kimathi House/);
  assert.match(getServiceReply('opening hours', ESSENSHEA_SITE_FACTS)!.response, /9:30 AM/);
  assert.match(getServiceReply('how much is delivery?', ESSENSHEA_SITE_FACTS)!.response, /confirm the delivery fee/);
  assert.equal(getServiceReply('are you open and do you have amla?', ESSENSHEA_SITE_FACTS), null);
});

test('provider outage still finds named products and respects hidden items', () => {
  const reply = getCatalogReply('Do you have amla oil?', catalog, true);
  assert.match(reply.response, /Amla Oil: KSh 500/);
  assert.doesNotMatch(reply.response, /Secret|Castor/);
  assert.equal(reply.actions[0].href, '/shop?product=amla-oil');
});

test('unverified saved edits never become a live stock or price claim', () => {
  const reply = getCatalogReply('amla oil price', catalog, false);
  assert.doesNotMatch(reply.response, /500|in stock|available now/i);
  assert.match(reply.response, /could not be checked/);
  const context = formatCustomerCatalog(catalog, 'amla', false);
  assert.doesNotMatch(context, /KSh 500|Secret/);
  assert.match(context, /Do not quote prices/);
});

test('unmatched or medical requests are not turned into random product recommendations', () => {
  for (const message of ['cure painful acne', 'do you have nonexistent oil', 'what is my order status']) {
    const reply = getCatalogReply(message, catalog, true);
    assert.match(reply.response, /can’t give a personalised answer/);
    assert.equal(reply.actions[1].href, 'https://wa.me/254727349749');
  }
});


test('rejects treatment promises while allowing an explicit disclaimer', () => {
  assert.equal(hasUnsupportedTreatmentClaim('It treats eczema and acne and heals wounds.'), true);
  assert.equal(hasUnsupportedTreatmentClaim('It promotes healthy hair growth.'), true);
  assert.equal(hasUnsupportedTreatmentClaim('This product does not treat eczema.'), false);
  assert.equal(hasUnsupportedTreatmentClaim('This product moisturizes skin.'), false);
});

test('excludes medical marketing claims from model context', () => {
  const data = {categories:[{slug:'butters',title:'Body Butters',products:[{slug:'lavender',name:'Lavender Whipped Shea Butter 250ml',description:'A lavender scent. Treats eczema and acne. Heals wounds. Promotes healthy hair growth.'}]}]};
  const context = formatCustomerCatalog(data, 'lavender', true);
  assert.match(context, /lavender scent/);
  assert.doesNotMatch(context, /Treats|Heals|Promotes/);
  assert.deepEqual(getCustomerReplyActions('We have Lavender Whipped Shea Butter in a 250ml jar.', data), [{label:'Lavender Whipped Shea Butter 250ml',href:'/shop?product=lavender'}]);
  assert.equal(getCustomerReplyActions('Welcome to Essenshea!', data).length, 0);
  assert.match(getCatalogReply('I want a body butter with a lavender scent. What do you have?',data,true).response,/Lavender Whipped/);
});

test('minor spelling differences get a confirmation question, not a missing-product assertion',()=>{
 const result=getCatalogReply('castoor oil',catalog,true);
 assert.match(result.response,/Did you mean Castor Oil/);
 assert.doesNotMatch(result.response,/missing|unavailable|escalat/i);
});
