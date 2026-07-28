# PhotoSweep

PhotoSweep helps people identify duplicate media, decide which copies to keep, and move the remaining copies to a provider's trash with an auditable path back.

## Language

**Duplicate Group**:
A set of media items that PhotoSweep has identified as copies or sufficiently similar candidates for review.
_Avoid_: Cluster, match bucket

**Duplicate Review Session**:
The current decisions about which duplicate groups are actionable and which media items must be kept within them.
_Avoid_: Selection state, review UI state

**Scan Lifecycle**:
The progress of one attempt to inspect a media library, from its start through completion, interruption, cancellation, or failure.
_Avoid_: Scan state, scan job

**Photo Provider**:
A supported photo-library product whose signed-in web session PhotoSweep can inspect and operate.
_Avoid_: Source, platform

**Photo Provider Connection**:
The current association between a PhotoSweep app context and the reachable signed-in Photo Provider tab that receives its commands.
_Avoid_: Tab map, bridge state

**Duplicate Detection Engine**:
The capability that turns a collection of media items and a scan mode into duplicate groups.
_Avoid_: Detector helpers, matching utilities

**Trash Lifecycle**:
One auditable attempt to move reviewed media items to a Photo Provider's trash, including partial outcomes and a possible restore.
_Avoid_: Delete state, trash UI state

**Paid Access Lifecycle**:
The verified access state for this browser session, including refresh-before-action, checkout, and recovery.
_Avoid_: License UI state, premium flag

**Stored Review Scope**:
Saved settings, Scan Lifecycle checkpoint, scan results, and Duplicate Review Session decisions that belong to one Photo Provider and account context.
_Avoid_: Cached state, storage blob
