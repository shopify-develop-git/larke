export const meta = {
  name: 'figma-shopify',
  description: 'Figma → pixel-verified custom Shopify sections. PM-led teams, up to 3 lanes in parallel.',
  phases: [
    { title: 'Preflight' },
    { title: 'Brief' },
    { title: 'Assets' },
    { title: 'Contract' },
    { title: 'Build' },
    { title: 'QA' },
    { title: 'Triage' },
    { title: 'Docs' },
  ],
}

// ---------------------------------------------------------------------------
// TWO DIFFERENT NUMBERS. Do not confuse them — this is the thing everyone trips on.
//
//   CONCURRENT_LANES is WIDTH: how many sections build at the same time.
//   Each lane carries its own full team (PM + 2 devs + 2 QA), so at peak
//   3 teams work in parallel on 3 different sections.
//
//   MAX_ROUNDS / MAX_TEAM_ATTEMPTS are DEPTH: how hard we retry ONE section,
//   sequentially, inside a single lane. Nothing here runs in parallel.
// ---------------------------------------------------------------------------
const CONCURRENT_LANES = 3
const MAX_ROUNDS = 5        // fix rounds per team, on one section
const MAX_TEAM_ATTEMPTS = 2 // a team, then one fresh replacement team, then the human

const cfg = args?.config
if (!cfg) throw new Error('Pass .claude/figma-shopify.json as args.config')

const sections = (args?.sections?.length ? args.sections : cfg.pages.homepage.sections)
const THRESHOLD = cfg.qa.threshold_pct
const DIFF_WIDTHS = cfg.qa.pixel_diff_widths       // [1440, 375] — the only widths with an artboard
const SANITY_WIDTHS = cfg.qa.sanity_only_widths    // [1024, 768] — no reference, sanity only

// ---------------------------------------------------------------------------
// Phase 1 — Preflight. Fail loudly and early, never mid-lane.
// ---------------------------------------------------------------------------
phase('Preflight')

const preflight = await agent(
  `Verify every prerequisite for the figma-shopify workflow. Report PASS/FAIL per item and do NOT
   attempt to fix anything.

   1. Local dev server: curl -sf -o /dev/null http://127.0.0.1:9292 — is it serving?
      If not: the user must run \`shopify theme dev --store ${cfg.store}\`.
   2. Chrome extension connected (tabs_context_mcp) AND the user is logged into
      https://admin.shopify.com/store/${cfg.store} — asset-prep cannot upload without it.
   3. Figma MCP reachable (get_metadata on file ${cfg.figma.file_key}).
   4. cwebp installed (\`which cwebp\`).
   5. .claude/tools/node_modules exists (pixel-diff deps installed).

   Return: {"ok": boolean, "failures": ["..."]}`,
  { label: 'preflight', phase: 'Preflight' },
)

if (/"ok"\s*:\s*false/.test(preflight)) {
  log('✋ Preflight failed — stopping before any lane starts.')
  return { stopped: 'preflight', detail: preflight }
}

// ---------------------------------------------------------------------------
// Lane pipeline. pipeline() (not parallel()) so section B can be in QA while
// section A is still building — a barrier between stages would waste wall-clock
// for no benefit, since sections share nothing.
// ---------------------------------------------------------------------------
const results = await pipeline(
  sections.map((s, i) => ({ ...s, lane: (i % CONCURRENT_LANES) + 1 })),

  // --- Design Brief -------------------------------------------------------
  async (s) => {
    const brief = await agent(
      `Read the Figma design for section "${s.figma_name}" and produce the Design Brief.
       File: ${cfg.figma.file_key}
       Desktop node: ${s.desktop}   Mobile node: ${s.mobile}
       Desktop is ${cfg.figma.canvases.desktop.width}px, mobile is ${cfg.figma.canvases.mobile.width}px.
       Read brand params from the design — never assume a font, container width, or padding.`,
      { agentType: 'figma-reader', phase: 'Brief', label: `brief:${s.figma_name}` },
    )
    return { s, brief }
  },

  // --- Name it (only if the Figma layer name is meaningless) ---------------
  async ({ s, brief }) => {
    let name = s.name
    if (!name || name.startsWith('TODO')) {
      const named = await agent(
        `Mode: name. The Figma layer is called "${s.figma_name}", which says nothing about what the
         section does. Look at it with get_screenshot (node ${s.desktop}, file ${cfg.figma.file_key}),
         decide what it actually is, and give it a descriptive kebab-case name.
         Then write that name back into .claude/figma-shopify.json, replacing "${s.name}".
         Return ONLY the chosen name, e.g. trust-badges`,
        { agentType: 'pm', phase: 'Contract', label: `name:${s.figma_name}` },
      )
      name = String(named).trim().split(/\s+/).pop().replace(/[^a-z0-9-]/gi, '').toLowerCase()
    }
    return { s: { ...s, name }, brief }
  },

  // --- Assets -------------------------------------------------------------
  async ({ s, brief }) => {
    const assets = await agent(
      `Export and upload the images for section "${s.name}".
       Store: ${cfg.store}. Export via download_assets PNG @${cfg.figma.export.scale}x, convert with
       cwebp -q ${cfg.figma.export.quality}, then upload to Shopify Files THROUGH THE CHROME EXTENSION.
       There is no API token. Reuse any file that already exists rather than creating duplicates.

       Design Brief:
       ${brief}`,
      { agentType: 'asset-prep', phase: 'Assets', label: `assets:${s.name}` },
    )
    return { s, brief, assets }
  },

  // --- Markup contract ----------------------------------------------------
  async ({ s, brief, assets }) => {
    const contract = await agent(
      `Mode: contract. Section "${s.name}".
       Write .claude/contracts/${s.name}.md — the binding BEM tree, blocks, section settings, brand
       params, interactivity, and the mobile deltas. Two devs will build against it in parallel, so
       it must be complete: any class one of them needs and you omitted becomes a defect.

       Design Brief:
       ${brief}`,
      { agentType: 'pm', phase: 'Contract', label: `contract:${s.name}` },
    )
    return { s, brief, assets, contract }
  },

  // --- Build → QA → triage, looping. Teams outer, rounds inner. ------------
  async (ctx) => {
    const { s } = ctx
    const url = `http://127.0.0.1:9292/?view=qa${s.lane}`
    let team = 0
    let verdict = ''
    let handoff = ''
    let totalRounds = 0

    // OUTER: teams. A replacement team gets FRESH agent contexts — that is the
    // entire point. Five rounds in, an agent is anchored on its own broken model
    // and keeps "fixing" the same wrong thing.
    while (team < MAX_TEAM_ATTEMPTS) {
      team += 1
      let round = 0
      let defects = ''

      // INNER: fix rounds within this team.
      while (round < MAX_ROUNDS) {
        round += 1
        totalRounds += 1

        const firstRoundOfTeam = round === 1
        const verb = firstRoundOfTeam
          ? (team === 1
              ? 'Build'
              : 'REWRITE FROM SCRATCH. Discard the previous team\'s implementation entirely — do not patch it')
          : 'Fix ONLY the defects assigned to you in'

        const common =
          `Section "${s.name}" (team ${team}, round ${round}).\n` +
          `Contract:\n${ctx.contract}\n\nDesign Brief:\n${ctx.brief}\n\n` +
          `Uploaded images:\n${ctx.assets}\n\n` +
          (defects ? `Defects assigned to you:\n${defects}\n\n` : '') +
          (handoff ? `Previous team's failure report:\n${handoff}\n\n` : '')

        // Devs run in parallel. They CANNOT collide: dev-markup owns the .liquid,
        // dev-styles owns the .css/.js, and the contract keeps their class names aligned.
        await parallel([
          () => agent(`${verb} the Liquid + schema.\n\n${common}`, {
            agentType: 'dev-markup', phase: 'Build', label: `markup:${s.name}:t${team}r${round}`,
          }),
          () => agent(`${verb} the CSS${/none/i.test(ctx.contract) ? '' : ' (+ JS if the contract says interactive)'}.\n\n${common}`, {
            agentType: 'dev-styles', phase: 'Build', label: `styles:${s.name}:t${team}r${round}`,
          }),
        ])

        // The QA harness: this lane's own alternate template, so three lanes never
        // collide and nothing is written to the live theme.
        await agent(
          `Write templates/index.qa${s.lane}.json containing ONLY the section "dev-${s.name}", using
           its preset settings and these uploaded image URIs (use the shopify:// URIs verbatim):
           ${ctx.assets}
           This is a throwaway harness file — it is gitignored and deleted when the lane finishes.`,
          { agentType: 'general-purpose', phase: 'QA', label: `harness:${s.name}:t${team}r${round}` },
        )

        const [vis, met] = await parallel([
          () => agent(
            `Pixel-diff section "dev-${s.name}" at ${DIFF_WIDTHS.join(' and ')}px against its Figma
             artboards (desktop ${s.desktop}, mobile ${s.mobile}, file ${cfg.figma.file_key}).
             Threshold ${THRESHOLD}%. Run sanity checks only at ${SANITY_WIDTHS.join(' and ')}px —
             those widths have NO artboard, so you must not diff them.
             URL: ${url}`,
            { agentType: 'qa-visual', phase: 'QA', label: `qa-vis:${s.name}:t${team}r${round}` },
          ),
          () => agent(
            `Assert computed styles and box metrics for section "dev-${s.name}" against the Design
             Brief token table, at 1440 / 1024 / 768 / 375. Use the mobile column of the Brief at 375.
             URL: ${url}\n\nDesign Brief:\n${ctx.brief}\n\nContract:\n${ctx.contract}`,
            { agentType: 'qa-metrics', phase: 'QA', label: `qa-met:${s.name}:t${team}r${round}` },
          ),
        ])

        verdict = await agent(
          `Mode: triage. Section "${s.name}", team ${team}/${MAX_TEAM_ATTEMPTS}, round ${round}/${MAX_ROUNDS}.
           Merge and dedupe both reports, route every defect to its owning dev, and give a verdict.
           PASS only if the visual diff is under ${THRESHOLD}% at EVERY reference width AND metrics
           report zero mismatches.

           qa-visual:\n${vis}\n\nqa-metrics:\n${met}`,
          { agentType: 'pm', phase: 'Triage', label: `triage:${s.name}:t${team}r${round}` },
        )

        if (/"verdict"\s*:\s*"PASS"|\bPASS\b/.test(verdict)) break
        defects = verdict
      }

      if (/"verdict"\s*:\s*"PASS"|\bPASS\b/.test(verdict)) break

      if (team < MAX_TEAM_ATTEMPTS) {
        log(`↻ ${s.name}: team ${team} burned ${MAX_ROUNDS} rounds without passing — assembling a fresh team.`)
        handoff = await agent(
          `Mode: handoff. Team ${team} exhausted ${MAX_ROUNDS} rounds on "${s.name}" without passing.
           Write the briefing for the replacement team: which defects survived, with QA evidence; what
           was tried and why it failed; and confirm explicitly that they may rewrite from scratch.
           Do NOT regenerate the Design Brief or the contract — they are verified; changing them moves
           the goalposts instead of fixing the code.

           Last triage:\n${verdict}`,
          { agentType: 'pm', phase: 'Triage', label: `handoff:${s.name}:t${team}` },
        )
      }
    }

    return { ...ctx, verdict, teams: team, rounds: totalRounds }
  },

  // --- Ship or escalate ---------------------------------------------------
  async (ctx) => {
    const { s } = ctx
    const passed = /"verdict"\s*:\s*"PASS"|\bPASS\b/.test(ctx.verdict)

    if (!passed) {
      // Never document broken work as shipped. A status board that lists a failure
      // as done is worse than an empty one — people stop checking it.
      log(`⚠ ${s.name}: ESCALATED after ${ctx.teams} teams / ${ctx.rounds} rounds. Not documented as shipped.`)
      return { section: s.name, shipped: false, teams: ctx.teams, rounds: ctx.rounds, verdict: ctx.verdict }
    }

    await agent(
      `Document the shipped section "dev-${s.name}". Read the ACTUAL files — parse the {% schema %}
       from sections/dev-${s.name}.liquid, grep the CSS vars from assets/dev-${s.name}.css — not the
       contract and not the Brief. Write docs/sections/dev-${s.name}.md and update the row in
       docs/IMPLEMENTATION.md in place.
       Figma: desktop ${s.desktop} / mobile ${s.mobile}. Teams: ${ctx.teams}. Rounds: ${ctx.rounds}.

       Final QA:\n${ctx.verdict}`,
      { agentType: 'scribe', phase: 'Docs', label: `docs:${s.name}` },
    )

    log(`✅ ${s.name}: shipped in ${ctx.rounds} round(s).`)
    return { section: s.name, shipped: true, teams: ctx.teams, rounds: ctx.rounds }
  },
)

const done = results.filter(Boolean)
const shipped = done.filter((r) => r.shipped)
const failed = done.filter((r) => !r.shipped)

log(`\n${shipped.length}/${done.length} sections shipped.`)
if (failed.length) log(`⚠ Escalated: ${failed.map((f) => f.section).join(', ')} — these need a human.`)

return { shipped, failed }
