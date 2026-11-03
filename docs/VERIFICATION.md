# Local verification

No CI workflow is included. No dependency installation or third-party application source execution is required. Runtime uses Node built-ins and first-party project source only.

The test suite covers quote arithmetic and rounding, budget and deadline rejection, invalid AI decisions, human approval gates, CSRF and Origin rejection, session-bound plans, missing credentials, exact Checkout amounts, capture mismatch rejection, payout status readback, duplicate-write suppression, concurrency, and stable idempotency keys after an uncertain write. Provider tests use in-process HTTP response doubles, not real provider calls.

Initial implementation validation and independent review results are recorded here after execution. Connected PayPal/OpenAI verification and the final demo require owner credentials and account setup.

## Review round 1 and fixes

Sol High implemented the prototype. A separate Sol xhigh reviewer inspected the workflow and reproduced two findings: capture requests needed the full PayPal representation, and terminal payout failures were labeled pending.

The implementation now sends `Prefer: return=representation` for Checkout requests. The provider double returns minimal capture data unless that header is present. Regression cases reject minimal responses, wrong order IDs, incorrect currency, pending captures, and incorrect amounts.

Payout classification now distinguishes pending, terminal attention, unknown, and paid. Tests cover failure, denial, returned/blocked items, missing and unrecognized statuses, and verify that repeated receipt refresh does not create another payout.

After fixes: all 13 local Node tests passed. Syntax checks passed for core, server, browser script, and tests. Source scan found no absolute local paths, personal email patterns, private-key headers, or API-key patterns. No CI or dependency installation was used. Review round 2 accepted both fixes with no remaining blocking findings at commit b202622129b7c41a5b120847a53ee86303bc2ec3. The independent Sol xhigh reviewer reran all 13 tests and four syntax checks successfully. The documented server entry point also passed a local startup, page-response, and offline-session smoke check.

Not yet verified: actual PayPal approval redirect and session restoration, sandbox buyer capture, funded Payouts success, OpenAI connectivity, and interactive browser rendering. These are not established by provider doubles or static-file tests. The final video remains owner work.
