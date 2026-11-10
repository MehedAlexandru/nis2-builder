# Design system

> Shared visual language for the web app, DOCX and PDF exports.
> This tool supports compliance preparation and does not constitute legal advice.

## 1. Token architecture

- **Source of truth for the UI:** CSS custom properties in
  [`apps/web/src/styles/globals.css`](../apps/web/src/styles/globals.css), consumed by Tailwind via
  `hsl(var(--token))`. Values are HSL components (`206 100% 32%`) so opacity modifiers work.
- **Source of truth for exports:** [`packages/shared/src/brand.ts`](../packages/shared/src/brand.ts)
  exposes the same palette as full `hsl(...)` strings, because DOCX/PDF renderers cannot read CSS
  variables.
- A unit test pins `primary-600` to `hsl(206, 100%, 32%)`; Phase 4 adds a token-parity test between
  CSS and the shared palette.

## 2. Primary palette (hue 206)

| Token         | Value                     | Typical use                                                     |
| ------------- | ------------------------- | --------------------------------------------------------------- |
| `primary-50`  | `hsl(206, 100%, 96%)`     | Zebra rows, subtle surfaces, active nav background              |
| `primary-100` | `hsl(206, 100%, 90%)`     | Badges, highlights                                              |
| `primary-200` | `hsl(206, 100%, 80%)`     | Selection, decorative accents                                   |
| `primary-300` | `hsl(206, 95%, 66%)`      | Icons/links on dark surfaces                                    |
| `primary-400` | `hsl(206, 96%, 52%)`      | Hover on dark buttons                                           |
| `primary-500` | `hsl(206, 100%, 42%)`     | Focus ring, charts, gradients; **not** for normal text on white |
| `primary-600` | **`hsl(206, 100%, 32%)`** | Base primary, buttons, table headers, headings                  |
| `primary-700` | `hsl(206, 100%, 25%)`     | Hover/pressed states                                            |
| `primary-800` | `hsl(206, 100%, 19%)`     | Deep surfaces                                                   |
| `primary-900` | `hsl(206, 100%, 14%)`     | Dark callouts, gradients                                        |
| `primary-950` | `hsl(206, 100%, 9%)`      | Text on light primary surfaces                                  |

**Contrast:** white on `primary-600` is ≈6.8:1 (WCAG AA for normal text). `primary-600` on white is
the same ratio. `primary-500` on white is ≈4.45:1 — acceptable only for large text or non-text UI.
In dark mode, interactive text/icons use `primary-300`/`primary-500` on dark surfaces; the SPA
re-maps `--primary` to `206 95% 66%` for text.

## 3. Semantic colors

| Role          | Token           | Value                | Use                                            |
| ------------- | --------------- | -------------------- | ---------------------------------------------- |
| Success       | `success-600`   | `hsl(152, 60%, 35%)` | Complete, healthy, low severity                |
| Warning       | `warning-500`   | `hsl(38, 95%, 48%)`  | Attention, medium severity, progress start     |
| Danger        | `danger-600`    | `hsl(355, 75%, 48%)` | Errors, destructive actions, critical severity |
| Accent        | `accent-600`    | `hsl(176, 70%, 36%)` | Secondary emphasis, links in dense tables      |
| High severity | `severity-high` | `hsl(24, 90%, 50%)`  | Distinct orange between medium and critical    |

Severity badges use fixed colors in every surface:

| Severity | Color                | UI class             |
| -------- | -------------------- | -------------------- |
| Low      | `hsl(152, 60%, 35%)` | `.severity-low`      |
| Medium   | `hsl(38, 95%, 48%)`  | `.severity-medium`   |
| High     | `hsl(24, 90%, 50%)`  | `.severity-high`     |
| Critical | `hsl(355, 75%, 48%)` | `.severity-critical` |

## 4. Neutrals

Tinted with hue 206 at low saturation, from `neutral-50` (`206 20% 98%`) to `neutral-950`
(`206 20% 9%`). Surface tokens:

- Light: background `206 20% 98%`, card white, border `206 14% 87%`, muted `206 16% 94%`.
- Dark: background `206 20% 9%`, card `206 18% 12%`, border `206 14% 22%`, muted `206 16% 18%`.

Dark mode is class-based (`.dark` on `<html>`), persisted in `localStorage`, with a pre-paint script
in `index.html` to avoid a flash.

## 5. Typography and spacing

- Preferred face: **Inter**, falling back to the system UI stack. No external font request, so no
  third-party dependency or FOUT/FOIT.
- Base body 16px, UI text 14px, small/metadata 12px. Headings use tight tracking.
- Line height: 1.5–1.7 for body copy; tables compact.
- Spacing follows Tailwind's 4px scale; page container max-width 1280px with 24px gutters.
- Radius: 8px (`--radius`), cards 12px, pills fully rounded.

## 6. Components

- **Buttons:** primary, secondary, outline, ghost, danger; sizes sm/md/lg/icon. Focus ring uses
  `ring` + offset for visibility on any surface.
- **Badges:** neutral/primary/success/warning/danger plus the fixed severity badge.
- **Progress:** label + value, `role="progressbar"` with ARIA values, gradient
  `warning-500 → primary-500 → success-600`.
- **Cards:** 12px radius, subtle border/shadow, no nested card shadows.
- **Forms:** labels always visible (no placeholder-only fields), inline help, error text tied via
  `aria-describedby` (Phase 3 form engine).

## 7. Export parity

| UI token               | DOCX                                                  | PDF/HTML                              |
| ---------------------- | ----------------------------------------------------- | ------------------------------------- |
| `primary-600` headings | `Heading 1–3` style, color `005A9E`-equivalent        | `<h1>–<h3>` with `--primary-600`      |
| Table header           | primary-600 fill, white bold text                     | `<thead>` with primary-600 background |
| Zebra rows             | primary-50 fill                                       | `tbody tr:nth-child(even)` primary-50 |
| Callout info           | light primary-50 box, primary-700 border              | `.callout-info`                       |
| Callout warning        | warning-50 box, warning-700 border                    | `.callout-warning`                    |
| Callout critical       | danger-50 box, danger-700 border                      | `.callout-critical`                   |
| Risk heat map          | color-coded cells (success → warning → high → danger) | same classes                          |
| Signature block        | bordered table, approval metadata                     | same structure                        |

The exact hex values are derived from the HSL tokens at render time; the DOCX renderer converts HSL
to RGB because Word does not understand CSS colors.

## 8. Accessibility (WCAG 2.2 AA target)

- Semantic landmarks (`header`, `nav`, `main`, `footer`), skip link, one `h1` per page.
- Visible focus rings on every interactive element; no focus traps.
- Keyboard support for dialogs, menus and the future React Flow canvas (Phase 5).
- ARIA labels on icon-only buttons; `aria-pressed` on toggles; `role="progressbar"` with values.
- Reduced-motion media query disables animations.
- Colour is never the only signal: severity badges include text, status includes an icon/label.
- Both locales are tested; Romanian diacritics are supported by the system font stack.
- Phase 9 adds automated axe checks in Playwright; Phase 3 adds per-form accessibility checks.

## 9. Internationalisation and formatting

- `react-i18next` with bundled `en` and `ro` resources; fallback `en`.
- Language is detected from `localStorage` (`nis2-locale`) then `navigator`, and reflected in
  `<html lang>`.
- Dates, numbers, percentages and EUR amounts use `Intl` with `en-GB` / `ro-RO`.
- No string concatenation for grammar-sensitive text; use interpolation/plurals.
- Every new UI string must land in both locale files in the same PR.

## 10. Adding a token

1. Add the HSL component variable to `:root` and, if needed, `.dark`.
2. Map it in `tailwind.config.ts`.
3. Mirror it in `packages/shared/src/brand.ts` if it is used in exports.
4. Document its intended use and contrast constraints here.
5. Add/extend the token test and, for interactive colors, verify contrast.
