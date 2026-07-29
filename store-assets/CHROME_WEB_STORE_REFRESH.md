# Chrome Web Store Refresh

## Approved Listing Direction

### Title

PhotoSweep - Duplicate Photo Finder

### Short Description

Duplicate photo finder for Google Photos™, with iCloud and Amazon support where available. Review matches before cleanup.

### First Paragraph

PhotoSweep helps you find duplicate and similar photos in Google Photos™, with iCloud Photos and Amazon Photos support available where the provider flow, region, account state, loaded library area, and media type support it. Review matches first, then clean up confirmed items using each service's available Trash or Recently Deleted flow.

PhotoSweep is not affiliated with, created by, or endorsed by Google, Apple, Amazon, or their photo services. Google Photos is a trademark of Google LLC. Use of this trademark is subject to Google Permissions. Apple, iCloud, and iCloud Photos are trademarks of Apple Inc. Amazon and Amazon Photos are trademarks of Amazon.com, Inc. or its affiliates.

## Messaging Rules

- Google Photos should be the clearest primary use case; iCloud Photos and Amazon Photos should remain visible as supported surfaces where available.
- Do not imply official Google, Apple, or Amazon integration.
- Do not imply identical feature parity across all providers.
- Use "signed-in browser session" rather than account/API language.
- Use "where available" and provider-flow caveats for compatibility near the first provider mention.
- Say "Photo matching runs locally in your browser" rather than absolute privacy claims.
- Say "does not upload your photo library for analysis" rather than vague "100% private" language.
- Emphasize review-before-cleanup and provider Trash/Recently Deleted flows.

## Screenshot Replacement Requirements

Chrome Web Store screenshot target: 1280 x 800 PNG.

Screenshots must be product-dominant:

- Real shipped extension UI should take most of the frame.
- Caption text must be outside the UI, not covering the extension layout.
- If iCloud/Amazon are mentioned or shown, the provider selector must be visible and functional in the captured UI.
- Screenshots must not claim identical feature parity across Google Photos, iCloud Photos, and Amazon Photos.
- Screenshots must show review-before-cleanup behavior, not one-click deletion.
- Screenshots based on local seeded duplicate state must be labeled as example review or example confirmation states in the caption band.

## Proposed Screenshot Set

1. Choose your cloud photo library
   - Shows provider selector with Google Photos, iCloud Photos, and Amazon Photos.
   - Caption: "Find duplicates across supported cloud photo libraries."

2. Scan a focused area first
   - Shows scan settings and date/batch/scope controls.
   - Caption: "Start with a focused scan before a large cleanup."

3. Review duplicate groups
   - Shows duplicate review screen with exact/similar grouping.
   - Caption: "Compare matches and choose what to keep."

4. Review duplicate groups
   - Shows duplicate review screen with exact/similar grouping using local seeded example state.
   - Caption: "Example review state: compare matches and choose what to keep."

5. Confirm before cleanup
   - Shows typed confirmation and audit-report warning using local seeded example state.
   - Caption: "Example confirmation state: typed confirmation and an audit report come first."

## Critic Gate

Before live Web Store changes:

- Good cop must approve clarity, conversion, trust, and product fit.
- Bad cop must approve policy safety, truthfulness, privacy wording, and screenshot accuracy.
