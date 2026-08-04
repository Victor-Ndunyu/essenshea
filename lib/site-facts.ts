export const ESSENSHEA_SITE_FACTS = {
  businessName: 'Essenshea Natural Body Care',
  address: 'Kimathi House, 3rd Floor, Suite 303, KIKAO',
  hours: 'Monday–Saturday, 9:30 AM–6:00 PM',
  phone: '+254 727 349 749',
  ordering: 'Customers build a request list. Essenshea confirms pricing, availability and fulfilment before payment.',
  fulfilment: 'Pickup and delivery can be requested. Delivery location is confirmed with the customer.',
  customOrders: 'Custom formulations are reviewed before Essenshea confirms feasibility, pricing and production timing.',
  ecoRewards: 'Customers return eligible empty containers, pay for a refill and earn punches after the refill is approved. Empty containers received by Friday are prepared for the following Saturday; later drop-offs move to the next cycle.',
} as const;

export function formatSiteFacts(): string {
  return [
    `Business: ${ESSENSHEA_SITE_FACTS.businessName}`,
    `Shop location: ${ESSENSHEA_SITE_FACTS.address}`,
    `Working hours: ${ESSENSHEA_SITE_FACTS.hours}`,
    `Phone/WhatsApp: ${ESSENSHEA_SITE_FACTS.phone}`,
    `Ordering: ${ESSENSHEA_SITE_FACTS.ordering}`,
    `Fulfilment: ${ESSENSHEA_SITE_FACTS.fulfilment}`,
    `Custom orders: ${ESSENSHEA_SITE_FACTS.customOrders}`,
    `Eco-Rewards: ${ESSENSHEA_SITE_FACTS.ecoRewards}`,
  ].join('\n');
}
