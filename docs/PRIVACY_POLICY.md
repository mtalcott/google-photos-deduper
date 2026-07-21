# PhotoSweep Privacy Policy

Last updated: 2026-07-21

## Summary

PhotoSweep finds duplicate and near-duplicate photos in supported online photo
libraries. Duplicate analysis runs locally in the browser extension. PhotoSweep
does not upload photo content for duplicate analysis.

## Data Processed Locally

PhotoSweep may read and process these items inside the browser to provide scan,
review, report, Trash, undo, and diagnostics features:

- photo and video thumbnails loaded by the supported provider page
- provider item identifiers needed to show results and move selected items to Trash
- basic media metadata shown by the provider page, such as dimensions, dates, and
  provider URLs
- duplicate groups, review decisions, keep/skip choices, scan checkpoints, and
  locally generated reports
- local embedding/cache data used to avoid repeating expensive duplicate analysis
- a provider account email or identifier exposed by a signed-in provider page,
  when needed to associate saved scan state with the provider account

This local data is stored with Chrome extension storage on the user's device.
Users can clear saved results and cache data from the extension UI.

## Data Sent To PhotoSweep Services

PhotoSweep's license service receives only payment and license information
needed to start checkout, recover a license, refresh entitlement state, prevent
abuse, and support paid users.

Allowed license/support data includes:

- selected plan id
- license session id
- Stripe customer, checkout session, and payment identifiers
- buyer email when supplied through Stripe Checkout or a license recovery flow
- signed entitlement token state
- extension version, provider, plan, scan mode, count buckets, error category,
  and redacted diagnostic logs if the user chooses to export diagnostics
- limited product telemetry such as app opened, scan, checkout, export, Trash,
  entitlement, and categorized error events, with provider, scan mode, plan, and
  count buckets where applicable

Telemetry is sent to help measure reliability and feature use. It does not
include photo content, filenames, album names, raw reports, or provider URLs.

PhotoSweep's license service must not receive photo URLs, thumbnails, filenames,
album names, raw reports, exact timestamps, people/location labels, or page
content.

## Third Parties

PhotoSweep uses Stripe for external checkout and payment processing. Stripe may
process payment details, receipts, fraud checks, and related transaction records
under Stripe's own terms and privacy policy.

PhotoSweep does not sell user data and does not use photo-derived data for ads.

## Chrome Web Store Limited Use Statement

PhotoSweep uses Chrome extension permissions and provider page access only to
provide or improve its single purpose: finding, reviewing, reporting, and safely
cleaning duplicate photos in supported photo libraries. PhotoSweep does not use
this data for advertising, unrelated profiling, or unrelated data brokerage.

PhotoSweep transfers user data only when needed to provide licensing/support,
comply with law, protect against abuse/security issues, or with explicit user
consent.

## Data Retention

Local scan data remains on the user's device until the user clears it, removes
the extension, or Chrome clears extension storage.

License records are retained while needed to provide paid access, receipts,
refund handling, support, fraud prevention, accounting, tax, and legal
compliance.

## Refunds And Deletion Requests

Users can request support, refunds, or deletion of license records by contacting:

`pawsitivegames@gmail.com`

Some payment, tax, accounting, fraud-prevention, and legal records may need to be
retained even after a deletion request.

## Security

PhotoSweep signs license entitlements server-side and verifies them in the
extension with a bundled public key. The private signing key remains on the
license server.

PhotoSweep extension pages do not load remote executable JavaScript. Checkout
opens externally through Stripe.
