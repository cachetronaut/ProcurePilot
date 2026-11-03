export const catalog = Object.freeze([
  { sku: 'cup-loop', category: 'cups', supplier: 'Loop Supply', name: 'Compostable cups', pack: 100, cents: 1800, shipping: 600, days: 2, sustainable: true },
  { sku: 'cup-value', category: 'cups', supplier: 'Everyday Wholesale', name: 'Paper cups', pack: 100, cents: 1400, shipping: 800, days: 3, sustainable: false },
  { sku: 'cup-rush', category: 'cups', supplier: 'QuickStock', name: 'Compostable cups, express', pack: 100, cents: 2200, shipping: 1200, days: 1, sustainable: true },
  { sku: 'paper-loop', category: 'paper', supplier: 'Loop Supply', name: 'Recycled copy paper', pack: 500, cents: 950, shipping: 600, days: 2, sustainable: true },
  { sku: 'paper-value', category: 'paper', supplier: 'Everyday Wholesale', name: 'Copy paper', pack: 500, cents: 700, shipping: 800, days: 3, sustainable: false },
  { sku: 'paper-rush', category: 'paper', supplier: 'QuickStock', name: 'Recycled paper, express', pack: 500, cents: 1200, shipping: 1200, days: 1, sustainable: true }
]);
export class Fault extends Error {
  constructor(code, message, http = 400) { super(message); this.code = code; this.http = http; }
}
export const requireThat = (condition, code, message, http) => { if (!condition) throw new Fault(code, message, http); };
export const dollars = cents => (cents / 100).toFixed(2);
export function quotesFor(input) {
  requireThat(input && typeof input === 'object', 'INPUT', 'A purchase brief is required.');
  requireThat(['cups', 'paper'].includes(input.category), 'CATEGORY', 'Choose cups or paper.');
  for (const [key, low, high] of [['units', 1, 10000], ['budgetCents', 100, 100000], ['days', 1, 7]])
    requireThat(Number.isInteger(input[key]) && input[key] >= low && input[key] <= high, 'INPUT', `${key} is outside the allowed range.`);
  requireThat(typeof input.brief === 'string' && input.brief.length <= 600, 'INPUT', 'Keep the brief under 600 characters.');
  return catalog.filter(p => p.category === input.category).map(p => {
    const packs = Math.ceil(input.units / p.pack);
    const subtotalCents = p.cents * packs;
    // Fixed demonstration tax, not tax advice or a supplier quote.
    const taxCents = Math.round(subtotalCents * 0.08);
    const totalCents = subtotalCents + taxCents + p.shipping;
    return { ...p, packs, deliveredUnits: packs * p.pack, subtotalCents, taxCents, totalCents,
      eligible: totalCents <= input.budgetCents && p.days <= input.days };
  });
}
export function selectQuote(quotes, decision) {
  requireThat(decision && typeof decision.sku === 'string' && typeof decision.reason === 'string' && decision.reason.length > 0 && decision.reason.length <= 2000, 'AI_OUTPUT', 'The planner returned an invalid decision.', 502);
  const selected = quotes.find(q => q.sku === decision.sku && q.eligible);
  requireThat(selected, 'AI_POLICY', 'The planner selected an unavailable or out-of-policy quote. No payment was created.', 422);
  return selected;
}
export function verifiedCapture(data, plan) {
  const captures = data.purchase_units?.flatMap(u => u.payments?.captures || []) || [];
  requireThat(data.id === plan.orderId && data.status === 'COMPLETED' && captures.length === 1 && captures[0].status === 'COMPLETED' && captures[0].amount?.currency_code === 'USD' && captures[0].amount?.value === dollars(plan.selected.totalCents), 'CAPTURE_UNVERIFIED', 'Capture was not verified. Do not create a payout; reconcile in the sandbox dashboard.', 409);
  return { id: captures[0].id, status: 'COMPLETED', amount: captures[0].amount };
}
export function payoutState(batch, item) {
  if (batch === 'SUCCESS' && item === 'SUCCESS') return 'PAID';
  const terminal = ['DENIED', 'FAILED', 'RETURNED', 'REFUNDED', 'REVERSED', 'BLOCKED', 'CANCELED', 'CANCELLED'];
  if (terminal.includes(batch) || terminal.includes(item)) return 'PAYOUT_ATTENTION';
  const knownBatch = ['PENDING', 'PROCESSING', 'SUCCESS'];
  const knownItem = ['PENDING', 'UNCLAIMED', 'ONHOLD', 'SUCCESS'];
  if (knownBatch.includes(batch) && knownItem.includes(item)) return 'PAYOUT_PENDING';
  return 'PAYOUT_UNKNOWN';
}
