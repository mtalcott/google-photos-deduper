# Dependency overrides

Last reviewed: 2026-07-28

PhotoSweep temporarily overrides two transitive production dependencies while
waiting for compatible upstream releases from the Google Cloud dependency tree:

```json
{
  "gaxios": "7.1.5",
  "rimraf": "6.1.3"
}
```

## Why

- `gcp-metadata` pins `gaxios` 7.1.3, which retains the vulnerable Rimraf 5
  dependency path.
- `google-gax` permits Rimraf 5, whose Glob/Minimatch dependency path retains
  the vulnerable `brace-expansion` release.
- Gaxios 7.1.5 removes its Rimraf dependency. Rimraf 6 resolves to Glob 13,
  Minimatch 10, and patched `brace-expansion` 5.0.8.

The overrides are a temporary compatibility measure, not a waiver. They must
be removed once Google Cloud packages publish compatible dependency ranges.

## Required verification

Before release, run the full CI suite and a deployed Firestore-backed license
service smoke test. Verify checkout, signed entitlement refresh, Stripe webhook
processing, recovery, and rollback with the overridden dependency graph.

## Sources

- https://github.com/googleapis/google-cloud-node-core/issues/925
- https://osv.dev/vulnerability/GHSA-mh99-v99m-4gvg
