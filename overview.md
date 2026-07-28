# Phase 5: HCS Provenance + Verification Surface - Context Overview

This document contains the skeletonized context needed to implement Phase 5 of the CacheDrive architecture (Hedera Consensus Service Provenance).

### Missing Implementation Details to be Addressed:
1. **File Refactoring**: Move the generic `submitHCSRecord` from `app/lib/hedera.ts` into a dedicated `app/lib/hedera/hcs.ts` with strongly typed `ProvenanceEvent` payloads.
2. **Cryptographic Hashing**: When files are uploaded (`app/api/items/route.ts`) or AI-generated (`app/lib/ai/aiService.ts`), the system must compute a `sha256` buffer hash and store it in the `Item` model (`checksumSha256`).
3. **Event Logging (Fire-and-forget)**: Emit correctly structured JSON payloads (≤1024 bytes) for `ITEM_UPLOADED`, `LISTING_CREATED`, `PURCHASE_SETTLED`, and `AI_CONTENT_GENERATED` at their respective lifecycle hooks without blocking the HTTP response.
4. **Verification Read API**: Create `GET /api/items/[id]/provenance` to proxy the Hedera Mirror Node, decode base64 messages, filter for the specific item/hash, and return the provenance history.
5. **UI Surface**: Add a "Provenance" tab to the UI (e.g. `FileViewerModal.tsx` or Item Details) to render the history, with direct links out to `https://hashscan.io/testnet/topic/{topicId}`.

Below are the stripped-down code skeletons of the relevant files that require modification to fulfill these requirements.

---

