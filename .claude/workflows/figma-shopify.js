export const meta = {
  name: 'figma-shopify',
  description: 'Figma → pixel-verified custom Shopify sections. All sections in parallel, 3 agents per section on the happy path.',
  phases: [
    { title: 'Preflight' },
    { title: 'Brief' },
    { title: 'Assets' },
    { title: 'Build' },
    { title: 'QA' },
    { title: 'Docs' },
  ],
}

// ---------------------------------------------------------------------------
// SPEED DESIGN — v2, rebuilt after the first live runs.
//
// v1 spent ~10 sequential agent spawns per section (brief → name → assets →
// contract → 2 devs → harness → compile-gate → 2 QA → triage → scribe) plus a
// two-team retry system. The header section cost ~380k tokens / 17 min and
// never shipped. Measured causes, in order:
//   1. Spawn overhead × sequential depth. Every hop re-serializes the Brief.
//   2. The 2-dev split existed to parallelize a 3-minute build, but created
//      contract-mismatch defects that cost 5+ minute QA rounds to find.
//   3. All QA screenshots fought over ONE Chrome window (the extension can't
//      hold two widths at once), so lanes serialized exactly where it hurt.
//
// v2: one dev owns all files and self-checks compile before returning; one QA
// agent per round; screenshots via Chrome DevTools MCP (each lane gets its own
// page + emulated viewport → true parallelism; the user sanctions DevTools as
// a read-only testing instrument — store actions stay on the extension).
// Happy path per section: brief → assets → dev → qa = 3-4 spawns.
// The 0.5% pixel threshold is untouched. Speed comes from structure, not from
// weakening verification. NEVER tune the threshold to make a section pass.
// ---------------------------------------------------------------------------

const MAX_ROUNDS = 4 // one team, precise defects, then escalate to the human

// A section passes ONLY on the QA agent's structured verdict field. v1 also
// accepted /\bPASS\b/ anywhere in prose, and the phrase "hard non-PASS" in a
// FAILING report matched it — the run announced "shipped" for a section that
// did not compile. Prose must never satisfy this check.
const isPass = (v) => /"verdict"\s*:\s*"PASS"/.test(String(v || ''))

const input = typeof args === 'string' ? JSON.parse(args) : args
const cfg = input?.config
if (!cfg) throw new Error('Pass .claude/figma-shopify.json as args.config')

const sections = (input?.sections?.length ? input.sections : cfg.pages.homepage.sections)
const THRESHOLD = cfg.qa.threshold_pct
const DIFF_WIDTHS = cfg.qa.pixel_diff_widths    // [1440, 375] — the only widths with a Figma artboard
const SANITY_WIDTHS = cfg.qa.sanity_only_widths // [1024, 768] — no reference: sanity checks only

// Project rules MUST be interpolated into agent prompts. v1 kept them only in
// the config file and agents never saw them — a rule an agent cannot read is
// not a rule (this exact gap made asset-prep re-upload an image that a quirk
// note said was already in the store).
const PROJECT =
  `\nPROJECT RULES (binding — read before acting):\n${cfg.instructions || ''}\n` +
  (cfg.figma_quirks || []).map((q) => `- ${q}`).join('\n') + '\n'

// Owner's order, verbatim intent. Dev agents on this project were caught
// substituting generic icon-library art for the exported Figma SVGs. The
// owner wants this in their own voice, and it stays aggressive on purpose.
const FIDELITY = `
ICON & ASSET FIDELITY — A DIRECT ORDER FROM THE PROJECT OWNER. READ IT TWICE.
I have already caught dev agents on this project being lazy: typing out a generic icon-library
hamburger from memory instead of using the SVG that was exported from MY Figma file and handed to
them in this very prompt. That is not a shortcut, it is a fabricated deliverable — you rendered
something I never designed.
- If SVG source is provided in this prompt, you paste THAT source. Path data verbatim.
  Not a lookalike. Not "a standard hamburger". Not something from a UI kit.
- If an asset you need is missing from the prompt, you STOP and report it missing.
  Inventing a stand-in is treated exactly like faking a QA pass.
- QA pixel-diffs this section against MY artboard at ${THRESHOLD}%. Your improvised icon WILL fail
  the diff, burn one of this team's ${MAX_ROUNDS} rounds, and the report will name the file you wrote.
This is my design and my store. Build what is in the Figma file — nothing else.
`

// GROUND TRUTH. The owner caught a dev shipping the theme's stock icon-cart.svg instead of the cart
// icon from his Figma file — and a second dev RETYPED the logo path by hand, landing on 21.6217 where
// Figma says 21.6216. Prose orders did not stop either. So the exported SVGs are now written to disk
// as the reference, and `.claude/tools/svg-fidelity.mjs` mechanically compares every path in the
// section against them. There is nothing to argue with: byte-identical, or FAIL.
const GROUND_TRUTH = (name) => `
GROUND TRUTH ON DISK — MANDATORY. Save EVERY vector asset you export to .figma-assets/${name}/<n>.svg,
straight from Figma's own export URL (curl the asset URL to the file — do NOT retype, reformat or
"clean" the path data; a single changed digit is a failure).

SIZE. Figma's vectors are not all small. One Larke icon exports at 248 KB on its own — 6 paths, the
longest 78,000 characters. A dev inlined three of them and the .liquid hit 268 KB, over Shopify's
256 KB template cap; the section stopped compiling and 500'd the WHOLE dev server for all 15 lanes.
So route each asset by weight, and TELL THE DEV which route you chose:

  < 8 KB   -> INLINE. Give the dev the cleaned SVG source to paste into the Liquid. Mono UI icons go
              here; rewrite fill/stroke to currentColor so CSS can recolour them.
  >= 8 KB  -> ASSET FILE. Optimise it and write it to assets/dev-${name}-<icon>.svg:
                npx --yes svgo --multipass -p 2 -i <raw> -o assets/dev-${name}-<icon>.svg
              (svgo cut that 248 KB icon to 50 KB with no visible change.) The dev then references it
              with {{ 'dev-${name}-<icon>.svg' | asset_url }} — the template stays light, and Figma
              itself represents these as <img>, so this matches the design.
              Keep the RAW export in .figma-assets/${name}/ regardless — that is the ground truth.

QA runs: node .claude/tools/svg-fidelity.mjs --section ${name}
It checks BOTH routes: every inline d="..." must appear byte-for-byte in .figma-assets/${name}/, and
every referenced dev-*.svg asset must carry the same path geometry as the Figma export (compared
after an identical svgo pass — so optimising is fine, substituting is not). Referencing a NON dev-*
asset (Horizon's stock icon library) is an automatic failure. A hand-typed, library-copied or
theme-stock icon CANNOT pass. If you export nothing, there is no reference and the section CANNOT
pass — so export everything.
`

// Browser rules for the ONE agent type that touches the store (assets).
const BROWSER = cfg.browser
  ? `\nBROWSER — the main loop already selected device ${cfg.browser.device_id} (logged into the
     ${cfg.store} admin). Do NOT call list_connected_browsers, select_browser or switch_browser —
     you cannot prompt the user and switch_browser times out. Go straight to tabs_context_mcp and
     open your own tab. If the Files "Upload from URL" modal appears busy (another lane may be
     uploading), wait 20s and retry rather than fighting it.\n`
  : ''

// Shared-server reality: ~13 lanes share one `shopify theme dev`. ANY section
// that fails to compile 500s the WHOLE theme for everyone. Policy set by the
// owner: the other lanes WAIT for the owning team — they never fail over it,
// never "help" by editing foreign files, never report it as their own defect.
const SHARED_SERVER = `
SHARED DEV SERVER: ${'`'}127.0.0.1:9292${'`'} serves EVERY lane. A 500 / "Failed to Upload Theme Files"
page means either (a) the server's ~1-minute startup sync, or (b) SOME section does not compile —
the error page names the file. If the named file is YOURS (dev-{your-section}), that is your defect:
fix it now. If it names ANOTHER lane's file, their team is already fixing it — wait and re-check
every 20s for up to 4 minutes. Never edit another lane's files. Only if it persists past that,
report {"verdict":"BLOCKED_BY_OTHER_LANE"} with the error text.
`

// ---------------------------------------------------------------------------
// Preflight — one quick agent, skippable when the caller already verified env.
// ---------------------------------------------------------------------------
phase('Preflight')

if (!input?.skip_preflight) {
  const preflight = await agent(
    `Verify prerequisites. Report only — fix nothing.
     1. curl -sf -o /dev/null -w "%{http_code}" http://127.0.0.1:9292 (a 500 is startup sync — retry up to 90s).
     2. Figma MCP reachable: get_metadata on file ${cfg.figma.file_key}.
     3. node .claude/tools/pixel-diff.mjs prints its usage line (deps installed).
     Return: {"ok": boolean, "failures": ["..."]}`,
    { label: 'preflight', phase: 'Preflight', effort: 'low' },
  )
  if (/"ok"\s*:\s*false/.test(preflight)) {
    log('✋ Preflight failed — stopping before any lane starts.')
    return { stopped: 'preflight', detail: preflight }
  }
}

// ---------------------------------------------------------------------------
// All sections at once. pipeline() = no barriers; each lane runs brief → assets
// → build/qa loop independently. Lane number keys the QA harness template
// (templates/index.qa{lane}.json) so lanes never overwrite each other's.
// ---------------------------------------------------------------------------
const results = await pipeline(
  sections.map((s, i) => ({ ...s, lane: s.lane ?? i + 1 })),

  // --- 1. Design Brief (also names unnamed sections) -----------------------
  async (s) => {
    const brief = await agent(
      `Produce the Design Brief for Figma section "${s.figma_name}".
       File: ${cfg.figma.file_key}. Desktop node: ${s.desktop} (${cfg.figma.canvases.desktop.width}px).
       Mobile node: ${s.mobile} (${cfg.figma.canvases.mobile.width}px).
       Read brand params from the design — never assume a font, container width, or padding.
       The Brief is the BINDING spec one dev will build from and QA will assert against: include the
       full structure, every design token (typography, colors, spacing, radii) as a table with
       desktop AND mobile columns, the image/asset inventory, interactivity, and mobile deltas.
       ${s.name && !s.name.startsWith('TODO')
         ? `The section is named "${s.name}".`
         : `The section has NO meaningful name. Look at the design and choose a descriptive
            kebab-case name (e.g. trust-badges). Put it on the FIRST line of your reply exactly as:
            NAME: <kebab-case-name>`}`,
      { agentType: 'figma-reader', phase: 'Brief', label: `brief:${s.figma_name}` },
    )
    let name = s.name
    if (!name || name.startsWith('TODO')) {
      const m = String(brief).match(/NAME:\s*([a-z0-9-]+)/i)
      name = m ? m[1].toLowerCase() : s.figma_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    }
    return { s: { ...s, name }, brief }
  },

  // --- 2. Assets ------------------------------------------------------------
  // 'svg-inline'  → export vectors as SVG, return cleaned source inline. No store contact.
  // 'none'        → pure text/color section, skip entirely.
  // default       → raster path: reuse from Shopify Files if the IMAGE is already there (match on
  //                 content/dimensions, not filename), else upload via Shopify's "Upload from URL"
  //                 with the raw Figma source URL. The extension's file_upload tool is broken —
  //                 never call it.
  async ({ s, brief }) => {
    if (s.assets_mode === 'none') return { s, brief, assets: 'This section has no image assets.', svgOnly: true }

    const svgOnly = s.assets_mode === 'svg-inline'
    const assets = await agent(
      svgOnly
        ? `Mode: SVG-INLINE — EXPORT ONLY. Section "${s.name}". Every image in this section is vector.
           ${GROUND_TRUTH(s.name)}
           Export each with download_assets defaultFormat "svg". Do NOT rasterise, do NOT upload, do
           NOT touch Shopify, and NEVER return a shopify:// URI — this section has none by design.
           For EACH asset return the FULL cleaned SVG source inline (keep viewBox, drop fixed
           width/height, strip inert Figma wrapper cruft, use currentColor for fill/stroke so CSS can
           recolour). Flag any asset that is NOT actually vector as blocked — never fake it.
           ${PROJECT}
           Design Brief:\n${brief}`
        : `Export and host the images for section "${s.name}". Store: ${cfg.store}. No API token exists.
           ${PROJECT}${GROUND_TRUTH(s.name)}
           REUSE FIRST: search Shopify Files and match on the IMAGE — dimensions and visual content,
           NOT the filename (the same photo may exist under another name or extension). If it is
           there, return its shopify:// URI and upload nothing. A duplicate is a defect.
           UPLOAD (only if genuinely absent): the extension's file_upload tool is BROKEN — do not
           call it. Use Shopify's own "Upload from URL": download_assets returns rawImages[].url —
           public URLs of the ORIGINAL source fills (the raw URL, never the frame render, which has
           text baked in). Files → "Upload from URL" → paste → Add file → then open the file and
           RENAME it (the Name field is editable). Return the shopify:// URI.
           Vector assets in this section (if any) follow the SVG-INLINE rules instead: export as SVG,
           return source inline, no upload.
           If the Brief's image inventory contains NO raster images at all, do not touch Shopify —
           return the literal token NO_RASTER_IMAGES plus any inline SVGs.
           Return a real shopify:// URI for every raster image, or report BLOCKED. Never invent one.
           ${BROWSER}
           Design Brief:\n${brief}`,
      { agentType: svgOnly ? 'general-purpose' : 'asset-prep', phase: 'Assets', label: `assets:${s.name}` },
    )
    return { s, brief, assets, svgOnly }
  },

  // --- Gate: a raster section with no real URI must not build ---------------
  async (ctx) => {
    if (!ctx.svgOnly && !/shopify:\/\/|NO_RASTER_IMAGES/.test(ctx.assets || '')) {
      log(`✋ ${ctx.s.name}: BLOCKED — no shopify:// URI came back from assets. Not building a section that can only fail QA.`)
      return { ...ctx, blocked: 'assets' }
    }
    return ctx
  },

  // --- 3. Build ⇄ QA loop ----------------------------------------------------
  async (ctx) => {
    if (ctx.blocked) return ctx
    const { s } = ctx
    const url = `http://127.0.0.1:9292/?view=qa${s.lane}`
    const qaDir = `.qa-artifacts/dev-${s.name}`
    let verdict = ''
    let defects = ''
    let envWaits = 0 // rounds lost to the environment, not to this section — they cost it nothing

    // ALREADY VERIFIED? Skip it. A run can die at any moment (the Shopify CLI token expired
    // once and blinded all 15 lanes at a stroke). The code survives on disk, but a fresh run
    // restarts every lane at round 1 = "Build" — so a dev would rewrite a section that had
    // already passed at ${THRESHOLD}%, at full token cost and full risk of regression.
    // The ledger is keyed to a hash of the section's files: change them and it re-verifies.
    const prior = await agent(
      `Run exactly this and return its raw JSON output, nothing else:
       node .claude/tools/section-state.mjs get ${s.name}`,
      { agentType: 'general-purpose', phase: 'Build', label: `state:${s.name}`, effort: 'low' },
    )
    if (/"status"\s*:\s*"passed"/.test(prior) && /"verified_current"\s*:\s*true/.test(prior)) {
      log(`⏭ ${s.name}: already passed QA and its files are unchanged — skipping (ledger).`)
      return { ...ctx, verdict: '{"verdict":"PASS","source":"ledger"}', skipped: true }
    }

    for (let round = 1; round <= MAX_ROUNDS; round += 1) {
      // ONE dev owns all of this section's files AND proves it compiles before
      // returning. v1's separate harness + compile-gate agents existed because
      // devs shipped syntax errors that took the whole shared server down for
      // every lane; making the dev verify its own compile closes that window
      // to seconds and saves two spawns per round.
      await agent(
        `${round === 1
            ? `Build the custom Shopify section "dev-${s.name}".\n\n`
              + `         IF sections/dev-${s.name}.liquid ALREADY EXISTS, it is THIS lane's own output from an\n`
              + `         earlier run that was interrupted (a token expiry and a 256 KB section have each killed\n`
              + `         a run mid-flight). Do NOT rewrite it from scratch — read it, check it against the Brief\n`
              + `         below, and fix only what is actually wrong. Some of it was hand-verified against Figma\n`
              + `         and rewriting would throw that away. Starting over is a regression, not a fresh start.`
            : `Fix ONLY the defects listed below in`} the custom Shopify section "dev-${s.name}".

         ${s.overlay ? `THIS IS AN OVERLAY (drawer/modal), not a page section. It is normally hidden and
         opens over the page. Build it so that:
           - it is inert and hidden by default (no layout shift, not focusable, aria-hidden);
           - it opens when something dispatches the event / toggles the attribute the header already
             uses — the header's triggers carry aria-controls="${s.opened_by || s.name}", so your root
             element's id MUST be exactly "${s.opened_by || s.name}";
           - open state is driven by an attribute on the root (e.g. [data-open="true"]) so QA can force
             it open with plain JS;
           - it traps focus while open, closes on Escape, closes on backdrop click, and returns focus
             to the trigger. A drawer you cannot close with the keyboard is a defect.
         FOR QA: the throwaway harness template must render the page with this drawer FORCED OPEN
         (add a tiny inline script in templates/index.qa${s.lane}.json's section settings or a
         data-attribute default) so the pixel diff sees the open state that Figma shows.
         ` : ''}
         JAVASCRIPT — WRAP IT IN AN IIFE. NOT OPTIONAL.
         Shopify serves every section's JS as a CLASSIC script, so all top-level const/let/function
         declarations land in ONE shared global scope with every other section's. This already broke
         the site: four sections each declared \`function init()\`, function declarations overwrite
         each other, and the LAST script to load silently replaced everyone else's — the header ended
         up calling a drawer's init and its buttons did nothing at all. Two sections also declared
         \`const ROOT_SELECTOR\`, which is a hard SyntaxError that stopped a whole file from running.
         Wrap the entire file: \`(function () { ... })();\` — nothing may leak to the global scope.
         You cannot see the other lanes' files, so assume every generic name you pick is already taken.

         QA-ONLY SETTINGS — mark them clearly. If your section needs a setting that exists ONLY so QA
         can test it (e.g. \`open_on_load\` to render a drawer open for the pixel diff), it must default
         to the PRODUCTION value (false) in the schema. The QA harness may turn it on; a real page must
         never inherit it. A drawer that ships open over the hero is not a small bug.

         You own EXACTLY these files — never touch any other lane's files:
           sections/dev-${s.name}.liquid   (structure + {% schema %})
           assets/dev-${s.name}.css        (styles)
           assets/dev-${s.name}.js         (ONLY if the Brief says the section is interactive)
           templates/index.qa${s.lane}.json  (throwaway QA harness: ONLY this section, preset settings,
                                             real shopify:// URIs from the asset report — never invented ones)
         If these files already exist they are THIS lane's earlier output — editing them is your job;
         the project's "never overwrite dev-*" rule is about foreign sections, not your own.

         FIRST read .claude/references/code-standards.md — it is the spec, not a suggestion.
         Schema: do NOT set "class" in {% schema %} — Shopify puts it on the wrapper <section> and it
         will collide with your BEM root's class (duplicate selector = double JS binding; this exact
         bug shipped once already). Liquid: every image_tag argument must be a plain key: value with
         NO unresolved pipe — resolve filter chains to a variable first ({% liquid assign x = a | b %}).
         ${PROJECT}${FIDELITY}
         THE EXPORTS ARE ON DISK: .figma-assets/${s.name}/*.svg — the owner's actual artwork, straight
         from Figma. cat them and paste the path data VERBATIM into your Liquid. Do not retype it, do
         not round a coordinate, do not "tidy" it. QA runs
         \`node .claude/tools/svg-fidelity.mjs --section ${s.name}\` and FAILS you on a single changed
         digit. Run that command yourself before you return — it takes one second and it is the exact
         check that will judge you.
         ${SHARED_SERVER}
         TEMPLATE SIZE — A HARD SHOPIFY LIMIT, NOT A STYLE PREFERENCE. A .liquid over 256 KB is
         REJECTED by Shopify, which fails the whole theme upload and 500s the dev server for EVERY
         other lane. This already happened: a dev inlined three heavy Figma icons and shipped a 268 KB
         section that froze all 15 lanes. Before returning, run:
           wc -c sections/dev-${s.name}.liquid
         If it is over 200,000 bytes, you have inlined artwork that belongs in a file. Move each heavy
         SVG to assets/dev-${s.name}-<icon>.svg (optimise it: npx --yes svgo --multipass -p 2) and
         reference it with {{ 'dev-${s.name}-<icon>.svg' | asset_url }}. Inline only small mono icons.

         BEFORE RETURNING, PROVE YOUR SECTION COMPILES: curl -s "${url}" and confirm the page renders
         with your section's root class in the HTML — not a "Failed to Upload Theme Files" page naming
         your files. If your files are named, fix and re-check until clean. Do not return broken code:
         a non-compiling section blocks every other lane.

         Design Brief (binding):\n${ctx.brief}

         Assets:\n${ctx.assets}
         ${defects ? `\nDefects from QA round ${round - 1} (fix these and ONLY these):\n${defects}` : ''}`,
        { agentType: 'general-purpose', phase: 'Build', label: `dev:${s.name}:r${round}` },
      )

      // ONE QA agent: pixel diff is the verdict; diagnosis only on failure.
      verdict = await agent(
        `QA the rendered section "dev-${s.name}" at ${url} against Figma. You measure — you never edit code.

         STEP 0 — ICON FIDELITY, RUN THIS FIRST, IT IS A HARD GATE:
           node .claude/tools/svg-fidelity.mjs --section ${s.name}
         It proves every vector path the section renders is byte-identical to the Figma export in
         .figma-assets/${s.name}/. If it exits non-zero, the section renders artwork that is NOT in the
         owner's design (a stock theme icon, an icon-library lookalike, or a hand-retyped path). That
         is an automatic FAIL — report each violation verbatim as a defect and do NOT bother with the
         pixel diff this round. A 24x24 wrong icon barely moves a 1440x90 diff, which is exactly why
         this check exists and why you must not treat a low diff % as absolution.
         NEVER edit the section, the exports, or this script to make it pass.

         STEP 0b — TWO CHECKS THAT A TOKEN COMPARISON CANNOT SEE. Both of these shipped undetected
         because QA only compared CSS values against the Brief's table, and the CSS values were RIGHT.
         Run both via evaluate_script and report any failure as a defect:

         (a) FONTS ACTUALLY LOAD. \`font-family: "Test Tiempos Headline", serif\` matches the Brief
             perfectly — and rendered as system Times, because no @font-face for it existed anywhere.
             A matching font-family STRING proves nothing. Prove the glyphs are real:
               - list the document's actual loaded faces: [...document.fonts].map(f => f.family+' '+f.status)
               - for the section's heading and body elements, take the FIRST family in their computed
                 font-family and assert a face with that family is present and status==='loaded'.
             If the first family is absent from document.fonts, the text is silently falling back to a
             system font. That is a DEFECT — report it with the family name and what it fell back to.

         (b) INLINE SVGs ARE NOT DISTORTED. The hero squiggle has viewBox "0 0 51 6" (aspect 8.5:1)
             but was rendered into a 49x3 box (16:1) — squashed to half height. Its d= matched Figma
             byte-for-byte, so the fidelity check passed and the pixel diff barely moved.
             For EVERY inline <svg> in the section: parse its viewBox, compute vbW/vbH, compare with
             the rendered getBoundingClientRect w/h. If the two aspect ratios differ by more than 2%,
             it is being stretched or squashed — report it as a defect with both ratios.

         REFERENCES (cache in ${qaDir}/): if ${qaDir}/ref-<width>.png exists, reuse it. Otherwise
         download the artboard PNG at natural size via the Figma MCP get_screenshot URL
         (desktop node ${s.desktop} → ref-1440.png, mobile node ${s.mobile} → ref-375.png,
         file ${cfg.figma.file_key}) and save it there.

         ⚠ PAGE-IDENTITY GUARD — MANDATORY BEFORE EVERY SINGLE CAPTURE OR MEASUREMENT.
         Many QA agents run at once and SHARE ONE Chrome DevTools connection. select_page sets a
         GLOBAL "current page" for that connection, and take_screenshot / evaluate_script / emulate
         all act on whatever is currently selected. So another lane's agent can steal the selection
         between your calls, and you would happily screenshot ITS section at ITS width and diff it
         against YOUR reference.
         Therefore, immediately before each screenshot and each evaluate_script:
           1. select_page(<your pageId>)
           2. evaluate_script: () => ({url: location.search, w: window.innerWidth})
           3. assert url contains "view=qa${s.lane}" AND w === the width you intend to measure.
         If either is wrong, another agent took the selection — re-select, re-emulate, re-verify, and
         only then capture. NEVER capture without this check passing. A screenshot of the wrong page
         is not a near-miss; it is a fabricated measurement.

         RENDERS — use Chrome DevTools MCP (this is the sanctioned read-only testing instrument;
         never use it to click, submit, or navigate anything but this URL; Playwright and headless
         browsers are forbidden on this project):
           new_page("${url}") — YOUR OWN page, do not select or resize anyone else's;
           emulate viewport width ${DIFF_WIDTHS[0]} (dpr 1) → screenshot the section element
           (take_snapshot → element uid → take_screenshot of that uid, PNG) → ${qaDir}/render-1440.png;
           emulate viewport width ${DIFF_WIDTHS[1]} → same → ${qaDir}/render-375.png.
           If element screenshots are unavailable, take a full-page PNG and crop to the section's
           getBoundingClientRect using a small node script (pngjs is in .claude/tools/node_modules).

         VERDICT: node .claude/tools/pixel-diff.mjs --a <ref> --b <render> --out ${qaDir}/diff-<w>.png
         --threshold ${THRESHOLD}. A size mismatch (e.g. render 375x49 vs ref 375x66) is a FAIL with
         the height/width delta reported as a defect. PASS requires BOTH widths under ${THRESHOLD}%.
         Then sanity-check at ${SANITY_WIDTHS.join(' and ')} (emulate each; assert no horizontal
         scroll, no zero-height section, no console errors) — these widths have NO artboard, NEVER
         pixel-diff them and never invent a reference.

         WIDE-SCREEN SANITY at 1920 — do this too, and do not skip it. Figma's widest artboard is
         1440, so nothing above it is pixel-verified and a whole class of bug hides there. A real one
         already shipped: a hero background sized by a FIXED height (reproducing Figma's image
         transform) covered the section perfectly at 1440 but left 168px white bars at 1920, where
         half of real users are. Emulate 1920 and assert, via evaluate_script:
           - any full-bleed background image/media still COVERS the section (its rendered width >=
             the section's width; no gap between the section edge and the media edge);
           - no horizontal scroll, no console errors.
         Report a failure here as a normal defect. This is not "inventing a reference" — it asserts a
         property (the background covers), never a pixel comparison against a made-up artboard.

         ON FAIL, diagnose so the dev's fix is surgical: read the diff image hotspots, then
         evaluate_script computed styles of the offending elements vs the Brief's token table, and
         name file + property + expected + actual per defect.
         ${SHARED_SERVER}
         Return EXACTLY one JSON object. "verdict":"PASS" requires ALL THREE: svg_fidelity passed,
         BOTH diff widths under ${THRESHOLD}%, and sanity clean.
         {"verdict":"PASS"|"FAIL"|"BLOCKED_BY_OTHER_LANE",
          "svg_fidelity":{"pass":<bool>,"violations":[...]},
          "diff_pct":{"1440":<num>,"375":<num>},
          "sanity":{"1024":"ok|<issue>","768":"ok|<issue>"},
          "defects":[{"file":"...","what":"...","expected":"...","actual":"..."}]}
         Numbers must come from the tools' real output. A fabricated pass is the one unforgivable
         failure in this pipeline.

         Design Brief (token tables):\n${ctx.brief}`,
        { agentType: 'general-purpose', phase: 'QA', label: `qa:${s.name}:r${round}` },
      )

      if (isPass(verdict)) {
        // Record the pass DURABLY, with the real numbers, so no future run rebuilds this.
        await agent(
          `The section "dev-${s.name}" just PASSED QA. Record it in the ledger. Take the real
           diff_pct numbers from this QA report — do not invent or round them:
           ${verdict}
           Run: node .claude/tools/section-state.mjs pass ${s.name} --diff '{"1440":<num>,"375":<num>}'
           Return its raw JSON output. If the tool refuses (e.g. no measured numbers), report that —
           never work around it.`,
          { agentType: 'general-purpose', phase: 'QA', label: `ledger:${s.name}`, effort: 'low' },
        )
        log(`✅ ${s.name}: PASS in round ${round} — recorded in the ledger.`)
        break
      }

      // ENVIRONMENT vs DEFECT. These are not the same thing and must never be confused.
      // The Shopify CLI token expired mid-run once and every lane went blind simultaneously.
      // If that verdict were fed back to a dev as "defects", the dev would spend a round
      // "fixing" code that was never broken — and could easily make it worse. An environment
      // failure costs the lane NOTHING: no round, no defect, no blame. We just wait.
      const envFailure = /BLOCKED_BY_OTHER_LANE|token[^"]*expired|access token|401|ECONNREFUSED|server is down|Failed to Upload Theme Files/i.test(String(verdict))
      if (envFailure) {
        envWaits += 1
        if (envWaits <= 4) {
          log(`⏸ ${s.name}: environment is down (token/server/another lane) — waiting, NOT counting this against the section (wait ${envWaits}/4).`)
          await agent(
            `The dev server is unreachable or the theme is broken by another lane. Do NOT edit any file.
             Poll: curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9292/?view=qa${s.lane}
             every 30s for up to 6 minutes, until it returns 200 AND the body is not a
             "Failed to Upload Theme Files" page and not an expired-token message.
             Return {"recovered": true} the moment it is healthy, or {"recovered": false, "detail": "..."}
             after 6 minutes. If the body says the ACCESS TOKEN IS EXPIRED, say so explicitly —
             only a human can fix that (they must re-run \`shopify theme dev\`).`,
            { agentType: 'general-purpose', phase: 'QA', label: `wait-env:${s.name}:${envWaits}`, effort: 'low' },
          )
          round -= 1 // this round never happened
          continue
        }
        log(`✋ ${s.name}: environment still down after 4 waits — escalating as ENVIRONMENT, not as a section defect.`)
        verdict = `{"verdict":"BLOCKED_BY_ENVIRONMENT","evidence":${JSON.stringify(String(verdict).slice(0, 500))}}`
        break
      }

      log(`↻ ${s.name}: round ${round} failed QA — routing defects back to the dev.`)
      defects = verdict
    }

    return { ...ctx, verdict }
  },

  // --- 4. Per-section result --------------------------------------------------
  async (ctx) => {
    const { s } = ctx
    if (ctx.blocked) return { section: s.name, lane: s.lane, shipped: false, blocked: ctx.blocked }
    const env = String(ctx.verdict).includes('BLOCKED_BY_ENVIRONMENT') || String(ctx.verdict).includes('BLOCKED_BY_OTHER_LANE')
    return {
      section: s.name,
      lane: s.lane,
      shipped: isPass(ctx.verdict),
      skipped: !!ctx.skipped,
      // An environment failure is NOT a verdict on the code. Say so, so nobody reads the
      // summary and concludes the section is broken when the server simply went away.
      blocked: env ? 'environment' : undefined,
      verdict: ctx.verdict,
      figma: { desktop: s.desktop, mobile: s.mobile },
    }
  },
)

const done = results.filter(Boolean)
const shipped = done.filter((r) => r.shipped)
const failed = done.filter((r) => !r.shipped)

// Assemble the REAL homepage from whatever exists. The QA harness shows one section in
// isolation — necessary for a pixel diff, useless for actually looking at the page. This puts
// the built sections into templates/index.json in Figma's running order, reusing each one's
// verified settings (including the shopify:// image URIs) from its harness.
// Sections that are not built yet are simply left out: a homepage that omits a section is
// honest, whereas referencing a section file that does not exist fails the theme upload for
// every lane at once. NEVER put a non-.liquid/.json file in templates/ — a stray .bak there
// took the whole theme down.
await agent(
  `Run: node .claude/tools/assemble-homepage.mjs
   Then confirm the page is actually serving: curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9292/
   (retry for up to 60s — the dev server needs a moment to sync).
   Return the tool's JSON plus the final HTTP code. Do NOT edit any section file.`,
  { agentType: 'general-purpose', phase: 'Docs', label: 'assemble-homepage', effort: 'low' },
)

// One scribe for the whole run. Never documents a failure as shipped.
if (shipped.length) {
  phase('Docs')
  await agent(
    `Document ONLY these shipped, QA-passed sections: ${shipped.map((r) => `dev-${r.section}`).join(', ')}.
     For each: read the ACTUAL files (parse the {% schema %}, grep the CSS vars) — write
     docs/sections/dev-<name>.md and update its row in docs/IMPLEMENTATION.md in place.
     Final QA verdicts:\n${shipped.map((r) => `${r.section}: ${r.verdict}`).join('\n')}
     Do NOT add rows for, or mention as done: ${failed.map((r) => r.section).join(', ') || '(none failed)'}.`,
    { agentType: 'scribe', phase: 'Docs', label: 'docs:all', effort: 'low' },
  )
}

log(`\n${shipped.length}/${done.length} sections shipped.${failed.length ? ` Escalated: ${failed.map((f) => f.section).join(', ')}` : ''}`)
return { shipped: shipped.map((r) => ({ section: r.section, lane: r.lane })), failed }
