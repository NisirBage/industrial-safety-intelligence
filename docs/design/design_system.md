# Industrial Design System

The single reference for the token layer and component conventions
introduced in the M19 "Industrial Design System" milestone. Every
value documented here is read directly from `frontend/src/index.css`
at the time this was written - if a value ever drifts, this document
is wrong and `index.css` is right; re-verify by grep rather than
trusting stale prose.

This is presentation-layer documentation only. It changes how the
platform looks, never what it computes - nothing here touches
`src/domain/`, and every number displayed anywhere in the frontend
still comes from an existing REST endpoint.

---

## Color tokens

Colors were already tokenized before this milestone (`--text`,
`--bg`, `--surface`, `--border`, the four `--tier-*` colors,
`--error`). This milestone added:

| Token | Light value | Dark value | Purpose |
|---|---|---|---|
| `--surface-raised` | `#ffffff` | `#232937` | A surface one step "above" `--surface` (currently identical to it in light mode; exists so a future elevated panel has somewhere to diverge from without a new token). |
| `--border-strong` | `#c3cdd8` | `#3a4354` | A more visible border than `--border`, for emphasis without a full color change. |
| `--focus-ring` | `#2f6fed` | `#6d9bff` | The one color every `:focus-visible` outline uses, app-wide. |
| `--tier-watch-text` | `#3a2e00` | `= --tier-watch` | Accessible-contrast text color - see "Accessibility" below. |
| `--tier-elevated-text` | `#b35900` | `= --tier-elevated` | Same. |
| `--tier-normal-text` | `#2e7d32` | `= --tier-normal` | Same. |

**Rule:** `--tier-normal` / `--tier-watch` / `--tier-elevated` /
`--tier-critical` are tuned for use as **fills** (badge backgrounds,
map zone colors, icon strokes). Never use them as `color` on text
directly - use the matching `-text` token instead (see Accessibility).

### Dark theme

A `[data-theme="dark"]` attribute on `<html>`, toggled by
`ThemeToggle` (`frontend/src/components/common/ThemeToggle.tsx`) via
`useTheme` (`frontend/src/hooks/useTheme.ts`), which persists the
user's explicit choice to `localStorage` and defaults to
`prefers-color-scheme` on first visit. Every component already reads
color through a CSS custom property, so no component-level dark-mode
code was needed - only the `:root[data-theme="dark"]` override block
in `index.css`.

---

## Spacing scale

4px base unit. Use these instead of a new `rem`/`px` value in a
padding, margin, or gap declaration:

| Token | Value |
|---|---|
| `--space-1` | `0.25rem` (4px) |
| `--space-2` | `0.5rem` (8px) |
| `--space-3` | `0.75rem` (12px) |
| `--space-4` | `1rem` (16px) - the default `.card` padding |
| `--space-5` | `1.25rem` (20px) |
| `--space-6` | `1.5rem` (24px) |
| `--space-8` | `2rem` (32px) |
| `--space-10` | `2.5rem` (40px) |

This scale was applied to the shared primitives (`.card`, buttons,
tables) during this milestone; many older, page-specific rules still
use a literal `rem` value that happens to match one of these numbers.
That is acceptable - it is not the same as an inconsistent value, and
a full migration of every historical rule was out of scope for this
pass (see "Remaining Technical Debt" in the milestone's final report).

---

## Corner radius scale

Chosen to match the values already dominant in the codebase before
this milestone, not new numbers:

| Token | Value | Used for |
|---|---|---|
| `--radius-sm` | `4px` | Small chips, nav links |
| `--radius-md` | `6px` | Buttons, most small containers (was already the most common radius) |
| `--radius-lg` | `8px` | `.card` and card-like containers (was already the most common "card" radius) |
| `--radius-xl` | `12px` | The hero banner only - one deliberately more-rounded "flagship" element |
| `--radius-pill` | `999px` | Badges, the theme toggle button |

---

## Elevation (shadow) scale

Three levels - resting (no shadow, a `.card`'s default state),
raised (hover), overlay (reserved for future modal/popover use, not
yet consumed by any component):

```css
--shadow-1: 0 1px 2px rgba(31, 36, 48, 0.06);
--shadow-2: 0 4px 14px rgba(31, 36, 48, 0.1);   /* .card hover */
--shadow-3: 0 16px 40px rgba(31, 36, 48, 0.22); /* reserved */
```

---

## Typography scale

```css
--font-size-xs: 0.75rem;   /* badges, timestamps */
--font-size-sm: 0.85rem;   /* table cells, secondary text */
--font-size-base: 1rem;    /* body */
--font-size-md: 1.1rem;    /* .section-heading */
--font-size-lg: 1.5rem;    /* .kpi-value */
--font-size-xl: 2rem;      /* hero numbers */
```

`.section-heading` (uppercase, letter-spaced, bordered underline) is
the standard sub-heading below a page's `<h1>` - introduced in M18.5,
kept as the one pattern every page's major sections should use rather
than an ad-hoc `<h3>`. Card-level headings (a KPI card's own title,
an action card's own label) correctly stay plain `<h3>` - they are a
different semantic level, not a page-section divider.

---

## Motion tokens

```css
--duration-fast: 0.15s;   /* hover states, button feedback */
--duration-base: 0.25s;   /* card expansion, panel fade-in, page transitions */
--duration-slow: 0.6s;    /* camera pan/zoom, legend fade-in */
--ease-standard: ease;
--ease-emphasized: cubic-bezier(0.2, 0.7, 0.3, 1);  /* pop-in, slide-in, zoom */
```

**Animation rules:**

1. Every `transition`/`animation` in `index.css` should reference one
   of the tokens above rather than a new duration.
2. Every animation must be added to the single, centralized
   `@media (prefers-reduced-motion: reduce)` exception block near the
   top of `index.css` - do not create a second scattered block.
3. Only animate `opacity`/`transform` where practical (GPU-cheap,
   layout-safe) - the one exception is `.plant-zone-fill`'s `fill`
   transition, which is a deliberate slow color-shift so a tier change
   reads as a real event rather than a snap.
4. Never use animation to imply data that isn't real - `RiskHistoryChart`'s
   line explicitly disables mount animation (`isAnimationActive={false}`)
   because M8's original requirement ("do not interpolate, do not
   smooth, do not predict") extends to how the chart draws itself, not
   just its data.

---

## Component guidelines

### Cards

`.card` is the one container class every page uses for a bordered,
padded, `--surface`-colored box. `a.card` and `button.card` get a
hover elevation (`--shadow-2` + a 2px lift); plain `<div className="card">`
does not, since it isn't interactive and a hover effect on a
non-clickable element is misleading.

Nest `.card` inside `.card-grid` for a responsive grid of equal-sized
cards (`.kpi-card`, permit-count mini-cards, zone picker cards, action
queue cards all follow this one pattern rather than each inventing
their own grid).

### Buttons

Every `<button>` gets: the shared `transition` (opacity/transform/
background), a `:active` 1px press-down, and a CSS-only "ripple" (a
brief `currentColor` flash at 12% opacity on press - no JS click-
position tracking). Icon-only buttons (`ThemeToggle`, the zone
inspector's close button) must carry an explicit `aria-label`.

### Badges

`.tier-badge` (4 variants: normal/watch/elevated/critical) and
`.impact-badge` (6 variants, qualitative-only per the project's
standing "never fabricate a risk-reduction number" rule) are both
pill-shaped, uppercase, bold. Never rely on color alone - every badge
always renders its own text label alongside the color.

### Tables

`thead th` is uppercase, muted, letter-spaced; `tbody tr:hover` gets a
subtle background tint. This is the one table treatment in the app -
`AuditTimeline` and any future tabular view should use it rather than
inventing a new table style.

### Charts

Three Recharts components (`RiskHistoryChart`, `AgentContributionChart`,
`MiniSparkline`) share: `var(--border)` grid lines, `var(--text-muted)`
axis/tick labels, a `var(--surface)`/`var(--border)`-bordered tooltip.
`RiskHistoryChart` additionally draws three `ReferenceLine`s at the
cited (not proposed) WATCH/ELEVATED/CRITICAL thresholds (40/65/85,
`docs/architecture/integration_readiness.md`) so a glance at the chart
shows tier status, not just a bare score. `MiniSparkline` deliberately
has no axes/tooltip/grid - it is a glance-only trend indicator by
design, not an oversight.

---

## Status colors (tiers and impact levels)

Four tiers (`normal`/`watch`/`elevated`/`critical`) map 1:1 to the
four `--tier-*` colors everywhere in the app - the plant map, badges,
alerts, charts. Six impact levels (`CRITICAL`/`VERY HIGH`/`HIGH`/
`MODERATE`/`LOW`/`INFORMATIONAL`) are a qualitative-only scale used by
Operations Center's Impact Explorer and Action Queue - never a
computed number, per the project's standing constraint that no
endpoint exposes a real per-agent "what if" branch.

---

## Icons

No icon font or SVG icon library - every icon in this app is a small,
hand-drawn inline `<svg>` (plant map worker/permit/equipment/sensor
glyphs, the theme toggle's sun/moon) at a consistent stroke width
(~1.2-1.4) and viewBox convention (`-8 -8 16 16` for a 16x16 icon
centered on origin). Every meaningful icon carries either an SVG
`<title>` (map glyphs) or a button `aria-label` (theme toggle, close
buttons) - `aria-hidden="true"` is used only on icons that are purely
decorative next to their own visible text label.

---

## Accessibility

- **Focus rings:** a single global `:focus-visible { outline: 2px
  solid var(--focus-ring); outline-offset: 2px; }` - keyboard-only, so
  a mouse click never shows a ring a keyboard user didn't ask for.
- **Text contrast:** `--tier-watch` (`#ffc107`), `--tier-elevated`
  (`#ff7f0e`), and `--tier-normal` (`#4caf50`) all fail WCAG AA's
  4.5:1 ratio for small text on a light surface (measured ~1.6:1,
  ~2.5:1, ~2.8:1 respectively) - they were tuned for use as **fills**
  (badges, map colors), not text. Every place these three appear as a
  `color` (not `background`/`border`) instead uses `--tier-watch-text`
  / `--tier-elevated-text` / `--tier-normal-text`, each verified above
  4.5:1 (several above 7:1) in light mode. In dark mode the base tier
  colors are already bright enough against the dark surface to serve
  as both fill and text, so the `-text` tokens simply equal the base
  tier color there. `--tier-critical` (`#d32f2f`) already passes
  ~5.17:1 as text in light mode and needed no separate token.
- **Color is never the only signal:** every tier/impact badge always
  renders its own text label, never color alone.
- **Keyboard navigation:** the plant map's zone shapes are
  `tabIndex={0} role="button"` with `Enter`/`Space` handling, not
  click-only.
- **Reduced motion:** one centralized `@media (prefers-reduced-motion:
  reduce)` block disables every `transition`/`animation` this app
  defines.
- **Responsive:** verified at a 375px mobile viewport with no
  horizontal overflow; existing breakpoints at 640px/800px/900px
  collapse multi-column grids to a single column.

---

## What this milestone deliberately did not do

- **Not a full historical-rule migration.** Hundreds of pre-existing
  CSS rules still use a literal value that happens to match a token
  (e.g. `padding: 1rem` instead of `var(--space-4)`). These are
  visually identical, not inconsistent - they were left as-is rather
  than rewriting the entire 2000+-line stylesheet for a purely
  cosmetic rename with no visual change and real regression risk.
- **Not a new component library.** No new UI framework, no new build
  dependency - every token is plain CSS custom properties, every
  component is the same plain React + hand-written CSS this codebase
  already used.
- **Not a backend change.** Nothing in this document or milestone
  touches `src/domain/`, `src/services/`, or `src/api/` - see the
  milestone's own Architecture Impact Assessment.
