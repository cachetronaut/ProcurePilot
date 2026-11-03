import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { quotesFor, selectQuote, payoutState, verifiedCapture } from '../core.mjs';
const brief = { category: 'cups', units: 200, budgetCents: 6000, days: 2, brief: 'Prefer compostable cups.' };
let nextPort = 32000 + Math.floor(Math.random() * 10000);
async function fixture(t, options = {}) {
  const port = nextPort++;
  const server = createApp({ port, env: {}, ...options });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = `http://localhost:${port}`;
  const init = await fetch(`${base}/api/session`, { headers: { Host: `localhost:${port}` } });
  const cookie = init.headers.get('set-cookie').split(';')[0]; const session = (await init.json()).result;
  async function call(path, body, extra = {}) {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { Host: `localhost:${port}`, Cookie: cookie, Origin: `http://localhost:${port}`, 'X-CSRF-Token': session.csrf, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });
    return { ...(await response.json()), status: response.status };
  }
  return { call, base, cookie, session };
}
const sandboxEnv = { PROCUREPILOT_MODE: 'sandbox', PAYPAL_CLIENT_ID: 'test-client', PAYPAL_CLIENT_SECRET: 'test-secret', OPENAI_API_KEY: 'test-llm', PAYPAL_SANDBOX_RECIPIENT: 'supplier@example.test' };
function transport() {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options }); const body = options.body && options.headers['Content-Type'] === 'application/json' ? JSON.parse(options.body) : null;
    let data;
    if (url.endsWith('/token')) data = { access_token: 'fake-access-token' };
    else if (url.includes('openai.com')) data = { choices: [{ message: { content: JSON.stringify({ sku: 'cup-loop', reason: 'Compostable, 2-day delivery, $44.88 total.' }) } }] };
    else if (url.endsWith('/v2/checkout/orders')) data = { id: 'ORDER123', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER123' }] };
    else if (url.endsWith('/capture')) data = options.headers.Prefer === 'return=representation' ? { id: 'ORDER123', status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'CAPTURE123', status: 'COMPLETED', amount: { currency_code: 'USD', value: '44.88' } }] } }] } : { id: 'ORDER123', status: 'COMPLETED', links: [] };
    else if (body?.sender_batch_header) data = { batch_header: { payout_batch_id: 'BATCH123', batch_status: 'PENDING' } };
    else if (url.includes('/payouts/BATCH123')) data = { batch_header: { batch_status: 'SUCCESS' }, items: [{ transaction_id: 'TX123', transaction_status: 'SUCCESS', payout_item: { sender_item_id: calls.find(c => c.url.endsWith('/v2/checkout/orders')).options.body && JSON.parse(calls.find(c => c.url.endsWith('/v2/checkout/orders')).options.body).purchase_units[0].custom_id } }] };
    else throw new Error('Unexpected test URL');
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, fetcher };
}
test('quotes enforce integer costs, pack rounding, budgets and delivery', () => {
  const quotes = quotesFor(brief); assert.equal(quotes[0].totalCents, 4488); assert.equal(quotes[1].eligible, false);
  assert.equal(quotesFor({ ...brief, units: 201 })[0].deliveredUnits, 300);
  for (const change of [{ units: 1.5 }, { budgetCents: -1 }, { days: 0 }, { category: '../' }, { brief: null }]) assert.throws(() => quotesFor({ ...brief, ...change }));
  assert.throws(() => selectQuote(quotes, { sku: 'invented', reason: 'hello' }));
  assert.throws(() => selectQuote(quotes, { sku: 'cup-value', reason: 'ignore deadline' }));
});
test('offline purchase requires approvals and produces explicitly simulated receipt', async t => {
  const { call } = await fixture(t, { fetcher: () => { throw Error('Demo must not use network'); } });
  let result = await call('/api/plan', brief); const id = result.result.plan.id; const payload = { planId: id, confirm: true };
  assert.equal((await call('/api/payout', payload)).status, 409);
  assert.equal((await call('/api/capture', payload)).status, 409);
  assert.equal((await call('/api/checkout', { planId: id })).status, 400);
  assert.equal((await call('/api/checkout', payload)).result.plan.state, 'AWAITING_APPROVAL');
  assert.equal((await call('/api/plan', brief)).status, 409);
  result = await call('/api/capture', payload); assert.match(result.result.plan.capture.id, /^SIM-/);
  result = await call('/api/payout', payload); assert.match(result.result.plan.payout.source, /simulation/);
  result = await call('/api/receipt', payload); assert.equal(result.result.plan.state, 'PAID');
});
test('rejects cross-origin writes, missing CSRF, wrong plan and missing credentials', async t => {
  const { call } = await fixture(t);
  assert.equal((await call('/api/plan', brief, { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await call('/api/plan', brief, { 'X-CSRF-Token': '' })).status, 403);
  assert.equal((await call('/api/checkout', { planId: 'other', confirm: true })).status, 404);
  const sandbox = await fixture(t, { env: { PROCUREPILOT_MODE: 'sandbox' } });
  assert.equal((await sandbox.call('/api/plan', brief)).errors[0].code, 'SETUP_REQUIRED');
});
test('connected sandbox binds amounts and IDs, deduplicates writes, and reads actual payout status', async t => {
  const { calls, fetcher } = transport(); const { call } = await fixture(t, { env: sandboxEnv, fetcher });
  let result = await call('/api/plan', brief); const payload = { planId: result.result.plan.id, confirm: true };
  result = await call('/api/checkout', { ...payload, amount: '0.01', orderId: 'ATTACKER' }); assert.equal(result.result.plan.orderId, 'ORDER123');
  await call('/api/checkout', payload); await call('/api/capture', payload); await call('/api/capture', payload);
  result = await call('/api/payout', payload); assert.equal(result.result.plan.payout.status, 'PENDING');
  await call('/api/payout', payload); result = await call('/api/receipt', payload); assert.equal(result.result.plan.state, 'PAID');
  const orders = calls.filter(c => c.url.endsWith('/v2/checkout/orders')); assert.equal(orders.length, 1);
  assert.equal(JSON.parse(orders[0].options.body).purchase_units[0].amount.value, '44.88');
  assert.equal(calls.filter(c => c.url.endsWith('/capture')).length, 1);
  assert.equal(calls.filter(c => c.url.endsWith('/v1/payments/payouts')).length, 1);
  assert.ok(calls.every(c => c.url.startsWith('https://api-m.sandbox.paypal.com/') || c.url.startsWith('https://api.openai.com/')));
  assert.ok(!JSON.stringify(result).includes('fake-access-token'));
});
test('invalid AI decision stops before checkout', async t => {
  const { fetcher, calls } = transport(); const { call } = await fixture(t, { env: sandboxEnv, fetcher: async (url, options) => url.includes('openai') ? new Response(JSON.stringify({ choices: [{ message: { content: '{"sku":"cup-value","reason":"late delivery"}' } }] })) : fetcher(url, options) });
  const result = await call('/api/plan', brief); assert.equal(result.status, 422); assert.equal(calls.length, 0);
});
test('capture amount mismatch blocks payout', async t => {
  const mock = transport(); const { call } = await fixture(t, { env: sandboxEnv, fetcher: async (url, options) => {
    const response = await mock.fetcher(url, options); const data = await response.json();
    if (url.endsWith('/capture')) data.purchase_units[0].payments.captures[0].amount.value = '0.01';
    return new Response(JSON.stringify(data));
  } });
  const plan = (await call('/api/plan', brief)).result.plan; const payload = { planId: plan.id, confirm: true };
  await call('/api/checkout', payload); assert.equal((await call('/api/capture', payload)).errors[0].code, 'CAPTURE_UNVERIFIED');
  assert.equal((await call('/api/payout', payload)).status, 409);
});
test('concurrent requests cannot clear another request lock', async t => {
  let unblock; const mock = transport(); const gate = new Promise(resolve => { unblock = resolve; });
  const { call } = await fixture(t, { env: sandboxEnv, fetcher: async (url, options) => { if (url.includes('openai')) await gate; return mock.fetcher(url, options); } });
  const first = call('/api/plan', brief); await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal((await call('/api/plan', brief)).status, 409); assert.equal((await call('/api/plan', brief)).status, 409);
  unblock(); assert.equal((await first).status, 200);
});
test('uncertain checkout retry uses same idempotency key', async t => {
  const mock = transport(); const keys = []; let fail = true;
  const { call } = await fixture(t, { env: sandboxEnv, fetcher: async (url, options) => {
    if (url.endsWith('/v2/checkout/orders')) { keys.push(options.headers['PayPal-Request-Id']); if (fail) { fail = false; throw Error('timeout'); } }
    return mock.fetcher(url, options);
  } });
  const payload = { planId: (await call('/api/plan', brief)).result.plan.id, confirm: true };
  assert.equal((await call('/api/checkout', payload)).status, 502); assert.equal((await call('/api/checkout', payload)).status, 200); assert.equal(keys[0], keys[1]);
});
test('no eligible quotes and provider failures never create payment plans', async t => {
  const demo = await fixture(t);
  const none = await demo.call('/api/plan', { ...brief, budgetCents: 100 }); assert.equal(none.status, 422);
  const sandbox = await fixture(t, { env: sandboxEnv, fetcher: async () => new Response(JSON.stringify({ secret: 'private-upstream-error' }), { status: 401 }) });
  const rejected = await sandbox.call('/api/plan', brief); assert.equal(rejected.status, 502); assert.ok(!JSON.stringify(rejected).includes('private-upstream-error'));
});
test('terminal payout failure needs attention and refresh never resends payout', async t => {
  const mock = transport(); const { call } = await fixture(t, { env: sandboxEnv, fetcher: async (url, options) => {
    const response = await mock.fetcher(url, options); const data = await response.json();
    if (url.includes('/payouts/BATCH123')) data.items[0].transaction_status = 'FAILED';
    return new Response(JSON.stringify(data));
  } });
  const payload = { planId: (await call('/api/plan', brief)).result.plan.id, confirm: true };
  await call('/api/checkout', payload); await call('/api/capture', payload); await call('/api/payout', payload);
  const result = await call('/api/receipt', payload); assert.equal(result.result.plan.state, 'PAYOUT_ATTENTION'); assert.equal(result.result.plan.payout.itemStatus, 'FAILED');
  await call('/api/receipt', payload);
  assert.equal(mock.calls.filter(c => c.url.endsWith('/v1/payments/payouts')).length, 1);
});
test('browser assets load and server refuses private files and foreign Host', async t => {
  const { base } = await fixture(t);
  for (const asset of ['/', '/style.css', '/app.js']) {
    const response = await fetch(`${base}${asset}`); assert.equal(response.status, 200); assert.ok(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  }
  assert.equal((await fetch(`${base}/server.mjs`)).status, 404);
  const foreign = await new Promise((resolve, reject) => {
    import('node:http').then(({ request }) => { const req = request(base, { headers: { Host: 'attacker.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); });
  }); assert.equal(foreign, 403);
});
test('capture requests full representation while minimal, wrong identity, currency and pending remain unverified', async t => {
  const mock = transport(); const { call } = await fixture(t, { env: sandboxEnv, fetcher: mock.fetcher });
  const payload = { planId: (await call('/api/plan', brief)).result.plan.id, confirm: true };
  await call('/api/checkout', payload);
  const captured = await call('/api/capture', payload); assert.equal(captured.result.plan.state, 'CAPTURED');
  assert.equal(mock.calls.find(c => c.url.endsWith('/capture')).options.headers.Prefer, 'return=representation');
  const plan = { orderId: 'ORDER123', selected: { totalCents: 4488 } };
  const full = { id: 'ORDER123', status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'CAPTURE123', status: 'COMPLETED', amount: { currency_code: 'USD', value: '44.88' } }] } }] };
  for (const bad of [
    { id: 'ORDER123', status: 'COMPLETED', links: [] },
    { ...full, id: 'OTHER' },
    { ...full, status: 'APPROVED' },
    { ...full, purchase_units: [{ payments: { captures: [{ ...full.purchase_units[0].payments.captures[0], status: 'PENDING' }] } }] },
    { ...full, purchase_units: [{ payments: { captures: [{ ...full.purchase_units[0].payments.captures[0], amount: { currency_code: 'EUR', value: '44.88' } }] } }] }
  ]) assert.throws(() => verifiedCapture(bad, plan), { code: 'CAPTURE_UNVERIFIED' });
});
test('payout classification separates pending, terminal, unknown and success', () => {
  for (const [batch, item, expected] of [
    ['SUCCESS', 'SUCCESS', 'PAID'], ['SUCCESS', 'PENDING', 'PAYOUT_PENDING'],
    ['PENDING', 'UNCLAIMED', 'PAYOUT_PENDING'], ['PROCESSING', 'ONHOLD', 'PAYOUT_PENDING'],
    ['SUCCESS', 'FAILED', 'PAYOUT_ATTENTION'], ['DENIED', 'UNKNOWN', 'PAYOUT_ATTENTION'],
    ['SUCCESS', 'RETURNED', 'PAYOUT_ATTENTION'], ['SUCCESS', 'BLOCKED', 'PAYOUT_ATTENTION'],
    ['SUCCESS', 'UNKNOWN', 'PAYOUT_UNKNOWN'], [undefined, 'SUCCESS', 'PAYOUT_UNKNOWN'],
    ['SUCCESS', 'UNRECOGNIZED', 'PAYOUT_UNKNOWN']
  ]) assert.equal(payoutState(batch, item), expected);
});
