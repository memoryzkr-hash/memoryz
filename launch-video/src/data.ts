/** Fictional-but-familiar money sources used across the film. Colours are approximate brand hues. */
export type Service = { name: string; color: string; glyph: string; glyphInk?: string };

export const SERVICES = {
  stripe: { name: 'Stripe', color: '#635BFF', glyph: 'S' },
  paypal: { name: 'PayPal', color: '#1F6FD1', glyph: 'P' },
  shopify: { name: 'Shopify', color: '#5E8E3E', glyph: 'S' },
  gumroad: { name: 'Gumroad', color: '#FF90E8', glyph: 'G', glyphInk: '#14121C' },
  patreon: { name: 'Patreon', color: '#F96854', glyph: 'P' },
  etsy: { name: 'Etsy', color: '#F1641E', glyph: 'E' },
  substack: { name: 'Substack', color: '#FF6719', glyph: 'S' },
  youtube: { name: 'YouTube', color: '#E62117', glyph: 'Y' },
  upwork: { name: 'Upwork', color: '#14A800', glyph: 'U' },
  venmo: { name: 'Venmo', color: '#3D95CE', glyph: 'V' },
  chase: { name: 'Chase', color: '#117ACA', glyph: 'C' },
  wise: { name: 'Wise', color: '#9FE870', glyph: 'W', glyphInk: '#163300' },
  kofi: { name: 'Ko-fi', color: '#29ABE0', glyph: 'K' },
  sheets: { name: 'Sheets', color: '#0F9D58', glyph: 'S' },
} satisfies Record<string, Service>;

export type ServiceKey = keyof typeof SERVICES;

/** The 14 open tabs of scene 2, in arrival order. */
export const TABS: { service: ServiceKey; title: string }[] = [
  { service: 'stripe', title: 'Payouts – Stripe' },
  { service: 'paypal', title: 'Activity – PayPal' },
  { service: 'shopify', title: 'Orders · Shopify' },
  { service: 'gumroad', title: 'Sales | Gumroad' },
  { service: 'patreon', title: 'Earnings – Patreon' },
  { service: 'etsy', title: 'Shop Manager – Etsy' },
  { service: 'substack', title: 'Stats – Substack' },
  { service: 'youtube', title: 'Studio – Revenue' },
  { service: 'upwork', title: 'Reports – Upwork' },
  { service: 'chase', title: 'Statements – Chase' },
  { service: 'sheets', title: 'budget_FINAL_v3' },
  { service: 'wise', title: 'Balances – Wise' },
  { service: 'venmo', title: 'Venmo' },
  { service: 'kofi', title: 'Payouts – Ko-fi' },
];
