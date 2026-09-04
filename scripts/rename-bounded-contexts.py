#!/usr/bin/env python3
"""Rename peach-finder bounded-context identifiers to extractable service names.

Context (kebab-case)  → future {context}-service
Postgres schema       → snake_case of the context
Module path           → src/lib/server/modules/{context}/

Does not rename FRS/SRS/US IDs, English prose, MinIO bucket `media`,
or payload field names such as providerProfileId.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path("/home/coach/code/peach-finder")
DOC = ROOT / "documentation"

# old short → (kebab context, snake schema)
CONTEXTS: list[tuple[str, str, str]] = [
    ("identity", "identity-and-access", "identity_and_access"),
    ("provider", "provider-profile", "provider_profile"),
    ("availability", "provider-availability", "provider_availability"),
    ("discovery", "discovery-search", "discovery_search"),
    ("messaging", "direct-messaging", "direct_messaging"),
    ("reviews", "provider-reviews", "provider_reviews"),
    ("trust", "trust-and-safety", "trust_and_safety"),
    ("billing", "listing-billing", "listing_billing"),
    ("analytics", "provider-analytics", "provider_analytics"),
    ("notifications", "user-notifications", "user_notifications"),
    ("media", "media-processing", "media_processing"),
    ("platform", "platform-configuration", "platform_configuration"),
]

# Already-compound path fragments that must be rewritten before shorts,
# otherwise `trust` inside `trust-safety` becomes `trust-and-safety-safety`.
COMPOUND_PATHS: list[tuple[str, str]] = [
    ("trust-safety", "trust-and-safety"),
    ("13-platform-config", "13-platform-configuration"),
]

FOLDER_MOVES: list[tuple[str, str]] = [
    ("documentation/05-low-level-design/01-identity", "documentation/05-low-level-design/01-identity-and-access"),
    ("documentation/05-low-level-design/03-availability", "documentation/05-low-level-design/03-provider-availability"),
    ("documentation/05-low-level-design/05-messaging", "documentation/05-low-level-design/05-direct-messaging"),
    ("documentation/05-low-level-design/06-reviews", "documentation/05-low-level-design/06-provider-reviews"),
    ("documentation/05-low-level-design/07-trust-safety", "documentation/05-low-level-design/07-trust-and-safety"),
    ("documentation/05-low-level-design/09-billing", "documentation/05-low-level-design/09-listing-billing"),
    ("documentation/05-low-level-design/10-analytics", "documentation/05-low-level-design/10-provider-analytics"),
    ("documentation/05-low-level-design/11-notifications", "documentation/05-low-level-design/11-user-notifications"),
    ("documentation/05-low-level-design/12-media", "documentation/05-low-level-design/12-media-processing"),
    ("documentation/05-low-level-design/13-platform-config", "documentation/05-low-level-design/13-platform-configuration"),
]

FILE_MOVES: list[tuple[str, str]] = [
    ("identity-lld.md", "identity-and-access-lld.md"),
    ("availability-lld.md", "provider-availability-lld.md"),
    ("messaging-lld.md", "direct-messaging-lld.md"),
    ("reviews-lld.md", "provider-reviews-lld.md"),
    ("trust-safety-lld.md", "trust-and-safety-lld.md"),
    ("billing-lld.md", "listing-billing-lld.md"),
    ("analytics-lld.md", "provider-analytics-lld.md"),
    ("notifications-lld.md", "user-notifications-lld.md"),
    ("media-lld.md", "media-processing-lld.md"),
    ("platform-config-lld.md", "platform-configuration-lld.md"),
]

# Tokens that must never be rewritten (buckets, badges, English compounds, verification audit actions).
PROTECT = [
    "identity-docs",
    "identity_docs",
    "identity_verified",
    "identity-verified",
    "IdentityVerified",
    "badge_identity_verified",
    "identity_outcome",
    "getIdentityQueueStats",
    "IdentityAttributesChanged",
    "IdentityAttributes",
    "identity.approve",
    "identity.reject",
    "identity.revoke",
]

# Role-as-provider (not the provider-profile module) — restored after backtick/cell replace.
ROLE_PROTECT = [
    ("`seeker`+/`provider`", "ROLE_SEEKER_PLUS_PROVIDER"),
    ("`seeker`/`provider`", "ROLE_SEEKER_SLASH_PROVIDER"),
    ("`provider` viewing", "ROLE_PROVIDER_VIEWING"),
    ("`provider` + ownership", "ROLE_PROVIDER_PLUS_OWN"),
    ("`provider`, owner", "ROLE_PROVIDER_COMMA_OWNER"),
    ("`provider` is a presence-based", "ROLE_PROVIDER_PRESENCE"),
    ("**`provider`** — a **presence-based", "ROLE_PROVIDER_BULLET"),
    ("`provider` iff a", "ROLE_PROVIDER_IFF"),
    ("| provider | `{", "| ROLE_CELL_PROVIDER | `{"),
    ("seeker \\| provider", "ROLE_SEEKER_OR_PROVIDER"),
    ("requiredRole = 'provider'", "ROLE_REQUIRED_PROVIDER"),
]

LAYOUT_OLD = """        identity/        provider/       availability/   discovery/
        messaging/       reviews/        trust/          billing/
        analytics/       notifications/  media/          platform/"""

LAYOUT_NEW = """        identity-and-access/  provider-profile/  provider-availability/  discovery-search/
        direct-messaging/     provider-reviews/  trust-and-safety/       listing-billing/
        provider-analytics/   user-notifications/ media-processing/     platform-configuration/"""

# MinIO public bucket stays `media` — protect the exact bucket spelling in SQL/policy.
MEDIA_BUCKET_PROTECT = "MINIO_PUBLIC_BUCKET_MEDIA"

SQL_RELATIONS: dict[str, tuple[str, ...]] = {
    "identity": (
        '"user"',
        "user",
        "session",
        "oauth_link",
        "email_verification_token",
        "phone_otp",
        "password_reset_token",
        "admin_totp",
        "phone_registry_history",
        "phoneRegistryHistory",
    ),
    "provider": (
        "service_tag",
        "service_tag_proposal",
        "provider_profile",
        "service",
        "provider_service_tag",
        "language",
        "provider_language",
        "provider_photo",
        "publish_state",
        "unpublish_reason",
        "photo_status",
        "proposal_status",
    ),
    "availability": (
        "availability_status",
        "availability_history",
        "state",
        "history_event",
    ),
    "discovery": ("search_projection", "blocked_pair", "suggest_term"),
    "messaging": (
        "thread",
        "message",
        "presence",
        "response_time_stat",
        "block_cache",
    ),
    "reviews": ("review", "rating_aggregate"),
    "trust": (
        "verification_case",
        "badge_state",
        "report",
        "moderation_action",
        "block",
        "processed_admin_action",
    ),
    "billing": (
        "subscription",
        "featuring_addon",
        "invoice",
        "processed_webhooks",
        "line_item",
    ),
    "analytics": ("raw_event", "hourly_rollup", "dashboard_metric_cache"),
    "notifications": (
        "notification_preference",
        "notification_log",
        "notification_batch_window",
        "push_subscription",
        "block_cache",
    ),
    "media": ("photo", "photo_variant", "bucket", "photo_status", "variant_kind"),
    "platform": ("area", "config", "lexicon_entry"),
}

CONFIG_KEYS: tuple[str, ...] = (
    "billing.trial_period_days",
    "billing.grace_period_days",
    "billing.listing_price_cents",
    "billing.featuring_price_cents",
    "billing.dunning_offset_days",
    "availability.expiry_minutes",
    "availability.reminder_lead_minutes",
    "availability.active_week_window_days",
    "reviews.highly_rated_min_average",
    "reviews.highly_rated_min_reviews",
    "messaging.response_time_window_days",
    "notifications.batch_window_minutes",
    "notifications.email_unread_delay_minutes",
    "platform.operating_timezone",
    "platform.safety_info_html",
)

SKIP_DIRS = {".git", "node_modules", ".impeccable", ".claude-flow"}


def protect(text: str) -> tuple[str, dict[str, str]]:
    tokens: dict[str, str] = {}
    out = text
    for i, p in enumerate(PROTECT):
        key = f"__PF_PROTECT_{i}__"
        tokens[key] = p
        out = out.replace(p, key)
    for src, key in ROLE_PROTECT:
        out = out.replace(src, key)
        tokens[key] = src
    out = out.replace("bucket='media'", f"bucket='{MEDIA_BUCKET_PROTECT}'")
    out = out.replace('bucket="media"', f'bucket="{MEDIA_BUCKET_PROTECT}"')
    out = out.replace("bucket `media`", f"bucket `{MEDIA_BUCKET_PROTECT}`")
    out = out.replace("two-bucket policy (public `media`", f"two-bucket policy (public `{MEDIA_BUCKET_PROTECT}`")
    out = out.replace("Two MinIO buckets: `media`", f"Two MinIO buckets: `{MEDIA_BUCKET_PROTECT}`")
    out = out.replace("public `media` vs", f"public `{MEDIA_BUCKET_PROTECT}` vs")
    out = out.replace("`media` bucket", f"`{MEDIA_BUCKET_PROTECT}` bucket")
    out = out.replace("`media`-bucket", f"`{MEDIA_BUCKET_PROTECT}`-bucket")
    out = out.replace("MinIO's `media` bucket", f"MinIO's `{MEDIA_BUCKET_PROTECT}` bucket")
    out = out.replace("into `media` bucket", f"into `{MEDIA_BUCKET_PROTECT}` bucket")
    out = out.replace("enum ('media'", f"enum ('{MEDIA_BUCKET_PROTECT}'")
    out = out.replace("a `media` row", f"a `{MEDIA_BUCKET_PROTECT}` row")
    out = out.replace("all `media`-bucket", f"all `{MEDIA_BUCKET_PROTECT}`-bucket")
    out = out.replace("`media` (public read", f"`{MEDIA_BUCKET_PROTECT}` (public read")
    out = out.replace("`media` (public via", f"`{MEDIA_BUCKET_PROTECT}` (public via")
    out = out.replace("**`media`**", f"**`{MEDIA_BUCKET_PROTECT}`**")
    return out, tokens


def unprotect(text: str, tokens: dict[str, str]) -> str:
    out = text
    out = out.replace(MEDIA_BUCKET_PROTECT, "media")
    for key, val in tokens.items():
        out = out.replace(key, val)
    return out


def replace_module_tokens(text: str) -> str:
    """Replace short context names in module/path/schema positions."""
    by_old = {old: (kebab, snake) for old, kebab, snake in CONTEXTS}

    text = text.replace(LAYOUT_OLD, LAYOUT_NEW)

    for old, new in COMPOUND_PATHS:
        if old != new:
            text = text.replace(old, new)

    folder_num = {
        "01-identity": "01-identity-and-access",
        "03-availability": "03-provider-availability",
        "05-messaging": "05-direct-messaging",
        "06-reviews": "06-provider-reviews",
        "09-billing": "09-listing-billing",
        "10-analytics": "10-provider-analytics",
        "11-notifications": "11-user-notifications",
        "12-media": "12-media-processing",
    }
    for old, new in folder_num.items():
        text = text.replace(old, new)

    for fname_old, fname_new in FILE_MOVES:
        text = text.replace(fname_old, fname_new)

    for key in sorted(CONFIG_KEYS, key=len, reverse=True):
        old_ns, rest = key.split(".", 1)
        kebab, _snake = by_old[old_ns]
        text = text.replace(key, f"{kebab}.{rest}")

    for old, kebab, snake in sorted(CONTEXTS, key=lambda t: -len(t[0])):
        for rel in sorted(SQL_RELATIONS.get(old, ()), key=len, reverse=True):
            text = re.sub(
                rf"(?<![\w-]){re.escape(old)}\.{re.escape(rel)}(?![A-Za-z0-9_])",
                f"{snake}.{rel}",
                text,
            )

        text = re.sub(
            rf"(schema if not exists ){re.escape(old)}\b",
            rf"\1{snake}",
            text,
        )
        text = re.sub(
            rf"(create schema if not exists ){re.escape(old)}\b",
            rf"\1{snake}",
            text,
        )
        text = text.replace(f"`{old}.*`", f"`{snake}.*`")
        text = re.sub(
            rf"(Postgres schema )`{re.escape(old)}`",
            rf"\1`{snake}`",
            text,
        )
        text = re.sub(
            rf"(, schema )`{re.escape(old)}`",
            rf"\1`{snake}`",
            text,
        )
        text = re.sub(
            rf"(schema )`{re.escape(old)}`",
            rf"\1`{snake}`",
            text,
        )

        text = re.sub(
            rf"modules/{re.escape(old)}(?![\w-])",
            f"modules/{kebab}",
            text,
        )
        for layer in ("domain", "app", "infra", "index.ts"):
            text = text.replace(f"{old}/{layer}", f"{kebab}/{layer}")

        text = text.replace(f"subscriber='{old}'", f"subscriber='{kebab}'")
        text = text.replace(f"(event_id, '{old}')", f"(event_id, '{kebab}')")
        text = text.replace(
            f"(event_id, subscriber='{old}')",
            f"(event_id, subscriber='{kebab}')",
        )

        text = re.sub(
            rf"(?<![\w-]){re.escape(old)}\.([A-Za-z][A-Za-z0-9_]*)",
            rf"{kebab}.\1",
            text,
        )

        text = re.sub(rf"`{re.escape(old)}`", f"`{kebab}`", text)
        text = text.replace(f" | {old} | ", f" | {kebab} | ")

    return text


def should_skip(path: Path) -> bool:
    if any(part in SKIP_DIRS for part in path.parts):
        return True
    if path.suffix != ".md":
        return True
    if path.name in {"PRODUCT.md", "DESIGN.md"}:
        return True
    rel = str(path.relative_to(ROOT))
    skip_prefixes = (
        "documentation/00-business-requirements",
        "documentation/01-functional-requirements-specification",
        "documentation/02-system-requirements-specification",
        "documentation/03-user-stories",
    )
    return any(rel.startswith(p) for p in skip_prefixes)


def process_file(path: Path, dry_run: bool) -> bool:
    original = path.read_text(encoding="utf-8")
    protected, tokens = protect(original)
    updated = replace_module_tokens(protected)
    updated = unprotect(updated, tokens)
    if updated == original:
        return False
    if not dry_run:
        path.write_text(updated, encoding="utf-8")
    return True


def move_lld_paths(dry_run: bool) -> None:
    import subprocess

    for old, new in FILE_MOVES:
        matches = list(DOC.rglob(old))
        if not matches:
            continue
        src = matches[0]
        dest = src.with_name(new)
        if dest.exists():
            continue
        print(
            f"{'Would git mv file' if dry_run else 'git mv file'} "
            f"{src.relative_to(ROOT)} -> {dest.relative_to(ROOT)}"
        )
        if not dry_run:
            subprocess.run(["git", "mv", str(src), str(dest)], check=True, cwd=ROOT)

    for old, new in FOLDER_MOVES:
        src = ROOT / old
        dest = ROOT / new
        if not src.exists() or dest.exists():
            continue
        print(f"{'Would git mv dir' if dry_run else 'git mv dir'} {old} -> {new}")
        if not dry_run:
            subprocess.run(["git", "mv", str(src), str(dest)], check=True, cwd=ROOT)


def main(dry_run: bool) -> None:
    changed = []
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or should_skip(path):
            continue
        if "scripts/rename-bounded-contexts" in str(path):
            continue
        if process_file(path, dry_run):
            changed.append(str(path.relative_to(ROOT)))
    print(f"{'Would update' if dry_run else 'Updated'} {len(changed)} files")
    for p in changed:
        print(f"  {p}")
    move_lld_paths(dry_run)


if __name__ == "__main__":
    import sys

    main(dry_run="--apply" not in sys.argv)
