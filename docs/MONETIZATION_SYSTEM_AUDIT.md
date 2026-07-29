# PhotoSweep Monetization System Audit

Audit date: 2026-07-28

Decision: **NOT READY**

PhotoSweep has a coherent privacy-first freemium offer and a substantial
code-level Stripe/licensing implementation. It is not ready to accept public
payments because no current test/live Stripe catalog, deployed license service,
signed production extension, sandbox transaction matrix, published policy URLs,
tax configuration, or Chrome Web Store dashboard parity was available in this
workspace.

Evidence labels used below:

- **Observed**: inspected in the current checkout.
- **Tested**: exercised by an automated command in this audit.
- **Documented**: stated in a repository artifact but not independently proven.
- **Inferred**: conclusion from observed evidence.
- **Unknown**: requires external or runtime evidence not present here.

## Current funnel and system map

`provider scan -> free value -> contextual limit -> UpgradeDialog -> license API
POST /checkout -> hosted Stripe Checkout -> signed webhook -> license store ->
GET /entitlement -> P-256 token verification -> centralized feature gates`

| Area              | Current truth                                                                                       | Evidence                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Customer          | People with crowded cloud photo libraries who want safe, private cleanup before buying more storage | Documented: `docs/MARKETING.md`                                      |
| Value moment      | A local scan reveals duplicate groups and recoverable cleanup before payment                        | Observed: `tabs/app.tsx`, `lib/entitlement.ts`                       |
| Offer             | Free proof, Mini Cleanup, seven-day Cleanup Pass, Lifetime Early Access                             | Observed                                                             |
| Checkout          | External Stripe Checkout through `POST /checkout`                                                   | Observed and tested                                                  |
| Source of truth   | Server license record, delivered as a signed entitlement token                                      | Observed and tested                                                  |
| Feature gates     | Central limits consumed by scan, review, report, resume, and Trash flows                            | Observed and tested                                                  |
| Restore           | Generic email request, signed recovery link, then entitlement refresh                               | Observed and tested at HTTP level                                    |
| Refund/revocation | Full refunds and disputes deactivate the matched license; partial refunds preserve access           | Observed and tested                                                  |
| Measurement       | Optional privacy-safe client events plus server payment lifecycle events                            | Observed and tested                                                  |
| Release           | Production configuration and sandbox/store evidence absent                                          | Unknown; safe environment-name check found required variables absent |

## Commercial contract

### Paid outcome

Finish a large duplicate-photo cleanup safely at the scale appropriate to the
chosen plan. Payment buys cleanup scale, reports, full scan, and resume; it does
not buy privacy or safety controls.

### Offer assessment

| Value lever          | Score | Finding                                                                                          |
| -------------------- | ----: | ------------------------------------------------------------------------------------------------ |
| Dream outcome        |  8/10 | Avoid storage pressure and regain a trustworthy library                                          |
| Perceived likelihood |  6/10 | Local analysis and review-first cleanup are strong; live provider and customer proof remain thin |
| Time delay           |  8/10 | Install, scan, and see candidates without an account migration                                   |
| Effort and sacrifice |  6/10 | Users still must scope, review, and confirm a sensitive cleanup                                  |

The binding constraint is proof and trust, not a lower price. Do not add fake
scarcity, ads, or a subscription before provider reliability and paid lifecycle
evidence exist. The honest risk reversal is the documented seven-day refund
policy.

### Packaging and stable identifiers

Prices are one-time USD prices; taxes may apply. Keep these plan identifiers and
Stripe environment aliases stable.

| Plan ID        | Display offer         |  Price | Contract                                                                                        |
| -------------- | --------------------- | -----: | ----------------------------------------------------------------------------------------------- |
| `free`         | Free                  |     $0 | 1,000 photos, 25 groups, 10 Trash moves/session, limited report                                 |
| `mini_cleanup` | Mini Cleanup          |  $2.99 | Permanent limited unlock: 2,500 photos, 75 groups, 100 Trash moves/session, full report         |
| `cleanup_pass` | Cleanup Pass          |  $4.99 | Seven days: 10,000 photos, unlimited groups/Trash, full report, full scan, large-library resume |
| `lifetime`     | Lifetime Early Access | $14.99 | One-time unlimited cleanup limits for the supported lifetime of the product                     |

Stripe price aliases:

- `PHOTOSWEEP_STRIPE_PRICE_MINI_CLEANUP`
- `PHOTOSWEEP_STRIPE_PRICE_CLEANUP_PASS_7D`
- `PHOTOSWEEP_STRIPE_PRICE_LIFETIME_EARLY_ACCESS`

“Mini Cleanup” previously said “one session” while its license never expired.
This audit selected the least destructive correction: preserve the plan and
price, and state its actual permanent limited behavior. A consumable
single-session product would require a new explicit consumption contract and
backend ledger; it must not be implied by copy.

### Upgrade and lifecycle behavior

- Upgrade only after value or a genuine scale/feature boundary.
- Lifetime is the primary visual choice; Cleanup Pass is the episodic
  alternative; Mini is the lower-scale option.
- Dismissal always returns to free review.
- Checkout cancellation, failure, or pending payment does not unlock.
- Delayed payments unlock only after Stripe reports paid success.
- An eligible recovery email receives a short-lived link; all recovery requests
  receive the same acknowledgement.
- Cleanup Pass ends at its signed seven-day boundary.
- Mini and Lifetime tokens are bounded to 30 days and refreshed at startup. A
  valid cached token survives a temporary license-service outage; a refund or
  revocation reconciles on the next successful refresh.
- A partial refund preserves access. A full refund or dispute revokes it.
- Safety confirmation, post-Trash reports, restore guidance, and privacy/cache
  controls remain available regardless of plan.

## Model comparison

| Model                                   | Comprehension | Revenue                          | Complexity                    | Recommendation                                                   |
| --------------------------------------- | ------------- | -------------------------------- | ----------------------------- | ---------------------------------------------------------------- |
| Current freemium + one-time scale tiers | High          | Moderate                         | Moderate                      | **Use now**                                                      |
| Free + Cleanup Pass + Lifetime only     | Highest       | Moderate                         | Lower                         | Test later after funnel data; do not remove Mini before evidence |
| Annual subscription                     | Medium        | Higher if recurring value exists | High lifecycle/support burden | Defer until repeat usage proves recurring value                  |

## Risks and gaps

| Priority | Class                              | Gap                                                                                                                                 | Evidence / cheapest resolution                                                             |
| -------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| P0       | Revenue loss / unauthorized access | No deployed catalog, webhook, database, or signed production environment is proven                                                  | Unknown; deploy test mode and run the sandbox matrix                                       |
| P0       | Trust/compliance                   | Tax responsibility, Stripe Tax/product tax code, terms URLs, refund URL, and Chrome dashboard disclosures are unverified            | Unknown; verify Stripe and Chrome dashboards with safe metadata                            |
| P0       | User lockout                       | Recovery is only proven by mocked HTTP tests, not real email/cookie behavior in a fresh Chrome profile                              | Run one test-mode purchase and fresh-profile recovery                                      |
| P0       | Unauthorized access                | Multiple paid purchases on one browser session can overwrite one license record; upgrade/refund fallback is not modeled as a ledger | Add a purchase ledger before allowing paid-plan upgrades from an already-paid session      |
| P1       | Trust/compliance                   | Paid multi-provider claims exceed current live Trash/restore evidence in this audit                                                 | Run tiny non-sensitive Google, iCloud, and Amazon cases or narrow claims                   |
| P1       | Measurement blind spot             | No baseline impressions, conversion, recovery, refund, or support metrics exist                                                     | Launch only after opt-in client and server payment events are observable                   |
| P1       | Revenue loss                       | Checkout price display is compiled into the extension instead of fetched from Stripe                                                | Treat price IDs as immutable release inputs and audit UI/catalog parity before every build |
| P2       | Conversion                         | Three paid choices can add decision friction                                                                                        | Measure plan selection before removing a plan                                              |

## Technical design and implemented slices

- Provider adapter: `LicenseClient` and `server/license-api.mjs`.
- Entitlement model and feature gates: `lib/entitlement.ts`.
- Persistence: signed token in Chrome storage; server store interface with
  Firestore implementation.
- Verification: P-256 signature verification; unsigned/forged tokens fail free.
- Checkout: external hosted Stripe page; no remote executable code in extension pages.
- Webhooks: signature validation, event-id deduplication, paid-status guard,
  delayed-payment success, full-refund/dispute deactivation.
- Reconciliation: 30-day maximum token window plus startup refresh.
- Analytics: allowlisted, bucketed client events behind explicit consent;
  server-generated purchase/refund/failure events omit photo context.
- Paywall: contextual explanation, recommended plan, USD/tax/refund terms, clear
  free escape, and recovery controls.

## Verification matrix

| Scenario                             | Status             | Evidence                                                                                         |
| ------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------ |
| Catalog fetch / localized price      | BLOCKED            | No live Stripe test catalog; UI uses release-pinned USD copy                                     |
| Catalog unavailable                  | PASS at code level | Checkout remains free and reports configuration error                                            |
| New paid purchase / immediate unlock | BLOCKED            | Mocked webhook/token tests only                                                                  |
| User cancels                         | PASS at code level | Cancel page promises no unlock; no grant before webhook                                          |
| Payment fails                        | PASS at code level | No paid webhook means no grant                                                                   |
| Delayed/pending payment              | PASS at code level | Unpaid completion stays locked; async paid event unlocks                                         |
| Duplicate callback                   | PASS at code level | Event IDs deduplicate; same Checkout session is not re-granted                                   |
| Restart reconciliation               | PASS at code level | Existing signed token triggers background refresh                                                |
| Reinstall / restore                  | BLOCKED            | HTTP recovery tested; real email and fresh-profile cookie flow not run                           |
| Subscription lifecycle               | NOT APPLICABLE     | No subscription product                                                                          |
| Cleanup Pass expiration              | PASS at code level | Signed seven-day boundary fails closed                                                           |
| Partial refund                       | PASS at code level | Does not revoke full purchase                                                                    |
| Full refund / dispute                | PASS at code level | Matched license deactivates and refresh returns free                                             |
| Offline launch / license outage      | PASS at code level | Valid signed cache remains until its boundary                                                    |
| Webhook replay / order               | PARTIAL            | Event and Checkout duplicate defenses exist; same-session purchase-ledger gap remains            |
| Analytics distinction                | PASS at code level | Impression, checkout, purchase, failure, refund, recovery, and entitlement outcomes are distinct |
| Privacy/security                     | PASS at code level | Allowlist strips photo fields; client telemetry requires consent                                 |
| Production/store readiness           | BLOCKED            | Dashboard, deployment, legal/tax, store, and sandbox evidence absent                             |

### Commands run

- Initial monetization baseline: 7 test files, 56 tests passed.
- TDD red proof: delayed-payment, partial-refund, and paywall-contract tests
  failed before their implementations.
- Monetization-focused verification: 8 test files, 66 tests passed.
- `git diff --check`: passed.
- `npm run typecheck`: blocked by the pre-existing dirty review/trash migration,
  including missing `reviewedGroupIds` props and moved trash helper symbols.
- Full `npm test`: 34 files and 441 tests passed; 4 files and 46 tests failed in
  the same in-progress review/trash migration. The focused monetization files
  remained green.

No build, Playwright purchase flow, real Stripe transaction, recovery email,
provider Trash/restore, or Chrome Web Store dashboard validation was completed.

## External completion checklist

1. Create or verify immutable Stripe test products/prices with the exact aliases
   and USD amounts above.
2. Decide the seller’s tax obligations; configure Stripe Tax, product tax codes,
   registrations, and tax behavior with qualified advice where needed.
3. Deploy the Firestore-backed license service with allowed extension origins,
   HTTPS, secrets, recovery mail delivery, logging, alerts, backups, and rollback.
4. Register all required Stripe webhook events, including asynchronous payment
   success/failure, and verify signature delivery.
5. Publish privacy, refund, support, and terms pages and place exact URLs in the
   paywall/checkout/store listing.
6. Run test-mode card and delayed-payment purchase, cancel, fail, partial refund,
   full refund, dispute, restart, outage, and fresh-profile recovery cases.
7. Build with the production API origin/public key and development entitlement
   disabled; audit the final package.
8. Verify Chrome Web Store permissions, privacy disclosures, paid-functionality
   wording, screenshots, and support contact against the shipped package.
9. Resolve the same-session multi-purchase ledger gap before offering upgrades
   to an already-paid user.

Rollback: disable or remove the production license API build variables and ship
with free limits only. Do not issue unsigned/manual paid entitlements.

## Success metrics and first experiment

Baseline these before changing prices:

- paywall impression -> checkout start;
- checkout start -> paid webhook;
- paid webhook -> successful entitlement refresh;
- recovery requested -> restored;
- refund/dispute rate;
- support contacts per paid user;
- plan mix and 30-day return behavior.

First experiment: keep packaging and prices fixed. Improve proof at the locked
group moment with the user’s actual duplicate-group count and recoverable-size
estimate, then measure checkout start. Change only that proof treatment.

Official references checked for this audit:

- Stripe Checkout fulfillment:
  https://docs.stripe.com/checkout/fulfillment
- Stripe webhook duplicate-event guidance:
  https://docs.stripe.com/webhooks
- Stripe event semantics:
  https://docs.stripe.com/api/events/types
- Stripe Tax for Checkout:
  https://docs.stripe.com/payments/checkout/taxes
- Chrome Web Store payment and user-data policies:
  https://developer.chrome.com/docs/webstore/program-policies/policies
- Manifest V3 remote-hosted-code requirements:
  https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
