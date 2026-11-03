# Owner handoff

Owner label: Cachetronaut. License: MIT. Intended repository: cachetronaut/ProcurePilot.

## Required before the connected demonstration

- Create the ProcurePilot sandbox app in PayPal Developer and enable Payouts.
- Prepare sandbox merchant, buyer, supplier, and balances. Resolve any permissions or account confirmations yourself.
- Inject PayPal sandbox Client ID and Secret, sandbox recipient, and OpenAI API key as environment variables. Keep secrets out of files and chat. No app configuration containing credentials is committed.
- Complete the README connected flow and confirm both payout batch and item success. Capture the real sandbox IDs in a private receipt. Automated tests use doubles and do not prove credentialed connectivity.
- Confirm eligibility, rights to all submission materials, and current rules.

## Publication and submission

The implementation remains local until explicit publication approval. After approval, create or publish `cachetronaut/ProcurePilot` with the complete source, README, and root MIT LICENSE visible. Keep author and committer identities set to `Cachetronaut <cachetronaut@users.noreply.github.com>` for every commit. Never include legal names, personal email addresses, secrets or absolute local paths. Inspect the complete tree and commit metadata before pushing. Do not enable CI.

The owner uploads the demo to YouTube, makes it public, and submits the Devpost form himself. Record the real connected AI and sandbox flow. A simulation is useful for local evaluation but must not be presented as proof of actual AI or PayPal API use.

Target November 10–11, 2026. Official deadline November 12, 2026 at 12:00 PM Pacific, 2:00 PM Central. Use a video below three minutes. Check the repository is public, the license is detected, and a clean checkout runs with the documented commands. Open the public video while signed out before submitting.

## Suggested Devpost text

ProcurePilot is an AI purchasing agent for small businesses. It compares a constrained supplier catalog against quantity, budget and delivery requirements, explains the selected quote, and asks the operator to approve the exact total. PayPal sandbox Checkout demonstrates buyer approval and capture. A separately approved PayPal sandbox Payouts call demonstrates supplier disbursement, with batch and item status read back into a downloadable receipt.

The LLM selects and explains; deterministic code controls costs, policy and payment destinations. Human approval is required at spending boundaries. All supplier quotes are fixtures. No real money moves and no goods are shipped. The offline demo uses rules and simulated payments; the connected mode uses OpenAI and PayPal sandbox APIs.
