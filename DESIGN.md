---
name: peach-finder
description: Find and message a trustworthy, available massage therapist near you, fast.
colors:
  peach: "#E8794F"
  peach-deep: "#B34625"
  pine: "#2F5D50"
  pine-deep: "#1E3A32"
  blush: "#F6E4D8"
  cream: "#FBF7F2"
  paper: "#FFFCF9"
  ink: "#2B2622"
  stone: "#6E6459"
  divider: "#C9BDAE"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(2.25rem, 5vw, 3.5rem)"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.75rem"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "normal"
  title:
    fontFamily: "Plus Jakarta Sans, -apple-system, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Plus Jakarta Sans, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Plus Jakarta Sans, -apple-system, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.02em"
rounded:
  sm: "8px"
  md: "14px"
  lg: "20px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.peach-deep}"
    textColor: "{colors.paper}"
    typography: "{typography.title}"
    rounded: "{rounded.pill}"
    padding: "14px 28px"
  button-primary-hover:
    backgroundColor: "#9C3A1D"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.pine}"
    typography: "{typography.title}"
    rounded: "{rounded.pill}"
    padding: "13px 27px"
  chip-filter:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  chip-filter-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  badge-available:
    backgroundColor: "{colors.blush}"
    textColor: "{colors.peach-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  badge-verified:
    backgroundColor: "{colors.blush}"
    textColor: "{colors.pine}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
---

# Design System: peach-finder

## 1. Overview

**Creative North Star: "The Trusted Concierge"**

peach-finder should feel like a warm, capable person who already vetted this therapist for you, not a directory of contractors and not a clinical booking portal. The system is built around one idea: trust and warmth are not decoration, they are the interface. Every screen leads with a real photo, a real name, a visible verification signal, and a visible "available now" state, before it asks the seeker to do any work.

This explicitly rejects cold enterprise SaaS defaults (navy-and-gray dashboards, hero-metric tiles, identical icon-cards), clinical white-and-teal medical portal styling, dense spreadsheet-style directory listings, and anything moody or overly intimate in photography or tone. This is a wellness services marketplace; it must read unambiguously as licensed, professional, and safe on every screen, never adjacent to anything else.

**Key Characteristics:**
- Warm cream and paper surfaces, never stark white, never cold gray.
- One confident peach-terracotta accent for action and availability; a deep pine green carries trust and verification, used with equal deliberateness.
- Large, real photography with generous whitespace around it; nothing is reduced to a data row.
- Soft, pill-shaped, human-scaled components. No sharp enterprise rectangles.
- Calm at rest, warm on interaction. Motion is a response, not a performance.

## 2. Colors

Full palette with four deliberate roles, built on warm-tinted neutrals so nothing ever reads stark or clinical.

### Primary
- **Ripe Peach** (`#E8794F`): decorative accent only, large surfaces, illustration, low-opacity fills, gradients behind hero art. Never used for small text or icons; its contrast against Cream is below the 3:1 floor for meaningful UI.
- **Terracotta Deep** (`#B34625`): the working primary. Primary buttons, the "available now" indicator dot, focus rings, links inside accent surfaces. Verified at 5.15:1 on Paper and 5.38:1 on Cream, comfortably clearing AA text contrast.

### Secondary
- **Verified Pine** (`#2F5D50`): trust and verification. The verified badge, secondary buttons, and any link or icon carrying a "we checked this" meaning. 7.03:1 on Cream.
- **Pine Deep** (`#1E3A32`): hover/active state for Pine elements. 12.0:1 on Paper.

### Tertiary
- **Blush Sand** (`#F6E4D8`): soft highlight surface for badge backgrounds and hover backgrounds on cards and secondary buttons. Selected chips invert to Ink (see §5), not Blush. Never carries text directly except the badge label colors defined above.

### Neutral
- **Ink Clay** (`#2B2622`): primary text. 14.0:1 on Cream. Warm near-black, never pure `#000`.
- **Warm Stone** (`#6E6459`): secondary text and every functional UI border (input outlines, card outlines) that must convey a boundary. 5.4:1 on Cream, clears both the 4.5:1 text floor and the 3:1 non-text floor.
- **Oat Divider** (`#C9BDAE`): decorative section dividers only (paired with spacing, never load-bearing alone for structure).
- **Cloud Linen** (`#FBF7F2`): page background. Warm cream, never `#fff`.
- **Warm Paper** (`#FFFCF9`): elevated surface background (cards, sheets, input fields), one step lighter than Cloud Linen so surfaces read as gently lifted without a shadow.

### Named Rules
**The Two-Hue Rule.** Only two hues ever carry meaning: Terracotta (action, availability, urgency) and Pine (trust, verification, safety). If a third meaningful hue is needed, that is a sign the screen is trying to say too much at once.

**The Never-Color-Alone Rule.** Availability and verification are never conveyed by color alone. The available-now dot always ships with the word "Available" or a time string; the identity-verified badge always ships with a checkmark glyph and the words "Identity verified" (FR-TRUST-01).

## 3. Typography

**Display Font:** Fraunces (with Georgia, serif fallback)
**Body Font:** Plus Jakarta Sans (with -apple-system, sans-serif fallback)

**Character:** Fraunces brings a soft, warm, slightly editorial serif character to headlines, hospitality and wellness rather than fintech or dev-tool. Plus Jakarta Sans is geometric-humanist with a friendly, rounded terminal, built for legibility at small sizes on a phone screen. Neither is the default "Inter everywhere" SaaS choice.

### Hierarchy
- **Display** (500, `clamp(2.25rem, 5vw, 3.5rem)`, 1.05): hero headlines only, one per screen. "Find a massage therapist near you, right now."
- **Headline** (500, 1.75rem, 1.15): section headers, therapist name on the profile page.
- **Title** (600, 1.125rem, 1.3): card titles, therapist name inside a result card, modal and sheet titles.
- **Body** (400, 1rem, 1.55): descriptions, messages, form copy. Capped at 70ch measure.
- **Label** (600, 0.8125rem, 1.2, +0.02em tracking): chips, badges, nav labels, timestamps, metadata.

### Named Rules
**The One-Serif Rule.** Fraunces appears only at Display and Headline sizes. It never appears in body copy, buttons, or UI chrome; those stay in Plus Jakarta Sans so the interface remains fast to scan.

## 4. Elevation

Mostly flat with tonal layering: surfaces separate from each other by moving one step up the Cream → Paper → Blush Sand scale. Cards use a barely-perceptible Ambient rest shadow at idle; stronger Lift-hover and Sheet shadows are reserved as a response to interaction, so the interface stays calm until something is actively lifted.

### Shadow Vocabulary
- **Ambient rest** (`box-shadow: 0 1px 2px rgba(43, 38, 34, 0.06)`): default card separation from the page background, barely perceptible.
- **Lift-hover** (`box-shadow: 0 12px 24px rgba(179, 70, 37, 0.14)`): therapist cards and buttons on hover/focus, warm-tinted (uses Terracotta, not neutral gray) so the lift feels like warmth rising, not a generic drop shadow.
- **Sheet** (`box-shadow: 0 -8px 32px rgba(43, 38, 34, 0.12)`): bottom sheets and modals (message composer, filter sheet) rising over content.

### Named Rules
**The Warm Shadow Rule.** Shadows are tinted toward Terracotta or Ink, never neutral gray. A gray shadow on a warm-cream surface is the fastest way to make this look like a generic template.

## 5. Components

### Buttons
- **Shape:** full pill (999px radius). Never a sharp rectangle; this is a consumer product, not a dashboard.
- **Primary:** Terracotta Deep background, Warm Paper text, 14px/28px padding, Title-scale weight. Used once per screen for the single most important action ("Send message", "Search").
- **Secondary:** Warm Paper background, Pine text, 1px Warm Stone border, same shape and padding as primary.
- **Ghost:** transparent background, Ink text, used for tertiary actions inside cards ("View gallery").
- **Hover/Focus:** background shifts to `#9C3A1D` (primary) with Lift-hover shadow; a 2px Terracotta Deep focus ring on keyboard focus, offset 2px, never removed.

### Chips (filter pills)
- **Style:** Warm Paper background, Ink text, 1px Warm Stone border, full pill shape, Label typography.
- **State:** selected chips invert to Ink background with Warm Paper text; never rely on a color shift alone since the shape (filled vs outlined) also changes.

### Cards / Containers
- **Corner Style:** 20px radius (`rounded.lg`) for therapist result cards and the profile hero card; 14px for smaller nested elements (photo thumbnails, message bubbles).
- **Background:** Warm Paper on a Cloud Linen page background.
- **Shadow Strategy:** Ambient rest at idle, Lift-hover on hover/focus/press.
- **Border:** none at rest; cards separate by the Paper/Cream tonal shift, not a stroke.
- **Internal Padding:** 24px (`spacing.lg`) on result and profile cards; 16px on compact list items.

### Inputs / Fields
- **Style:** Warm Paper background, 1px Warm Stone border, 14px radius, Body typography, 16px vertical padding minimum (prevents iOS zoom-on-focus).
- **Focus:** border shifts to Terracotta Deep, 2px, plus a soft Terracotta focus ring; never border-color-only, always paired with the shadow so low-vision users get a second cue.
- **Error / Disabled:** error state uses a dedicated warm red-brown (`#A5432B`) border and helper text below the field, never a color change alone (always includes an inline message). Disabled fields drop to 50% opacity with `cursor: not-allowed`.

### Navigation
- **Mobile (primary surface):** bottom tab bar, Warm Paper background, 3 destinations (Search, Messages, Profile). Favorites is **not** a V1 feature (no FRS requirement). Active tab: Terracotta Deep icon + Label text; inactive: Warm Stone icon + Label text. Always icon + label together, never icon-only, for scanability and accessibility.
- **Desktop:** left-aligned top bar, Cloud Linen background, logo left, search-forward center, avatar/menu right. No sidebar; this product is not a dashboard-density tool.

### Signature Component: Availability Pill
A small pill combining a 6px Terracotta Deep dot (with a slow 2s pulse animation, disabled under `prefers-reduced-motion`) and the Label-weight text "Available now" (never a "back in N min" or other forward-looking prediction — FR-AVAIL-08). Appears top-left of every therapist photo, in cards and on the profile page, so real-time status is visible before anything else on the card.

## 6. Do's and Don'ts

### Do:
- **Do** lead every therapist card and profile with a real photo, first name, availability pill, and verified badge, in that order.
- **Do** use full-pill shapes (999px) for every interactive control; it is the product's signature shape.
- **Do** tint every shadow toward Terracotta or Ink; never a neutral gray drop shadow.
- **Do** pair every color-coded status (available, verified) with an icon and a text label.
- **Do** cap body text measure at 65-75ch and keep Fraunces confined to Display/Headline sizes only.

### Don't:
- **Don't** use navy-and-gray dashboard styling, hero-metric tiles, or identical icon-card grids; this is a cold enterprise SaaS default this product explicitly rejects.
- **Don't** use clinical white-and-teal medical-portal styling; it reads sterile, not caring.
- **Don't** present therapists as dense spreadsheet/directory rows; every person gets a photo-forward card, never a table line.
- **Don't** use moody, dim, or intimate photography, lighting, or copy tone anywhere; every surface must read as licensed wellness services, never adjacent to anything else. This is a trust-and-safety requirement, not a style preference.
- **Don't** use `border-left`/`border-right` as a colored accent stripe on cards or list items.
- **Don't** use gradient text (`background-clip: text`) for emphasis; use weight or the Terracotta Deep color instead.
- **Don't** add a booking calendar or date/time picker anywhere; V1 booking is messaging-only by product constraint.
- **Don't** use Ripe Peach (`#E8794F`) for small text or icons; it fails the 3:1 non-text contrast floor on Cream. Use Terracotta Deep instead.

### Admin console exception
The consumer product is a single warm-light visual world — no dark theme. The **admin console** may invert Ink-on-paper for a thin identity strip (`peach·finder Admin`) so staff can tell the internal surface from the public product at a glance. That strip uses Ink (a neutral), not a third semantic hue. Admin KPI tiles are a denser register, not a seeker-facing pattern; do not copy them onto consumer screens.
