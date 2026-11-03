const $ = id => document.getElementById(id);
let session, plan, working = false;
const usd = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
function text(id, value) { $(id).textContent = value; }
async function api(path, body) {
  const response = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf }, body: JSON.stringify(body) } : {});
  const data = await response.json();
  if (!response.ok) throw new Error(data.errors?.[0]?.message || 'Request failed.');
  return data.result;
}
async function run(label, fn) {
  if (working) return;
  working = true; $('error').hidden = true; text('activity', label);
  document.querySelector('main').setAttribute('aria-busy', 'true');
  try { await fn(); text('activity', 'Purchasing desk is up to date.'); }
  catch (error) { text('error', error.message); $('error').hidden = false; text('activity', 'Action stopped. Review the message before retrying.'); }
  finally { working = false; document.querySelector('main').setAttribute('aria-busy', 'false'); render(); }
}
function render() {
  if (!session) return;
  $('empty').hidden = !!plan; $('result').hidden = !plan;
  $('plan-button').disabled = !!plan?.orderAttempted;
  if (!plan) return;
  text('plan-status', plan.state.replaceAll('_', ' ').toLowerCase());
  text('planner-label', `${plan.planner} · human approval required`);
  text('selection-name', `${plan.selected.name} / ${plan.selected.supplier}`); text('reason', plan.reason);
  text('total', usd(plan.selected.totalCents)); text('remaining', usd(plan.input.budgetCents - plan.selected.totalCents)); text('delivery', `${plan.selected.days} day${plan.selected.days === 1 ? '' : 's'}`);
  $('quotes').replaceChildren(...plan.quotes.map(q => {
    const row = document.createElement('tr'); if (q.sku === plan.selected.sku) row.className = 'selected';
    const supplier = document.createElement('td'); supplier.textContent = q.supplier;
    const quantity = document.createElement('small'); quantity.textContent = `${q.packs} × ${q.pack} units${q.sku === plan.selected.sku ? ' · selected' : ''}`; supplier.append(quantity); row.append(supplier);
    for (const value of [usd(q.totalCents), q.days, q.eligible ? 'Within policy' : q.days > plan.input.days ? 'Too slow' : 'Over budget']) { const td = document.createElement('td'); td.textContent = value; row.append(td); } return row;
  }));
  const q = plan.selected;
  text('breakdown', `${q.packs} packs × ${usd(q.cents)} = ${usd(q.subtotalCents)}; illustrative tax at 8% = ${usd(q.taxCents)}; shipping = ${usd(q.shipping)}. Total ${usd(q.totalCents)} USD. Supplies ${q.deliveredUnits} units for ${plan.input.units} requested. All supplier prices and delivery promises are fixtures.`);
  text('approval-copy', `Approve ${usd(q.totalCents)} USD for ${q.deliveredUnits} units from ${q.supplier}. ${session.mode === 'demo' ? 'This will simulate Checkout without contacting PayPal.' : 'PayPal will open for sandbox buyer approval. Return here afterward to capture.'}`);
  $('checkout-button').disabled = !$('approve-check').checked || !!plan.capture;
  $('capture-button').hidden = !plan.orderId || !!plan.capture;
  $('capture-info').hidden = !plan.capture;
  text('capture-info', plan.capture ? `Checkout capture ${plan.capture.status} · ${plan.capture.id}` : '');
  $('payout-controls').hidden = !plan.capture || !!plan.payout;
  $('payout-button').disabled = !$('payout-check').checked;
  $('receipt').hidden = !plan.payout;
  if (plan.payout) {
    const receipt = plan.payout;
    text('receipt-status', `${receipt.status} / item ${receipt.itemStatus}`); text('receipt-total', `${usd(Number(receipt.amount) * 100)} USD`);
    const fields = { Source: receipt.source, 'Batch ID': receipt.batchId, 'Transaction ID': receipt.transactionId || 'Not yet available', 'Checked at': receipt.checkedAt };
    $('receipt-fields').replaceChildren(...Object.entries(fields).flatMap(([key, value]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = key; dd.textContent = value; return [dt, dd]; }));
    text('receipt-note', session.mode === 'demo' ? 'SIMULATION ONLY. This is not evidence of a PayPal API call or an AI recommendation.' : plan.state === 'PAID' ? 'PayPal sandbox reports batch and item success. No real money moved.' : plan.state === 'PAYOUT_ATTENTION' ? 'Payout needs attention. PayPal reports a failed, denied, returned, or other terminal outcome. Reconcile in the sandbox dashboard; refreshing will not send another payout.' : plan.state === 'PAYOUT_UNKNOWN' ? 'Payout outcome is unknown because provider status is missing or unrecognized. Read status again or reconcile in the sandbox dashboard.' : 'A created batch is not a successful payout. Read status again. Pending or unclaimed items may need sandbox dashboard reconciliation.');
  }
}
$('brief-form').addEventListener('submit', event => { event.preventDefault(); run('Comparing quotes and checking your purchasing policy…', async () => {
  const input = { category: $('category').value, units: Number($('units').value), budgetCents: Math.round(Number($('budget').value) * 100), days: Number($('days').value), brief: $('brief').value };
  const result = await api('/api/plan', input); plan = result.plan; $('approve-check').checked = false; $('payout-check').checked = false;
}); });
$('approve-check').addEventListener('change', render); $('payout-check').addEventListener('change', render);
$('checkout-button').addEventListener('click', () => run('Creating your approved sandbox Checkout…', async () => {
  const result = await api('/api/checkout', { planId: plan.id, confirm: $('approve-check').checked }); plan = result.plan;
  if (result.approvalUrl) {
    const target = new URL(result.approvalUrl);
    if (target.origin !== 'https://www.sandbox.paypal.com') throw new Error('Refused a non-sandbox Checkout URL.');
    location.assign(target.href);
  }
}));
for (const [id, endpoint, label] of [['capture-button', 'capture', 'Verifying and capturing sandbox Checkout…'], ['payout-button', 'payout', 'Creating a separate sandbox supplier payout…'], ['refresh-button', 'receipt', 'Reading payout status from the provider…']]) {
  $(id).addEventListener('click', () => run(label, async () => { plan = (await api(`/api/${endpoint}`, { planId: plan.id, confirm: endpoint === 'payout' ? $('payout-check').checked : true })).plan; }));
}
$('download-button').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ project: 'ProcurePilot', owner: 'Cachetronaut', mode: session.mode, disclosure: session.disclosure, planId: plan.id, supplier: plan.selected.supplier, capture: plan.capture, payout: plan.payout }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `procurepilot-${plan.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
run('Opening your purchasing desk…', async () => {
  session = await api('/api/session'); plan = session.plan;
  text('mode-banner', session.mode === 'demo' ? 'OFFLINE DEMO / No credentials needed. Rule-based planning and simulated payments. Switch to sandbox mode for real AI and PayPal sandbox APIs.' : `CONNECTED SANDBOX / ${session.ready ? 'Credentials configured, not yet verified. AI and PayPal calls run only when you act.' : 'Owner setup required. Set the required environment variables, then restart.'}`);
  text('disclosure', session.disclosure);
  if (new URLSearchParams(location.search).has('cancelled')) { text('error', 'Sandbox Checkout was cancelled. You can reopen the same Checkout or revise your purchase in a new session after reconciliation.'); $('error').hidden = false; }
  if (location.search) history.replaceState(null, '', '/');
});
