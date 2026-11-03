# Flow and contracts

The prototype uses integer USD cents internally. Server-held catalog and plans own prices and identities. The model only returns `{sku, reason}`. Missing or invalid provider data is an error, never approval.

Every API response uses a versioned envelope with `contractVersion`, `componentId`, `requestId`, `runId`, `status`, `result`, `errors` and `trace`. Errors include a code, safe message and retryability hint. No secrets or upstream bodies enter envelopes.

| Step | Input | Process / output | Write boundary |
| --- | --- | --- | --- |
| Preflight | Host, cookie, Origin, CSRF, JSON body | Local session and request validation | Reject before side effects |
| Plan | category, integer units, budgetCents, days, brief | Fixture quotes, policy eligibility, model SKU and reason validation; immutable plan | No payment |
| Checkout | planId, confirm=true | Server amount → sandbox order ID and sandbox approval redirect | Human approves exact plan |
| Capture | planId | Bound order → completed capture with exact amount and USD | PayPal buyer approval is required |
| Payout | planId, confirm=true | Verified capture → separate sandbox payout batch | Human approves independent payout |
| Receipt | planId | PayPal batch and matching item → explicit statuses | Read only |

Endpoints: `GET /api/session`; `POST /api/plan`, `/api/checkout`, `/api/capture`, `/api/payout`, `/api/receipt`. POST requires the CSRF token from the current session in `X-CSRF-Token`, the exact local Origin, and JSON content type. Plan creation accepts only cups or paper, 1–10,000 units, a $1–$1,000 budget, 1–7 days, and a brief up to 600 characters. Additional client price/order/recipient fields have no authority.

States: `PLANNED → AWAITING_APPROVAL → CAPTURED → PAYOUT_CREATED → PAYOUT_PENDING | PAID`. `PAID` requires both batch and item `SUCCESS`. Known in-progress statuses remain `PAYOUT_PENDING`; terminal failures, denials, blocks and reversals become `PAYOUT_ATTENTION`. Missing or unrecognized status becomes `PAYOUT_UNKNOWN`. Refreshing status only reads PayPal and never creates another payout. Checkout requests `Prefer: return=representation`, so capture verification receives the nested payment details it requires. Failure retains the last verified state; it does not imply a provider write failed to occur. A stable idempotency key is reused when retrying each write. The local in-memory session is not a durable financial ledger. Reconcile uncertain writes manually before restarting or starting another session.
