# PhotoSweep Paid Launch Checklist

Last updated: 2026-07-28

Use this as the release gate for paid multi-provider support. Do not mark a paid
launch complete until every item has current evidence.

## 1. Stripe Setup

- Create Stripe products and prices:

  ```bash
  STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup-products
  STRIPE_SECRET_KEY=sk_live_... npm run stripe:setup-products
  ```

- Store the printed live price ids as:
  - `PHOTOSWEEP_STRIPE_PRICE_MINI_CLEANUP`
  - `PHOTOSWEEP_STRIPE_PRICE_CLEANUP_PASS_7D`
  - `PHOTOSWEEP_STRIPE_PRICE_LIFETIME_EARLY_ACCESS`
- Create a Stripe webhook endpoint for:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
  - `charge.refunded`
  - `charge.dispute.created`
  - `payment_intent.payment_failed`
- Set `STRIPE_WEBHOOK_SECRET` from that endpoint.
- Run a test-mode checkout and verify the extension receives a signed paid
  entitlement after webhook delivery.
- Run a delayed-payment test and verify `checkout.session.completed` does not
  unlock until `checkout.session.async_payment_succeeded`.
- Run test-mode partial refund, full refund, and dispute events. Verify a partial
  refund preserves access and a full refund/dispute downgrades on startup refresh.

## 2. License API Deployment

- Generate a P-256 entitlement signing key pair with
  `docs/LICENSING_BACKEND.md`.
- Deploy `npm run license:serve` or a production adapter around
  `createLicenseApi()`.
- Set backend environment variables:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `PHOTOSWEEP_ALLOWED_ORIGINS`
  - `PHOTOSWEEP_ENTITLEMENT_PRIVATE_KEY`
  - `PHOTOSWEEP_STRIPE_PRICE_MINI_CLEANUP`
  - `PHOTOSWEEP_STRIPE_PRICE_CLEANUP_PASS_7D`
  - `PHOTOSWEEP_STRIPE_PRICE_LIFETIME_EARLY_ACCESS`
  - `PHOTOSWEEP_CHECKOUT_SUCCESS_URL`
  - `PHOTOSWEEP_CHECKOUT_CANCEL_URL`
  - `PHOTOSWEEP_RECOVERY_BASE_URL`
  - `PHOTOSWEEP_RECOVERY_REDIRECT_URL`
  - `PHOTOSWEEP_RECOVERY_EMAIL_WEBHOOK_URL`
  - `PHOTOSWEEP_RECOVERY_EMAIL_WEBHOOK_SECRET`
  - `PHOTOSWEEP_COOKIE_SECURE=1`
- Point `https://license.photosweep.app` at the deployment.
- Verify:
  - `POST /checkout` opens Stripe Checkout externally.
  - `GET /entitlement` returns a signed token.
  - `POST /license/recover` returns a generic acknowledgement and sends a
    signed recovery link through the configured email webhook.
  - `POST /analytics` accepts only sanitized bucketed events.
  - `POST /stripe/webhook` rejects unsigned requests.

## 3. Extension Production Build

- Set extension build variables:

  ```bash
  PLASMO_PUBLIC_PHOTOSWEEP_LICENSE_API_BASE_URL=https://license.photosweep.app
  PLASMO_PUBLIC_PHOTOSWEEP_ENTITLEMENT_PUBLIC_KEY=BASE64URL_SPKI_PUBLIC_KEY
  PLASMO_PUBLIC_PHOTOSWEEP_ALLOW_DEV_ENTITLEMENT=0
  ```

- Build:

  ```bash
  npm run typecheck
  npm test
  npm run build
  ```

- Confirm production bundle has dev entitlement disabled.
- Confirm client telemetry remains off until the in-product disclosure is accepted.
- Confirm extension pages do not load remote executable JavaScript.
- Confirm manifest host permissions include the deployed license API origin.

## 4. Policy And Store Pages

- Publish:
  - privacy policy from `docs/PRIVACY_POLICY.md`
  - refund policy from `docs/REFUND_POLICY.md`
  - support page from `docs/SUPPORT.md`
- Verify `pawsitivegames@gmail.com` receives mail.
- Chrome Web Store listing must state paid support covers Google Photos, iCloud
  Photos, and Amazon Photos under the same free and paid limits.
- Store listing must disclose:
  - local photo analysis
  - external Stripe Checkout
  - license/analytics data boundaries
  - no remote executable code in extension pages

## 5. Live Google Photos Validation

- Use a logged-in Chrome profile with a tiny validation album.
- Include only non-sensitive test photos.
- Run:

  ```bash
  GPD_E2E_USER_DATA_DIR=".chrome-live-validation" \
  GPD_E2E_ALBUM_TITLE="Tiny duplicate test" \
  npm run test:e2e
  ```

- Run controlled Trash validation only after report review:

  ```bash
  GPD_E2E_USER_DATA_DIR=".chrome-live-validation" \
  GPD_E2E_ALBUM_TITLE="Tiny duplicate test" \
  GPD_E2E_ALLOW_TRASH=1 \
  npm run test:e2e
  ```

- Verify:
  - duplicate groups appear as expected
  - pre-Trash report downloads and matches selected items
  - typed confirmation is required
  - items move to Google Photos Trash, not permanent deletion
  - Trash result report downloads
  - restore from Google Photos Trash works

## 6. Final Release Gate

- `npm run typecheck` passes.
- `npm test` passes.
- Required Playwright suite passes:

  ```bash
  PLASMO_PUBLIC_PHOTOSWEEP_ALLOW_DEV_ENTITLEMENT=1 npm run build
  npx playwright test --config playwright.config.ts \
    tests/e2e/integration/app-tab.test.ts \
    tests/e2e/integration/trash-undo.test.ts
  npm run build
  ```

- Test-mode card and delayed-payment checkout, cancel, failure, partial refund,
  full refund, dispute, restart refresh, and fresh-profile recovery pass.
- Live Google Photos scan, report, Trash, and restore pass.
- Policies and support pages are published.
- The final Chrome Web Store package is built with production env vars only.
