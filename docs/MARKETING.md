# Marketing Plan: PhotoSweep

## Recommended Name

**PhotoSweep**

PhotoSweep is short, memorable, and action-oriented. It suggests cleaning up a photo library without sounding technical or risky. It also leaves room to support Google Photos, iCloud Photos, Amazon Photos, and future providers without renaming the product.

Tagline:

> Clean up duplicate photos without uploading your library.

## Name Shortlist

| Name | Why it works | Concern |
| --- | --- | --- |
| **PhotoSweep** | Broad, catchy, cleanup-focused, provider-neutral | Needs trademark/domain check |
| SnapSweep | More playful, still memorable | Slightly less clear for non-phone photos |
| PhotoPrune | Conveys cleanup and reduction | "Prune" can feel destructive |
| GallerySweep | Provider-neutral and cleanup-oriented | Less direct than PhotoSweep |
| CloneCleaner | Very clear for duplicate removal | Sounds more utility-like, less premium |
| PhotoSlim | Implies storage savings | Could sound like compression instead of duplicate cleanup |
| Duplicate Desk | Trustworthy utility tone | Less catchy, less consumer-friendly |
| PhotoTidy | Friendly and simple | Softer, may feel less powerful |

Recommendation: use **PhotoSweep** unless trademark/domain checks fail.

## Product Definition

PhotoSweep is a privacy-first browser extension that finds duplicate and near-duplicate photos in online photo libraries, lets users review every suggested match, and safely moves confirmed duplicates to Trash.

The product should lead with Google Photos, because that is the current strongest use case and strongest search intent. The brand should not be locked to Google Photos, because the codebase is already expanding toward iCloud Photos and Amazon Photos.

Primary product category:

> Private duplicate photo cleaner for cloud photo libraries.

One-line description:

> PhotoSweep finds duplicate photos in Google Photos from your browser, keeps analysis local, and gives you a review-first cleanup workflow before anything moves to Trash.

## Positioning

### Core Position

PhotoSweep is the safe, local-first alternative to uploading your photo library into a duplicate-cleaner app.

### Differentiators

- **Local-first analysis:** photo matching runs in the browser.
- **No OAuth setup:** users do not need a Google Cloud project or API credential setup.
- **Review-first cleanup:** users approve groups before moving anything to Trash.
- **Trash, not permanent delete:** cleanup remains reversible through the provider Trash flow.
- **Large-library workflow:** scoped scans, checkpoints, cache diagnostics, and resume support.
- **Explainable results:** exact and similar duplicate groups are separated with reasons.
- **Portable reports:** CSV/JSON audit exports before destructive action.

### Positioning Statement

For people with crowded Google Photos libraries, PhotoSweep is a privacy-first duplicate photo cleaner that scans locally in the browser and guides users through a review-first cleanup. Unlike upload-based duplicate cleaners, PhotoSweep does not send photo analysis to a backend and does not permanently delete files.

## Audience

### Primary Audience

People paying for or approaching a Google One storage upgrade because their photo library is full.

Signals:

- "Google Photos storage full"
- "Remove duplicate photos from Google Photos"
- "Google Photos duplicate finder"
- "How to clean up Google Photos"
- "Free up Google Photos storage"
- "Google Photos keeps duplicate photos"

Pain:

- They do not know which photos are duplicates.
- Google Photos does not provide a built-in duplicate cleanup workflow.
- They are nervous about accidentally deleting memories.
- They do not want to upload private photos into another app.

Motivation:

- Avoid or delay storage upgrades.
- Reduce clutter.
- Clean imported, backed-up, or migrated libraries.
- Regain trust in a messy library.

### Secondary Audience

Power users and family tech helpers who maintain large family photo libraries.

Signals:

- 10k-100k photo libraries.
- Multi-year imports from phones, drives, and shared albums.
- Needs reports, undo, and repeatable workflows.

Motivation:

- Clean safely in batches.
- Prove what changed.
- Avoid manually checking thousands of photos.

### Tertiary Audience

Privacy-conscious users who reject cloud upload cleanup tools.

Signals:

- Searches include "private", "local", "no upload", "offline", "browser extension".
- May be willing to pay more if privacy is credible.

## Messaging Pillars

### 1. Private by Design

Primary message:

> Your photos do not need to leave your browser for duplicate analysis.

Support points:

- Local browser-based matching.
- No photo-analysis backend.
- No OAuth credential setup.
- Clear privacy policy.

### 2. Safe Before Fast

Primary message:

> Review every duplicate group before moving anything to Trash.

Support points:

- Conservative recommendations.
- Typed confirmation before Trash actions.
- Trash result report.
- Restore path through provider Trash.
- Exportable audit report.

### 3. Built for Real Libraries

Primary message:

> Clean in small batches or work through a large library with checkpoints and resume support.

Support points:

- Scoped scans by album/date range.
- Resume interrupted scans.
- Cache embeddings and metadata locally.
- Exact and similar duplicate handling.

### 4. Storage Savings

Primary message:

> Find what is wasting storage before buying more.

Support points:

- Show estimated recoverable storage.
- Compare cleanup value against Google One storage upgrades.
- Surface duplicate count and total size before paid unlock.

## Pricing Strategy

Recommended launch pricing:

| Plan | Price | Purpose |
| --- | ---: | --- |
| Free | $0 | Prove trust and show value |
| Mini Cleanup | $2.99 | Convert small one-session cleanup users |
| Cleanup Pass | $4.99 for 7 days | Convert one-time large cleanup users |
| Lifetime Early Access | $14.99 | Best consumer-friendly launch anchor |

Recommended first launch:

- Free tier
- $2.99 Mini Cleanup
- $4.99 Cleanup Pass
- $14.99 Lifetime Early Access

Add annual pricing only after support/update burden and recurring usage are
proven. Launch paid claims for Google Photos, iCloud Photos, and Amazon Photos
only after each provider has current live Trash/Restore evidence.

### Free Tier

Free users should experience the full trust model, but with scale limits.

Include:

- Scan up to 1,000 photos and show 25 duplicate groups.
- Show estimated duplicates and recoverable storage.
- Review duplicate groups.
- Export sample report.
- Move a small number of confirmed duplicates to Trash.

Limit:

- Full-library scans.
- Unlimited duplicate groups.
- Bulk Trash.
- Advanced keep rules.
- Large-library resume.
- Paid-scale cleanup beyond the free limits.

### Paid Tiers

Unlock:

- Mini Cleanup: 2,500-photo scans, 75 visible groups, and 100 Trash moves.
- Cleanup Pass: 10,000-photo sessions, full reports, full scan, and large resume for 7 days.
- Lifetime Early Access: unlimited Google Photos, iCloud Photos, and Amazon
  Photos workflows for early users.
- Advanced scan modes.
- Similar-photo sensitivity controls.
- Smart keep strategy.
- CSV/JSON reports.
- Checkpoint/resume.
- Priority fixes for provider UI breakages.

Use the same free and paid limits for Google Photos, iCloud Photos, and Amazon
Photos. Keep provider-specific caveats tied to current validation evidence, not
to separate pricing rules.

Do not gate:

- Safety confirmations.
- Result reports after Trash actions.
- Restore guidance.
- Privacy controls.
- Critical warnings.

## Monetization Implementation

Chrome Web Store native payments are deprecated, so monetization should use an external payment and license flow.

Recommended path:

1. Use Stripe Checkout and the signed license API for the first paid launch.
2. Store only entitlement state and purchase metadata needed for licensing.
3. Keep duplicate detection local.
4. Cache entitlement locally with periodic refresh.
5. Provide a license recovery flow by email.
6. Keep the app usable offline for already-licensed users where practical.

Payment copy:

> Payment unlocks larger cleanup workflows and ongoing maintenance. Photo analysis still runs locally in your browser.

## Brand Voice

Tone:

- Calm
- Practical
- Privacy-aware
- Safety-first
- Not alarmist

Avoid:

- "Delete photos automatically"
- "AI cleans your library for you"
- "One-click delete"
- "We scan your photos"
- "Upload your library"

Use:

- "Review"
- "Move to Trash"
- "Local analysis"
- "Duplicate groups"
- "Recoverable storage"
- "Export a report"
- "Restore if needed"

## Website Structure

### Hero

Headline:

> Clean up duplicate photos without uploading your library.

Subheadline:

> PhotoSweep finds duplicate and similar photos in Google Photos from your browser, then lets you review every group before anything moves to Trash.

Primary CTA:

> Install PhotoSweep

Secondary CTA:

> Watch demo

Hero proof points:

- Local-first analysis
- Review before Trash
- Exportable reports

### Section: Why PhotoSweep

Headline:

> Google Photos is great at storing memories. It is not built for duplicate cleanup.

Body:

> Imports, backups, shared albums, phone migrations, and downloads can leave thousands of duplicate or near-duplicate photos in your library. PhotoSweep gives you a careful cleanup workflow without sending your photo analysis to a backend.

### Section: How It Works

1. Pick a scope: album, month, year, or full library.
2. Scan locally in your browser.
3. Review exact and similar duplicate groups.
4. Export a report.
5. Move confirmed duplicates to Trash.
6. Restore from Trash if anything looks wrong.

### Section: Privacy

Headline:

> Your cleanup should not require another photo upload.

Body:

> PhotoSweep runs duplicate matching locally in your browser using bundled analysis assets. The product is designed around local processing, clear review, and reversible cleanup.

### Section: Safety

Headline:

> Built to slow down the risky part.

Body:

> PhotoSweep can help find duplicate candidates quickly, but it keeps deletion deliberate: review groups, export reports, type the item count, and move items to Trash instead of permanently deleting them.

### Section: Pricing

Headline:

> Start free. Pay when PhotoSweep finds enough to clean.

Plans:

- Free: small scans and reports.
- Cleanup Pass: one short cleanup window.
- Pro: unlimited scans and large-library workflow.

### Section: FAQ

Questions:

- Does PhotoSweep upload my photos?
- Is PhotoSweep affiliated with Google?
- Can PhotoSweep permanently delete photos?
- Can I restore items from Trash?
- Why does PhotoSweep need access to Google Photos pages?
- What happens if Google Photos changes?
- Does it work with iCloud or Amazon Photos?
- How does payment work?

## Chrome Web Store Listing

### Title

PhotoSweep - Duplicate Photo Finder

### Short Description

Duplicate photo finder for Google Photos™, with iCloud and Amazon support where available. Review matches before cleanup.

### Detailed Description

PhotoSweep helps you find duplicate and similar photos in Google Photos™, with iCloud Photos and Amazon Photos support available where the provider flow, region, account state, loaded library area, and media type support it. Review matches first, then clean up confirmed items using each service's available Trash or Recently Deleted flow.

PhotoSweep is not affiliated with, created by, or endorsed by Google, Apple, Amazon, or their photo services. Google Photos is a trademark of Google LLC. Use of this trademark is subject to Google Permissions. Apple, iCloud, and iCloud Photos are trademarks of Apple Inc. Amazon and Amazon Photos are trademarks of Amazon.com, Inc. or its affiliates.

Choose a provider, scan a focused library area, review duplicate groups, choose what to keep, export a report if needed, and clean up only after confirming the selected items.

PhotoSweep is designed for careful cleanup:

- Find exact and similar duplicate photos.
- Use Google Photos, with iCloud Photos and Amazon Photos support where available from signed-in browser sessions.
- Scan smaller scopes before working through a large library.
- Review duplicate groups before cleanup.
- Keep exact and similar matches separate.
- Choose which copy to keep.
- Export JSON or spreadsheet reports.
- Use typed confirmation before Trash actions.
- Use each provider's available Trash or Recently Deleted flow where supported.

Photo matching runs locally in your browser using bundled analysis assets. PhotoSweep does not upload your photo library for analysis. Payment, licensing, and support diagnostics are handled separately from photo matching.

Availability and cleanup behavior can vary by provider, region, account state, loaded library area, and media type. Some cleanup steps may require the provider's own web interface. Always review results before moving photos to Trash or Recently Deleted.

### Ratings and Trust

Chrome Web Store prioritization considers both the number of ratings and the
average rating. Users who have installed an extension can leave a rating and a
written review.

Ask for honest reviews only after a user successfully completes a real scan and
has enough experience to evaluate PhotoSweep. There is no verified "magic"
rating count or average-rating target. Never buy, fabricate, or incentivize
ratings or reviews.

The in-extension prompt gives every user equal access to both an honest public
review and direct support feedback. Do not first ask whether the experience was
positive or route unhappy users away from the Chrome Web Store. Users can defer
the prompt or permanently dismiss it.

The previously reported Enhanced Safe Browsing "not trusted" warning was not
reverified in the current release pass, so it is not treated as a confirmed
finding.

## Launch Plan

### Phase 1: Trust Foundation

Goal:

Build credibility before asking for payment.

Tasks:

- Publish privacy policy.
- Publish clear safety model.
- Add demo video.
- Add sample report screenshots.
- Add install instructions.
- Add support email.
- Add "not affiliated with Google" disclaimer.

### Phase 2: Free Beta

Goal:

Collect usage feedback and prove that the workflow is safe.

Tasks:

- Release free version with scan limits.
- Ask users for anonymized bug reports only.
- Track non-photo analytics such as installs, starts, completed scans, and upgrade clicks.
- Collect testimonials focused on recovered storage and trust.

### Phase 3: Paid Unlock

Goal:

Convert users after value is visible.

Tasks:

- Add entitlement system.
- Add free scan cap.
- Add upgrade prompt after duplicate estimate.
- Add Mini Cleanup, Cleanup Pass, and Lifetime Early Access.
- Add refund policy.
- Add license recovery.

### Phase 4: Provider Expansion

Goal:

Increase perceived value and reduce dependency on Google Photos.

Tasks:

- Stabilize iCloud Photos support.
- Stabilize Amazon Photos support.
- Rebrand listing from "Google Photos Deduper" to "PhotoSweep" with provider-specific landing pages.
- Add provider matrix to pricing page.

## Funnel

1. User searches for duplicate cleanup or Google Photos storage help.
2. Landing page promises local-first cleanup.
3. User installs free version.
4. User runs a scoped scan.
5. App shows duplicate count and estimated recoverable storage.
6. User reviews sample groups.
7. Upgrade prompt unlocks full cleanup.
8. User exports report and moves duplicates to Trash.
9. App offers an honest review or direct feedback after a successful real scan.

Best upgrade moment:

> After the scan finds meaningful recoverable storage, before bulk cleanup.

Avoid upgrade prompts before the user sees value.

## Upgrade Copy

Headline:

> PhotoSweep found more duplicates than the free cleanup limit.

Body:

> Upgrade to review and clean the full scan, export complete reports, and use large-library resume tools. Photo analysis stays local in your browser.

Buttons:

- Lifetime Early Access
- Mini Cleanup
- Get 7-Day Cleanup Pass
- Keep Reviewing Free Results

## Email Capture

Use email only for licensing, support, and optional product updates.

Copy:

> Used only for license recovery, receipts, and product updates you opt into.

Avoid requiring email before the user can try a free scan.

## SEO Strategy

Primary keywords:

- Google Photos duplicate finder
- Google Photos duplicate remover
- delete duplicate photos Google Photos
- Google Photos storage full
- clean up Google Photos
- duplicate photo cleaner Chrome extension

Secondary keywords:

- private duplicate photo finder
- local duplicate photo cleaner
- find similar photos Google Photos
- Google Photos cleanup tool
- remove duplicate backed up photos

Landing pages:

- `/google-photos-duplicate-finder`
- `/google-photos-storage-cleanup`
- `/private-duplicate-photo-cleaner`
- `/icloud-photos-duplicate-finder` once stable
- `/amazon-photos-duplicate-finder` once stable

## Content Ideas

- How to remove duplicate photos from Google Photos safely
- Why Google Photos storage fills up after phone migrations
- Duplicate vs similar photos: what to review before deleting
- How to clean Google Photos without uploading your photos
- Google Photos cleanup checklist before buying more storage
- How to restore deleted photos from Google Photos Trash

## Trust Assets

Create:

- Privacy policy.
- Safety model page.
- Demo video.
- Sample CSV/JSON report.
- "How restore works" page.
- Changelog.
- Known limitations page.
- Provider compatibility page.
- Public issue tracker link.

## Metrics

Track without collecting photo content:

- Installs.
- Extension opens.
- Scan starts.
- Scan completes.
- Duplicate groups found.
- Estimated storage recoverable bucketed into ranges.
- Report exports.
- Trash confirmation starts.
- Trash actions completed.
- Upgrade clicks.
- Purchases.
- Refunds.

Do not track:

- Photo URLs.
- Photo thumbnails.
- Photo metadata that can identify people, places, or filenames unless explicitly exported by the user.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Google Photos web UI changes | Extension can break | Charge for maintenance, keep changelog, add diagnostics |
| Users fear deletion | Low conversion | Emphasize review, Trash, reports, restore |
| Store review flags privacy concerns | Publishing delays | Strong privacy policy and minimal permissions explanation |
| Open-source forks bypass payment | Revenue leakage | Monetize signed releases, updates, support, convenience |
| False positives | Trust loss | Conservative defaults, exact/similar separation, review-first |
| Users only need one cleanup | Subscription resistance | Offer Mini Cleanup, 7-day Cleanup Pass, and Lifetime Early Access |

## Recommended Next Steps

1. Run trademark and domain checks for PhotoSweep.
2. Create a simple landing page with the hero, privacy, safety, and pricing sections.
3. Add in-app storage-savings estimate before the upgrade screen.
4. Add a free scan cap that proves value without giving away full cleanup.
5. Add Stripe Checkout and signed entitlement handling.
6. Publish privacy policy and support page before Chrome Web Store submission.
7. Rename only after provider-neutral copy is ready, so the brand feels intentional.

## Source Notes

- Google One storage pricing is a useful value anchor for cleanup messaging: https://one.google.com/about/plans
- Chrome Web Store native payments were deprecated, so paid extension monetization needs an external payment/licensing flow: https://github.com/GoogleChrome/developer.chrome.com/blob/main/site/en/docs/webstore/cws-payments-deprecation/index.md
- Chrome Web Store policies should shape privacy, ad, and data-use messaging: https://developer.chrome.com/docs/webstore/program-policies/policies
- Chrome Web Store rating count and average rating are prioritization inputs, and installed users can leave ratings and written reviews: https://support.google.com/chrome_webstore/answer/12225786
- ExtensionPay is a common extension-specific payment option for one-time and recurring unlocks: https://extensionpay.com/
