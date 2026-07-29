# PhotoSweep Refund Policy

Last updated: 2026-06-30

## Summary

PhotoSweep sells one-time cleanup licenses through Stripe Checkout. Refunds are
handled through the payment record and, when approved, the matching paid
entitlement is deactivated by the license service.

## Refund Window

Users may request a refund within 7 days of purchase.

Refunds should be approved when:

- PhotoSweep cannot scan Google Photos on the user's supported browser/device
- checkout completed but paid access was not delivered and license recovery did
  not resolve it
- Cleanup Pass access expired or failed before the user could review duplicate
  results
- a duplicate accidental purchase was made for the same user
- required safety behavior failed, such as report generation after Trash

Refunds may be declined when:

- the request is outside the 7-day window and no product failure is shown
- the user completed a paid cleanup and wants a refund only because fewer
  duplicates were found than expected
- the issue is caused by a provider outage or account state outside
  PhotoSweep's control and the advertised Google Photos, iCloud Photos, or
  Amazon Photos workflow still works on a supported setup
- the request appears fraudulent, abusive, or tied to a disputed payment already
  handled by Stripe

## Plan-Specific Notes

Mini Cleanup is a permanent limited unlock. Cleanup Pass is a seven-day
large-cleanup window. If PhotoSweep fails before the user can review the paid
duplicate results, refund the purchase.

Lifetime Early Access is refundable during the 7-day window if PhotoSweep cannot
provide the advertised Google Photos, iCloud Photos, or Amazon Photos workflow
on the user's supported setup.

Google Photos, iCloud Photos, and Amazon Photos use the same free and paid
feature limits. Provider-specific support claims require current live
Trash/Restore validation evidence.

## How Users Request A Refund

Users can contact support with:

- purchase email
- approximate purchase date
- plan purchased
- short description of the issue
- optional paid-user diagnostics export

Support contact:

`pawsitivegames@gmail.com`

Do not ask users to send photo URLs, thumbnails, filenames, album names, raw
reports, exact timestamps, people/location labels, or page content for refund
review.

## License Handling

Approved full refunds and disputes deactivate the matching license entitlement
through Stripe webhook handling. A partial refund does not revoke the entire
purchase. The extension reconciles an existing token at startup and falls back
to free limits after refresh or when the signed token expires.
