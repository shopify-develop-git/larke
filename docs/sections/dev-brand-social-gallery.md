# Brand social gallery → live Instafeed

Runbook for swapping the four hand-picked images in **Brand social gallery** for the live
Instagram feed rendered by **Instafeed – Instagram Feed** (Mintt Studio), without moving a
single pixel of the artboard.

The geometry is not negotiable and is not re-derived here. It is measured in
`assets/dev-brand-social-gallery.css`:

| thing | value | why |
|---|---|---|
| `__inner` | flex row, centred, gap `32px`, padding-inline `64px` | 1440 artboard: 1440 − 2×64 = 1312 inner |
| `__intro` | fixed `327px`, centred, gap `16px` | fixed text column — every lost pixel comes out of the grid |
| `__grid` | flex, `1 1 0`, wrap, gap `2px`, `overflow:hidden`, radius `32px` | the four squares must read as **one rounded slab** |
| `__tile` | `flex: 1 0 0`, `aspect-ratio: 1/1`, `overflow:hidden` | 1440: (953 − 3×2) / 4 = **236.75px** — derived, never hardcoded |
| ≤1400px | `__inner` column; grid `width:100%`, `max-width:953px` | the row stops being viable ~1413px; the cap holds tiles at ~237px |
| ≤768px | padding-inline `0` (full bleed); grid radius `0`; tiles `0 0 calc((100% - 2px)/2)` | 375 artboard: (375 − 2) / 2 = **186.5px** |

Whatever the app renders has to land **inside that slab**. The 2px gutter and the 32px group
radius with `overflow:hidden` are the signature of the design; nothing below is cosmetic.

---

## 1. Why this file exists (and not a JSON edit)

**The app block cannot be hand-written into `templates/index.json`.** An app block's `type` is
not a name you can type — it is a string of the form:

```
shopify://apps/<app-handle>/blocks/<block-handle>/<extension-uuid>
```

That trailing UUID is the app's **theme app extension** id. Only Shopify knows it; it is not in
the app's docs, not in the theme, and not derivable. Guess it and the template silently drops
the block (or the whole section fails to render in the editor).

It has to be added **once, through the theme editor**. After that it is persisted into
`templates/index.json` like any other block and survives theme pulls, commits and deploys — so
this is a one-time manual step, not an ongoing one. Do not spend an hour trying to shortcut it.

The section already declares `@app` in its block list, which is what makes the app show up in
the section's **Add block** menu at all.

---

## 2. Theme editor, step by step

1. **Online Store → Themes → Customize** (do this on the dev/unpublished theme first).
2. Template: **Home page**.
3. Select the **Brand social gallery** section in the left sidebar.
4. **Delete the four `Gallery image` blocks.** If you leave them, the static photos and the live
   feed both render inside the slab and you get 8 tiles, not 4.
5. **Add block → Instafeed** (listed under *Apps*). If it is not there: the app is installed but
   its theme app extension is not enabled — **Apps → Instafeed → Theme editor / Enable** first,
   then reload the customizer.
6. Configure the block (§3), **Save**, then preview.

The text column (heading, ring badge, `@wearelarke` handle) stays on the **section** settings —
the app block only fills the grid.

---

## 3. App settings, and why each one

These names come from the app's documented feature set. **The exact wording in the UI may
differ — match by intent, not by string.**

| Setting | Value | Reason |
|---|---|---|
| Layout / display format | **Grid** | Not slider, not highlight. The artboard is a static 4-across row; a slider adds arrows/dots that have no place in the slab. |
| Columns | **4 desktop / 2 mobile** | Mirrors `__tile` `flex:1 0 0` at ≥769px and the `calc((100% − 2px)/2)` 2-up below 768px. |
| Rows | **1** | The slab is one row tall. |
| Number of posts | **4** | Exactly fills 4 × 1. |
| Spacing / gap | **2px** | `--spacing-sm`. This is the signature — anything larger and the four squares stop reading as one slab. |
| Image shape / ratio | **Square (1:1)** | `aspect-ratio: 1/1`. Portrait/original ratios break the row height and the 32px clip. |
| Rounded corners | **0** | The 32px radius belongs to the **theme**, applied to the whole grid with `overflow:hidden`. Rounding each tile puts four little pills inside a rounded box and destroys the slab. |
| Header / profile row | **OFF** | The section already draws the heading, the gradient ring badge and the handle. Leaving it on duplicates all three. |
| "Follow on Instagram" button | **OFF** | Same reason — the handle is already the link. |
| Caption / likes / hover overlay | **OFF** | Nothing in the artboard sits on top of a tile. |

If a setting is missing or paywalled (free plans commonly lock gap and header toggles), do not
fight the UI — use §4.

---

## 4. Custom CSS fallback

The app exposes a **Custom HTML code** box that accepts `<style>` tags. Documented example:

```html
<style> #insta-feed h2 { font-weight: bold; } </style>
```

Paste the block below into that box, whole. It re-imposes the geometry from **inside** the app's
own scope, for the case where the app's settings can't express a 2px gap or can't hide the
header.

**Why hardcode `2px`, `1/1` and 4-across here specifically:** this CSS is injected into the app
block's scope, which is rendered by the app extension, not by the theme. It cannot see
`--spacing-sm`, `--radius-gallery` or any of the section's custom properties, because those are
declared on `.brand-social-gallery` in the section's inline `<style>` and are only inherited by
DOM the theme itself owns. Referencing them would resolve to nothing and collapse the layout.
Everywhere else in this theme, hardcoding a measurement is a bug; here it is the only correct
option. Values are copied from `assets/dev-brand-social-gallery.css` — if that file changes,
change this too.

```html
<style>
  /* ============================================================
     Instafeed → Brand social gallery slab
     Values hardcoded on purpose: this runs in the app's scope and
     cannot read the theme's custom properties. Source of truth:
     assets/dev-brand-social-gallery.css
     ============================================================ */

  /* #insta-feed is the app's documented container id. Everything below
     is scoped to it so nothing leaks into the rest of the theme. */
  #insta-feed {
    display: block;
    width: 100%;
    margin: 0;
    padding: 0;
    /* Radius stays 0 here — the 32px belongs to .brand-social-gallery__grid,
       which clips this element. Rounding twice fattens the corners. */
    border-radius: 0;
  }

  /* Layout-shift guard: posts are fetched client-side, so before injection
     this element is 0px tall and the page jumps when the feed lands.
     Reserve the row's height. 4-up with 2px gutters: h = (w - 6) / 4,
     i.e. 953 / 236.75 on the artboard ≈ 4/1. Best-effort only — :empty
     stops matching the instant the app inserts its first wrapper. */
  #insta-feed:empty { aspect-ratio: 4 / 1; }
  @media (max-width: 768px) {
    /* 2-up, two rows: h = 2 * ((w - 2) / 2) + 2 = w */
    #insta-feed:empty { aspect-ratio: 1 / 1; }
  }

  /* ---- the row -------------------------------------------------
     UNVERIFIED (structural, but still a guess about tree shape).
     We do not know the app's class names, so we identify the row by
     what it must structurally be: the element holding two or more
     post links. Every Instafeed post links to instagram.com.
       A) flat markup    .row > a > img
       B) wrapped markup .row > .item > a > img
     The :nth-child(2) test means "has at least two posts", which is
     what keeps this from also matching a single item wrapper.
     CHECK AGAINST LIVE DOM: inspect inside #insta-feed and confirm
     which shape it is, then replace with the real class name.
     -------------------------------------------------------------- */
  #insta-feed :where(div, ul, ol, section):has(> a[href*="instagram.com"]:nth-child(2)),
  #insta-feed :where(div, ul, ol, section):has(> :nth-child(2) > a[href*="instagram.com"]) {
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 2px !important;              /* --spacing-sm */
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
    list-style: none !important;
    border-radius: 0 !important;
  }

  /* ---- the tiles -----------------------------------------------
     flex: 1 0 0 (not grid-template-columns: repeat(4, 1fr)) so that a
     short feed still fills the slab: if Instagram returns 3 posts, four
     fixed columns leave a hole in the rounded corner, while 1 0 0 gives
     three wider squares and the slab stays solid. This is exactly what
     .brand-social-gallery__tile does.
     UNVERIFIED: the wrapper selector assumes shape (B) above and is
     written to exclude the row itself (a row has >= 2 post links; an
     item wrapper has one). CHECK AGAINST LIVE DOM.
     -------------------------------------------------------------- */
  #insta-feed :where(div, li, article):has(> a[href*="instagram.com"]):not(:has(> a[href*="instagram.com"]:nth-child(2))),
  #insta-feed a[href*="instagram.com"] {
    flex: 1 0 0 !important;
    min-width: 0 !important;
    width: 100% !important;
    aspect-ratio: 1 / 1 !important;   /* square, both breakpoints */
    height: auto !important;
    overflow: hidden !important;
    border-radius: 0 !important;      /* the 32px is the THEME's, on the group */
    margin: 0 !important;
    padding: 0 !important;
    display: block !important;
  }

  /* Media fills its square. Mirrors .brand-social-gallery__image. */
  #insta-feed img,
  #insta-feed video {
    display: block !important;
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
    border-radius: 0 !important;
  }

  /* ---- 2-up + full bleed below 768 ------------------------------
     375 artboard: (375 - 2) / 2 = 186.5px per tile. Matches the
     ≤768px rule in dev-brand-social-gallery.css. The full bleed and
     the square corners are applied theme-side; nothing to do here. */
  @media (max-width: 768px) {
    #insta-feed :where(div, ul, ol, section):has(> a[href*="instagram.com"]:nth-child(2)) > *,
    #insta-feed :where(div, ul, ol, section):has(> :nth-child(2) > a[href*="instagram.com"]) > * {
      flex: 0 0 calc((100% - 2px) / 2) !important;
    }
  }

  /* ---- kill the duplicated chrome -------------------------------
     UNVERIFIED, and the bluntest thing in this file. The section already
     draws the heading, the ring badge and the @wearelarke handle, so the
     app's header/profile row and follow button must not render. Prefer
     turning them off in the app's settings (§3); this is the fallback for
     plans where that toggle is locked.
     Attribute matching is deliberately loose because the class names are
     unknown. CHECK AGAINST LIVE DOM: confirm none of these accidentally
     match the row wrapper — if the row's own class contains "header" or
     "profile", the whole feed disappears and you must narrow this rule. */
  #insta-feed > header,
  #insta-feed [class*="header" i]:not(:has(a[href*="instagram.com"])),
  #insta-feed [class*="profile" i]:not(:has(a[href*="instagram.com"])),
  #insta-feed [class*="follow" i]:not(:has(a[href*="instagram.com"])),
  #insta-feed [class*="caption" i],
  #insta-feed [class*="powered" i] {
    display: none !important;
  }
</style>
```

The app fires `instafeedAppLoaded` on `document` when rendering finishes — useful if you ever
need to hook measurement or a fade-in. Nothing in this section needs it today (the brief says
*Interactivity: none*), so no JS ships.

---

## 5. Verification checklist

Preview at 1440, then drag the window down through the breakpoints.

- [ ] **Four tiles, all square.** No portrait crops, no letterboxing. At 1440 each is ~236.75px.
- [ ] **Gutters are 2px.** Inspect one, or screenshot and zoom — 4px or 8px reads as four
      separate cards and is the most common failure.
- [ ] **The outer 32px radius clips the corner tiles.** The first and last images must have
      rounded outer corners cut *by the group*; their inner corners stay square. If all four
      tiles are individually rounded, the app's own corner-radius setting is still non-zero.
- [ ] **No duplicate header.** One heading, one ring badge, one `@wearelarke` handle — all from
      the section. No second avatar/username row and no "Follow on Instagram" button.
- [ ] **No layout shift on load.** Watch the section while hard-reloading: the text column must
      not jump. If it does, the `:empty` reservation stopped matching — reserve the height on
      `.brand-social-gallery__grid` theme-side instead.
- [ ] **1400px boundary is continuous.** `__inner` stacks to a column and the grid caps at
      953px; tiles must stay ~237px across the boundary, not balloon.
- [ ] **≤768px: 2-up and full bleed.** Two columns, tiles ~186.5px at 375, grid touching both
      screen edges, square corners (`--radius-gallery-mobile: 0`).
- [ ] **Short feed.** Temporarily set post count to 3 (or wait out a real short feed): three
      wider squares, slab still solid, no empty rounded corner. Then set it back to 4.
- [ ] **Slow/failed fetch.** Throttle to Slow 3G. The section must degrade to text column +
      empty slab, never to a broken half-row or an app error string.
- [ ] Re-check after **Save** on the live theme, not only in the customizer preview — the
      editor injects its own wrappers.

---

## 6. Unverified — read this before trusting anything above

The posts are fetched and injected **client-side**, so the item markup does not exist in the
server HTML and could not be inspected before this was written. Concretely:

1. **Every item-level selector in §4 and any item-level rule added to
   `assets/dev-brand-social-gallery.css` is a guess.** The class names of the row, the item
   wrapper and the tile link are unknown. The selectors are written structurally
   (`a[href*="instagram.com"]`, `:has()`, `:nth-child(2)`) to survive class-name churn, but the
   *tree shape* they assume — one or two levels between the row and the anchor — is still a
   guess.
2. **The header/profile/follow kill rules are the loosest thing here.** They match on
   `[class*="header" i]` and friends. If the app names its row wrapper something containing one
   of those words, the feed vanishes.
3. **The `#insta-feed` id is documented; nothing inside it is.** Only the container id and the
   `instafeedAppLoaded` event come from the app's docs.
4. **Setting names in §3 are from the documented feature set, not from screenshots of the UI.**

**How to close this out.** Publish to the dev theme, load the homepage in a browser, open
DevTools and inspect **inside `#insta-feed`**. Copy the real structure — the row element and its
classes, one full item down to the `<img>` — and report it back. Then the guessed selectors get
replaced with the real ones and the `!important` flags mostly come off. Until that happens,
treat every rule marked `UNVERIFIED` as provisional.
