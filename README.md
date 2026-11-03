# ProcurePilot

A purchasing desk for small businesses, by **Cachetronaut**. Describe a purchase, let an AI compare eligible suppliers, approve the exact cost, and follow a PayPal sandbox Checkout and supplier payout to its receipt.

**Sandbox only. No real money. No goods are purchased or shipped.** AI-assisted recommendations require human approval. The offline demo uses rules and simulated receipts, with no AI or PayPal calls.

## Run in 30 seconds

Requires an already installed Node.js 22 or newer. No packages, SDKs, build steps, external fonts, or dependency installation.

```sh
node server.mjs
```

Open **http://localhost:3000**. Use `localhost`, not the numeric loopback address. The server binds to loopback only. The default offline demo works without accounts or keys. Keep the default brief, generate a plan, approve Checkout, simulate capture, approve the separate payout, then read and download the receipt.

```sh
node --test
node --check core.mjs
node --check server.mjs
node --check public/app.js
node --check test/workflow.test.mjs
```

Tests execute only project code and Node built-ins. HTTP integration tests start ephemeral loopback servers and use in-process provider doubles. They do not contact PayPal or an LLM. CI is intentionally omitted.

## Connected sandbox mode

The owner creates the accounts and credentials himself. Never paste keys into chat, files, source control, screenshots, or videos. Supply these through environment variables in the launching process using your normal secure environment injection. This app deliberately does not read `.env` files.

| Variable | Purpose |
| --- | --- |
| `PROCUREPILOT_MODE` | `sandbox` for real sandbox APIs; defaults to `demo` |
| `PAYPAL_CLIENT_ID` | ProcurePilot sandbox app Client ID |
| `PAYPAL_CLIENT_SECRET` | ProcurePilot sandbox app secret |
| `PAYPAL_SANDBOX_RECIPIENT` | Email of an owner-controlled **sandbox** supplier account, different from the app's merchant |
| `OPENAI_API_KEY` | LLM API credential, server only |
| `OPENAI_MODEL` | Optional Chat Completions model with JSON mode; defaults to `gpt-4.1-mini` |
| `PORT` | Optional local port, defaults to `3000` |

1. In [PayPal Developer](https://developer.paypal.com/dashboard/), create the **ProcurePilot** sandbox REST app and enable Payouts. Use only sandbox credentials.
2. Prepare a funded sandbox business account, a separate sandbox personal buyer, and a separate sandbox supplier recipient. Payouts access and sufficient sandbox balance are necessary. Only the owner handles account setup and sign-in confirmations.
3. Inject the required environment variables and run `node server.mjs`. The banner reports credential presence, not successful authentication.
4. Generate a plan. The server sends the brief and eligible fictional quotes to OpenAI. It validates the returned SKU and explanation, recalculates costs, and checks budget and delivery before permitting Checkout.
5. Check the approval box. Open Checkout, sign in using the **sandbox buyer**, approve, and return to ProcurePilot. Click **Confirm sandbox approval & capture**. PayPal verifies buyer approval; ProcurePilot checks completed status, amount, currency, and the server-bound order ID.
6. Separately approve the supplier Payouts demonstration. This pays the configured sandbox recipient, not the fictional supplier. It is an independent API operation from the merchant sandbox balance, not automatic settlement or escrow of Checkout funds. Payout fees may be additional. Read status until batch and item both report `SUCCESS`. `PENDING` and `UNCLAIMED` are not success. Terminal failures show `PAYOUT_ATTENTION`; missing or unrecognized statuses show `PAYOUT_UNKNOWN`. Status refresh only reads the existing payout.
7. Download the receipt. Avoid exposing recipient details or sandbox account data in public artifacts.

PayPal API URLs are hardcoded to `api-m.sandbox.paypal.com`. There is no live mode or configurable API base. A sandbox app credential must still be verified by the owner before recording the final demonstration. PayPal approval uses a redirect, so no third-party browser SDK executes.

## What the agent does

The structured brief specifies category, units, budget, delivery deadline, and a free-text preference. Deterministic code creates pack-rounded quotes and applies a fixture 8% tax plus shipping. The LLM chooses among eligible quotes and explains its tradeoffs. It cannot set amounts, destinations, execute code, or authorize payment. The immutable server-held plan determines every payment amount.

The sample catalog has three fictional suppliers for café cups and three for office paper. Sustainability claims, prices, shipping, tax and delivery estimates are demonstration data. This is a functional API prototype, not a supplier marketplace or production procurement product.

## Boundaries and recovery

This is a single-user **local** hackathon prototype. Do not expose it as a public server. Loopback binding, Host checks, SameSite/HttpOnly cookies, per-session CSRF tokens, strict content policy, and serialized mutations protect the local flow. AI/provider output is rendered as text.

Plans and idempotency keys live in memory, scoped to a browser cookie for up to two hours. A restart or session expiry loses them. After any uncertain provider write, retry the **same step in the same session**. Stable Checkout/capture request IDs and payout sender batch IDs prevent ordinary duplicate retries. Once Checkout starts, replanning in that session is blocked. Do not open another session, clear cookies, or restart to work around an error. Reconcile in the PayPal sandbox dashboard first. Expired or restarted sessions must be reconciled manually. There is no durable ledger, webhook receiver, automatic retry loop, or production recovery guarantee.

Provider error bodies, keys and access tokens are never returned to the browser or logged by the application. No request payload logging. Receipts contain sandbox transaction IDs and costs; downloads remain on your machine unless you share them.

## Submission materials

- [Owner setup and release checklist](docs/OWNER.md)
- [Demo script, target 2 minutes 40 seconds](docs/DEMO.md)
- [Flow and API contracts](docs/CONTRACTS.md)
- [Local verification and review](docs/VERIFICATION.md)
- [MIT license](LICENSE)

Intended repository: `cachetronaut/ProcurePilot`. Publication requires the owner's explicit yes. No repository publication, Devpost submission, or YouTube upload is automated here.

The [official rules](https://paypalaihackathon.devpost.com/rules) list November 12, 2026 at noon Pacific as the deadline. Target owner submission on November 10–11. They require working software, all source and run instructions in a public open-source repository, and a public YouTube demonstration under three minutes. The entry targets Best Use of Agentic Commerce and the grand prizes. Verify current eligibility and prize terms directly before submission.

API references: [PayPal Checkout](https://developer.paypal.com/docs/checkout/standard/integrate/), [Payouts](https://developer.paypal.com/docs/payouts/standard/integrate-api/), [OpenAI JSON mode](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat).
