# Luma-IQ — AI Agent UI Contract (Read First)

This file is the single source of truth for UI consistency in Luma-IQ.  
Any AI agent or human modifying UI must follow these rules strictly.

---

## Brand
- **Product name:** Luma-IQ  
- **Slogan:** *“Your deals. In focus.”*  
- **Tone:** concise, confident, and professional. No fluff.

---

## Non-Negotiables (Do NOT violate these)
1. **No one-off styling in pages or widgets.**
   - Do **not** use raw Tailwind typography or spacing classes in page components (e.g., `text-sm`, `text-3xl`, `p-5`, `mb-3`, `rounded-xl`, etc.).
   - All typography, spacing, borders, radius, and shadows must come from shared UI primitives.

2. **Use shared UI primitives from `src/ui/*`.**
   - If a pattern does not exist, **add it to `src/ui/` first**, then use it everywhere.
   - Never create ad-hoc styles inside a single page or widget.

3. **Widgets must be standardized.**
   - Every dashboard widget **must** use:
     - `<WidgetCard>` as the outer container  
     - `<WidgetHeader>` for the icon + title + optional subtitle/right slot

4. **Pages must follow the layout shell.**
   - All top-level pages must use `<PageShell>` (or its current equivalent).
   - Page-level layout (padding, max width, spacing) is controlled by `PageShell`, not individual pages.

---

## Typography (Allowed Scale Only)
Use `<Text variant="...">` **exclusively** for text in pages/widgets.

Allowed variants (defined in `src/ui/tokens.ts`):
- `h1` — primary page title
- `h2` — section / widget titles
- `body` — standard paragraph text
- `muted` — secondary labels or small descriptions
- `micro` — very small labels (timestamps, badges, etc.)

🚫 **Forbidden in pages/widgets:** `text-*`, `tracking-*`, `leading-*`

---

## Spacing, Radius, Borders, Shadows
Use tokens from `src/ui/tokens.ts` only:

- Padding:
  - `ui.pad.page` — page wrapper
  - `ui.pad.card` — standard card
  - `ui.pad.cardTight` — compact card

- Radius:
  - `ui.radius.card`
  - `ui.radius.control`
  - `ui.radius.pill`

- Borders:
  - `ui.border.card`
  - `ui.border.subtle`

- Shadows:
  - `ui.shadow.card`
  - `ui.shadow.hero`

🚫 **Forbidden in pages/widgets:** `p-*`, `m-*`, `rounded-*`, `shadow-*`

---

## Widgets (Dashboard)
All dashboard widgets **must** follow this structure:

```tsx
<WidgetCard>
  <WidgetHeader
    icon={...}
    title="Widget Title"
    subtitle="Optional subtitle"
    right={OptionalRightSlot}
  />
  {/* Widget body */}
</WidgetCard>
