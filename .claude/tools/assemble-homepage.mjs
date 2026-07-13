#!/usr/bin/env node
// assemble-homepage — build the REAL templates/index.json from the sections that exist.
//
// The QA harness (templates/index.qaN.json) shows ONE section in isolation, which is what a
// pixel diff needs. But nobody can see the actual page that way. This assembles the real
// homepage in the Figma running order, reusing each section's already-correct settings from
// its QA harness — including the shopify:// image URIs, which are the expensive part and must
// never be re-guessed.
//
// A section is included only if its .liquid actually exists. A missing section is skipped with
// a note, never invented: a homepage that silently omits a section is honest; one that
// references a section file that isn't there fails the whole theme upload for every lane.
//
//   node .claude/tools/assemble-homepage.mjs            # write templates/index.json
//   node .claude/tools/assemble-homepage.mjs --dry      # show what it would do

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'

const DRY = process.argv.includes('--dry')

// Figma running order of the homepage. Drawers are appended last: they are overlays, they
// render hidden, and their position in the DOM does not affect the page flow.
const ORDER = [
  'announcement-bar',
  'site-header',
  'promo-bar',
  'hero',
  'trust-badges',
  'wash-dry-repeat-promo',
  'as-seen-in',
  'video-promo-banner',
  'featured-product',
  'cool-sleepers-promo',
  'brand-social-gallery',
  'video-story-banner',
  'site-footer',
  'menu-drawer',
  'cart-drawer',
]

// Each section's real settings already live in its QA harness — that is where the verified
// image URIs and preset values ended up. Reuse them rather than re-deriving anything.
const settingsFor = (name) => {
  for (const f of readdirSync('templates').filter((f) => /^index\.qa\d+\.json$/.test(f))) {
    let t
    try { t = JSON.parse(readFileSync(`templates/${f}`, 'utf8')) } catch { continue }
    const hit = Object.values(t.sections || {}).find((s) => s.type === `dev-${name}`)
    if (hit) return { settings: hit.settings || {}, blocks: hit.blocks, block_order: hit.block_order, from: f }
  }
  return null
}

const sections = {}
const order = []
const included = []
const skipped = []

for (const name of ORDER) {
  if (!existsSync(`sections/dev-${name}.liquid`)) {
    skipped.push({ section: name, why: 'not built yet' })
    continue
  }
  const s = settingsFor(name)
  const id = `dev-${name}`
  sections[id] = { type: `dev-${name}`, settings: s?.settings || {} }
  if (s?.blocks) sections[id].blocks = s.blocks
  if (s?.block_order) sections[id].block_order = s.block_order
  order.push(id)
  included.push({ section: name, settings_from: s?.from || 'schema defaults (no QA harness found)' })
}

const tpl = { sections, order }

if (!DRY) writeFileSync('templates/index.json', JSON.stringify(tpl, null, 2) + '\n')

console.log(JSON.stringify({
  wrote: DRY ? null : 'templates/index.json',
  included: included.length,
  sections: included,
  skipped,
  note: skipped.length
    ? `${skipped.length} section(s) are not built yet and were left out. The homepage is honest about what exists — rerun this once they land.`
    : 'Every homepage section is present.',
}, null, 2))
