---
title: Peach Finder — LLD — Media & Object Storage Module
updated: 2026-08-20
---

# Media & Object Storage (`media-processing`) — Low-Level Design

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Low-Level Design — `media-processing` module (`src/lib/server/modules/media-processing/`) |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | SRS §7 (SR-MEDIA-01..05), §5 (SR-APP-01), §8 (SR-PERF), §9 (SR-CAP-01), §11 (SR-SEC-06/09); HLD-DEC-05, §5 (bucket/CDN path), §7.4 (upload flow), §8 (MinIO); FRS §7 (FR-PROF-01), §10 (FR-TRUST-03), §16 (FR-PRIV-05); `03-user-stories` US-PONB-03, US-VERIF-01, US-ADMIN-02 |
| Foundations (binding) | `00-foundations/shared-kernel.md`, `00-foundations/api-conventions.md`, `00-foundations/event-catalog.md`, `00-foundations/security-implementation.md` |
| Status | Living document — updated in place |

**What this module is:** the single pipeline every uploaded image passes through — technical validation, EXIF/GPS stripping, variant encoding, content-hashed immutable storage in MinIO — plus the private, admin-only path for identity-verification documents. It is a supporting module: `provider-profile` (profile photos), `direct-messaging` (attachments), and `trust-and-safety` (identity docs) call its facade; none of them touch MinIO directly.

**Binding stances honoured (FRS §1 / SRS §1):** validation is **technical only** — decodability, size, count. The module asks *"is this a well-formed image?"*, **never** *"what does it depict?"*. There is no content analysis, classification, or moderation of any kind anywhere in this module (clean-code §12 `media-processing` row). EXIF/GPS stripping is unconditional and test-enforced (SR-MEDIA-03, HLD D-9).

---

## 2. Module purpose & scope (SR-MEDIA-01..05, HLD-DEC-05)

| In scope | Out of scope (owner) |
|---|---|
| Two MinIO buckets: `media` (public via CDN path), `identity-docs` (private, SSE) | Which photos belong to a profile / gallery order / primary — `provider-profile` (`provider_photo`) |
| Multipart upload intake: auth, ownership, size ≤ 10 MB, count ≤ 12/profile (SR-MEDIA-02) | Message-attachment thread association — `direct-messaging` |
| Processing pipeline: content-sniff decode, EXIF/GPS strip, WebP+JPEG variants, content-hash (SR-MEDIA-03) | Identity-verification case state / review decisions — `trust-and-safety` |
| Immutable content-hashed delivery; removal + CDN purge (SR-MEDIA-04) | Badge/verification workflow — `trust-and-safety`; CDN edge config — Cloudflare/Caddy (HLD-DEC-07) |
| Presigned GET issuance for `identity-docs` to admin sessions only, audit-logged | Discovery projection refresh — `discovery-search` (reacts to `MediaProcessed`) |

Processing runs in the **`worker`** process (HLD-DEC-02/05) via `sharp` (libvips + libheif); the `web` process only accepts the upload and enqueues the job (HLD §7.4).

---

## 3. Data model — `media-processing` schema (Postgres DDL)

Conventions per `shared-kernel.md` §10 (schema-per-module; cross-schema FK only onto `identity_and_access.user`), §2 (UUIDv7 IDs), §4 (UTC `timestamptz`).

### 3.1 Enums

```sql
create type media_processing.bucket        as enum ('media', 'identity-docs');
create type media_processing.photo_status  as enum ('pending', 'processing', 'ready', 'failed');
create type media_processing.variant_kind  as enum ('thumb_320', 'card_640', 'gallery_1280', 'archival_2048');
```

### 3.2 `media_processing.photo`

```sql
create table media_processing.photo (
  id            uuid primary key,
  owner_id      uuid not null references identity_and_access."user"(id),
  bucket        media_processing.bucket not null,
  object_key    text,                          -- final content-hashed key; null until 'ready' (staging key held transiently, not persisted)
  content_hash  text,                          -- sha-256 of final processed bytes; null until 'ready'
  status        media_processing.photo_status not null default 'pending',
  mime_type     text,                          -- sniffed output type ('image/webp' | 'image/jpeg'); source type not trusted
  size_bytes    bigint,                        -- final stored original/archival size; source size checked pre-write (§4a)
  failed_reason text,                          -- plain-language, owner-safe (FR-UX-05); set iff status='failed'
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index photo_owner_idx  on media_processing.photo (owner_id);
create index photo_status_idx on media_processing.photo (status) where status in ('pending','processing');
create unique index photo_content_hash_idx on media_processing.photo (bucket, content_hash) where content_hash is not null;
```

- `bucket` is the intake discriminator (§4 vs §5.2): a `media` row runs the full variant pipeline; an `identity-docs` row is stored private with **no variants** (§5.2).
- `content_hash` is computed over the **final processed bytes** (§4g), making the object key immutable and deduplicable (unique per bucket).

### 3.3 `media_processing.photo_variant` (only for `bucket='media'`)

```sql
create table media_processing.photo_variant (
  photo_id  uuid not null references media_processing.photo(id) on delete cascade,
  variant   media_processing.variant_kind not null,
  url       text not null,                     -- CDN path URL, content-hashed, immutable (SR-MEDIA-04)
  width     integer not null,
  height    integer not null,
  primary key (photo_id, variant)
);
```

- Identity-docs produce **no** `photo_variant` rows (never re-encoded to public variants, never delivered by URL — §5.2).

---

## 4. Upload pipeline algorithm (`bucket='media'`) — deterministic steps (SR-MEDIA-02/03, HLD §7.4)

Steps (a)–(c) run in `web` (request path); (d)–(i) run in `worker` (pg-boss `media-processing.process` job, HLD-DEC-02).

**(a) `web` accepts multipart upload — all checks BEFORE any storage write:**
- Authenticated (`AuthContext.userId != null`) and **ownership**: the upload is for the caller's own resource (`ctx.requireOwnership(ownerId)`); anonymous → 401 at the hook.
- **Size ≤ 10 MB** (SR-MEDIA-02, HLD D-12) → else `413 IMAGE_TOO_LARGE` (event-catalog §5). Enforced by a streaming byte-counter, not `Content-Length` trust.
- **Count ≤ 12/profile** for scope `profile_photo` (FR-PROF-01) → else `409 PHOTO_LIMIT_REACHED`. The current gallery count is read via `provider-profile`'s facade (`provider-profile.getGalleryCount(ownerId)`) — a read-side facade call; `media-processing` does not own the 12-limit, it enforces it at the boundary on `provider-profile`'s behalf.

**(b)** Stream the original bytes to a MinIO **staging prefix** (`media/_staging/<uuid>`), inserting a `media_processing.photo` row `status='pending'`. Streaming means the ≤10 MB body never fully buffers in memory (SR-PERF/CAP).

**(c)** Enqueue a `media-processing.process` pg-boss job carrying `{ photoId }`; respond `202` with `{ photoId, status:'pending' }` (client polls §7.2). Set `status='processing'` when the worker picks it up.

**(d) Content-sniff decode (worker):** decode via `sharp`(libvips + libheif) using **magic bytes, not the file extension** (SR-MEDIA-02). Accepted inputs: JPEG, PNG, WebP, HEIC. A file that does not decode as one of these → `status='failed'`, `failed_reason` set, surface `422 IMAGE_UNDECODABLE` (event-catalog §5). No content inspection beyond "does it decode".

**(e) Strip ALL metadata, including GPS — unconditional (SR-MEDIA-03, HLD D-9):** `sharp` strips all EXIF/IPTC/XMP by default; the safeguard is that **`.withMetadata()` is NEVER called** in this pipeline (calling it would *retain* metadata). Stated as:
- a **code-review-checklist item** (clean-code §12 `media-processing` row): "no `.withMetadata()` anywhere in `media-processing/infra`";
- a **test requirement**: a unit/integration test uploads a geotagged JPEG fixture and asserts **zero** EXIF GPS tags survive on every output variant (clean-code §10 `infra` row; SR-MEDIA-03). This is the regression test that would catch an accidental metadata-retain.

**(f) Encode variants — WebP-first with JPEG fallback (SR-MEDIA-03b, HLD-DEC-05):** for each target, longest-edge-capped, never upscaled:

| `variant_kind` | Longest edge | Use |
|---|---|---|
| `thumb_320` | 320 px | list thumbnails |
| `card_640` | 640 px | result/profile cards (FR-SRCH-11), OG image (`provider-profile` §5.5) |
| `gallery_1280` | 1280 px | profile gallery |
| `archival_2048` | 2048 px | capped archival original |

Each variant is emitted as **both** WebP and JPEG (the JPEG fallback set, SR-MEDIA-03b) so a browser without WebP still gets a served image; the delivery layer picks by `Accept`/`<picture>` source. Images are lazy-loaded and responsively sized downstream (SR-MEDIA-04, FR-UX-02).

**(g) Content-hash → immutable object key:** SHA-256 over the final processed bytes; object key `media/<content_hash>/<variant>.<ext>`. Immutability makes the URL its own cache key (SR-MEDIA-04) — a changed photo is a *new* URL, so no invalidation is needed.

**(h) Commit in one transaction:** insert the `media_processing.photo` final fields (`object_key`, `content_hash`, `mime_type`, `size_bytes`, `status='ready'`) + all `photo_variant` rows + `outbox(MediaProcessed{photoId, ownerId, variantUrls})` — atomically (`shared-kernel.md` §6.2). The staging object is deleted after commit. `MediaProcessed` drives `provider-profile`'s gallery finalize (`PhotoAdded`) and `discovery-search` refresh (event-catalog §2).

**(i) On any step (d)–(h) failure:** mark `status='failed'`, set an owner-safe `failed_reason`, leave **no** partial `ready` rows and **no** variants published; surface a plain-language retryable error (FR-UX-05). Idempotent: a retried `media-processing.process` job for a `failed`/`pending` photo re-runs cleanly; a job for an already-`ready` photo is a no-op (natural key on `content_hash`).

---

## 5. Bucket policy (SR-MEDIA-01, SR-SEC-09, HLD §5/§8)

### 5.1 `media` bucket — public **only** via the reverse-proxy CDN path
- Served **exclusively** through Caddy's `/media` path → MinIO (HLD §5 container view, HLD-DEC-07), fronted by Cloudflare long-lived edge cache (immutable content-hashed URLs, SR-MEDIA-04). **No direct MinIO public endpoint is exposed** — MinIO has no published host port and lives on the Docker-internal network (SR-SEC-02, HLD §9). Public readability is a property of the Caddy path + immutable keys, not of MinIO being internet-facing.

### 5.2 `identity-docs` bucket — private, SSE-encrypted, admin-presigned only (FR-TRUST-03)
- Intake path is **separate** from §4: an identity-doc submission (§7.4) validates (auth, ownership, size, decodability), **strips EXIF/GPS** (unconditional, D-9), stores the validated original into the `identity-docs` bucket with **server-side encryption (SSE)** at rest (SR-SEC-09, SR-MEDIA-01), and does **not** generate public variants and does **not** re-encode to a lossy public format (an ID document must stay legible for admin review). `status='ready'`, `bucket='identity-docs'`.
- **Read is only ever via a short-lived presigned GET**, TTL **≤ 5 minutes** (SR-MEDIA-01, api-conventions §11 / security-impl §8), issued **exclusively** to an authenticated admin session (`is_admin = true`), during identity review (US-ADMIN-02, flow §19.2/19.4). Issuance is **audit-logged**: `shared.audit_log` action **`media-processing.identity_doc_presign`**, `target_type='photo'` (appended to event-catalog §4 by this LLD).
- **Deny-by-default MinIO bucket policy:** the `identity-docs` bucket has an explicit MinIO policy denying all anonymous and non-admin access; the *only* grant is the application issuing a scoped, expiring presigned URL from an admin session. **Under no configuration is an `identity-docs` object listable or fetchable anonymously** (SR-MEDIA-01) — this is enforced by the MinIO bucket policy (deny-by-default, admin-session-scoped presign grants only), **not** by application-layer convention alone. Identity docs are purged ≤ 90 days post-decision (FR-PRIV-05, SR-DATA-03) by `trust-and-safety`'s purge job calling `media-processing.remove`; backups honour the same encryption and the ≤35-day purge-propagation window (SR-AVL-03).

---

## 6. Delivery & removal (SR-MEDIA-04)

- **Immutable content-hashed URLs** (§4g): Cloudflare caches indefinitely; a photo change is a new URL, so **no CDN invalidation is ever required** for changes. This is why there is no image-transform proxy (HLD-DEC-05) — variants are pre-generated and immutable.
- **Removal** (owner-triggered via `provider-profile`/`direct-messaging`, or admin-triggered via `trust-and-safety`'s `ModerationActionTaken{moderation.remove_photo}` subscription): `media-processing.remove(photoId)` deletes the MinIO object(s) + all `photo_variant` rows + the `photo` row in one transaction + `outbox(MediaRemoved{photoId})`. The **CDN copy expires or is purged within ≤ 15 minutes** of removal (SR-MEDIA-04) — a targeted Cloudflare purge for the removed variant URLs is issued via the SSRF-safe outbound wrapper (`shared-kernel.md` §11).
- Removal is idempotent: removing an already-removed `photoId` is a no-op success (natural key).

---

## 7. API contract

Follows `api-conventions.md` (envelope §3, error mapping §3.3, headers §12). Roles declared per route at the hook (security-impl §2).

| Method / path | Role & ownership | Request | Response / errors | Events |
|---|---|---|---|---|
| `POST /api/media/uploads` (upload-init, `bucket='media'`) | `seeker`+/`provider`, owner | multipart image + `{ scope: 'profile_photo' \| 'message_attachment' }` | `202 { photoId, status:'pending' }`; `413 IMAGE_TOO_LARGE`, `409 PHOTO_LIMIT_REACHED` (scope `profile_photo`), `422 IMAGE_UNDECODABLE` (async, surfaced via poll) | `MediaProcessed` (async on ready) |
| `GET /api/media/uploads/:photoId` (status poll) | owner | — | `{ status, variantUrls?, failedReason? }` — lets the client know when processing completes / why it failed | — |
| `DELETE /api/media/:photoId` (facade `media-processing.remove`) | owner, or `trust-and-safety` facade (admin moderation) | — | `204`; `NOT_FOUND` → idempotent no-op | `MediaRemoved` |
| `POST /api/media/identity-docs` (facade `media-processing.submitIdentityDoc`, used by `trust-and-safety`) | `provider`, owner | multipart image + `{ docKind: 'id' \| 'selfie' }` | `{ photoId }` (bucket `identity-docs`, private); `413/422` as above | **none** — identity docs do **not** emit `MediaProcessed` (no profile attach, no discovery) |
| `GET /admin/api/media/identity-docs/:photoId/presign` (facade `media-processing.presignIdentityDoc`) | `admin` (hook floor + `is_admin`) | — | `{ url, expiresAt }` TTL ≤ 5 min; audit-logged `media-processing.identity_doc_presign` | — |

- **`trust-and-safety` calls this module's facade** for identity-doc submission and presign issuance — `trust-and-safety` never touches MinIO (SR-MEDIA-01, §5.2). Error codes `IMAGE_UNDECODABLE`, `IMAGE_TOO_LARGE`, `PHOTO_LIMIT_REACHED` are the `media-processing` rows of event-catalog §5.
- **Idempotency:** upload-init accepts an optional `Idempotency-Key` (api-conventions §5); a retried init with the same key returns the original `photoId` rather than staging a duplicate.

Facade (public `index.ts`): `exportFor(userId)` returns `media`-bucket photo ids + public variant URLs owned by the user — never `identity-docs` binaries (SR-DATA-07; platform-configuration LLD §9).

---

## 8. Domain events published (cite `event-catalog.md` §2)

| Event | v | Trigger | Payload | Subscribers |
|---|---|---|---|---|
| `MediaProcessed` | 1 | pipeline commit (§4h), `bucket='media'` only | `photoId, ownerId, variantUrls` | `provider-profile` (finalize gallery photo → `PhotoAdded`), `discovery-search` (projection refresh if profile photo) |
| `MediaRemoved` | 1 | `media-processing.remove` (§6) | `photoId` | `provider-profile`, `discovery-search` |

- **Identity-docs publish nothing** — they are private, never attached to a profile, never in discovery; the only read path is admin presign (§5.2). This is deliberate: an event carrying an identity-doc `photoId` to general subscribers would widen its blast radius.
- Payloads carry IDs + facts only (`shared-kernel.md` §6.1). `variantUrls` are immutable CDN URLs (safe to carry; no staleness).

---

## 9. Capacity note (SR-MEDIA-05, SR-CAP-01) — restated design input, not a new decision

Design point (SR-CAP-01): **24,000 photos ≈ 12 GB source media, ≈ 30 GB with variants**. MinIO is provisioned for this with **≥ 50 % free headroom** (SR-MEDIA-05) — i.e. ≥ ~60 GB allocated on the 160 GB NVMe (SR-CAP-03), monitored with disk-pressure alerts at 80 % (SR-OBS-03). Media is included in the daily restic off-host backup (SR-AVL-03/04, HLD-DEC-09). Per-photo variant footprint is bounded by the four longest-edge caps (§4f) × two formats; the `archival_2048` cap keeps any single source from ballooning storage. Sharp/worker memory peaks are bounded by the worker's job-concurrency limit (HLD §5 container budget) so the media pipeline stays inside the SR-CAP-02 60 % headroom.

---

## 10. Open questions / assumptions

| # | Item | Assumption taken (so build is unblocked) | Needs alignment with |
|---|---|---|---|
| 10.1 | `provider-profile.getGalleryCount(ownerId)` | **Closed:** named on the provider facade (§5.1a) | — |
| 10.2 | Whether EXIF strip applies to `identity-docs` originals (§5.2) | **Yes** — unconditional per SR-MEDIA-03/D-9; stored otherwise-faithful (no lossy re-encode) so the doc stays legible for review | SRS §7, `trust-and-safety` LLD |
| 10.3 | Cloudflare purge API surface for ≤15 min removal (§6) | Targeted URL purge via SSRF-safe wrapper; if unavailable, rely on a short max-age on removed-object 404s — but immutable keys mean stale reads only affect just-removed photos | HLD-DEC-07, `08` deploy deliverables |
| 10.4 | Message-attachment scope specifics (`direct-messaging` consumes `MediaProcessed`?) | `media-processing` emits `MediaProcessed` for all `media`-bucket photos; `direct-messaging` associates its attachments by `photoId` in its own tables (subscriber no-op for non-message photos) | `05-direct-messaging` LLD |
| 10.5 | JPEG-fallback selection mechanism at delivery (§4f) | `<picture>` with WebP `source` + JPEG fallback, or `Accept` negotiation at Caddy | `06-ui-ux-design`, HLD-DEC-07 |

**Assumptions of record:** the count-limit is enforced at the `media-processing` boundary on `provider-profile`'s behalf but *owned* by `provider-profile` (§4a); identity-docs never enter the public variant pipeline and never emit domain events (§5.2, §8); immutable content-hashed keys make CDN invalidation unnecessary for changes (§6).
