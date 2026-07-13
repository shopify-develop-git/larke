#!/usr/bin/env node
// svg-fidelity — proves every vector in a section came from the owner's Figma file.
//
// WHY THIS EXISTS
// A dev shipped the theme's stock `icon-cart.svg` instead of the cart icon exported from
// Figma. Another RETYPED the logo path by hand and landed on 21.6217 where Figma says
// 21.6216. Both still compiled, still rendered, and barely moved the pixel diff — a 24x24
// icon is a rounding error against a 1440x90 header. Prompts did not stop it. Measurement does.
//
// TWO LEGAL WAYS to put Figma vector art in a section, and this checks both:
//
//   1. INLINE  <svg><path d="…"/></svg>          — for small mono icons (recolourable via
//      currentColor). Every d= must appear BYTE-FOR-BYTE in .figma-assets/<section>/.
//
//   2. ASSET FILE  {{ 'dev-<section>-x.svg' | asset_url }}  — for heavy artwork. Shopify caps a
//      template at 256 KB and one Larke icon exports at 248 KB on its own (6 paths, the longest
//      78k characters), so inlining it is simply impossible. The asset file must carry the SAME
//      path geometry as the Figma export — compared after running BOTH through the same svgo
//      pass, so optimisation is allowed but substitution is not.
//
// ILLEGAL, always: referencing a NON dev-* asset (that is Horizon's stock icon library).
//
//   node .claude/tools/svg-fidelity.mjs --section site-header
//
// Exit 0 = every vector traces to Figma. Exit 1 = something was invented, retyped or substituted.

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const args = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 1) if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1]

const out = (o) => { console.log(JSON.stringify(o, null, 2)); process.exit(o.pass ? 0 : 1) }

const section = args.section
if (!section) out({ pass: false, error: 'usage: --section <name>' })

const subjectPath = args.file || `sections/dev-${section}.liquid`
const figmaDir = args.figma || `.figma-assets/${section}`

if (!existsSync(subjectPath)) out({ pass: false, error: `subject not found: ${subjectPath}` })

const subjectEarly = readFileSync(subjectPath, 'utf8')

// Does this section actually RENDER any vector art? Many sections are photos and text only —
// they have no icons at all, and there is nothing here to verify.
const rendersVectors = /\sd="[^"]*\d[^"]*"/.test(subjectEarly)
  || /['"][^'"]+\.svg['"]\s*\|\s*(?:asset_url|inline_asset_content)/.test(subjectEarly)

// A section with no vectors and no ground truth is FINE. It is not a fidelity failure — there is
// simply nothing to check.
//
// The first version of this tool failed hard whenever .figma-assets/<section>/ was empty. That
// meant every photo-only section (cool-sleepers-promo, featured-product, the video banners…)
// FAILED QA permanently, and no dev could ever fix it because the vector art it demanded does not
// exist. Worse, it pushed agents toward forging ground-truth SVGs just to get past the gate — a
// check that cannot be satisfied honestly is a check that teaches dishonesty.
if (!rendersVectors) {
  out({
    pass: true,
    section,
    subject: subjectPath,
    note: 'This section renders no vector art (no inline <path d>, no .svg asset reference), so there '
      + 'is nothing to verify. Not a failure.',
  })
}

// From here on the section DOES render vectors — so ground truth is mandatory.
if (!existsSync(figmaDir) || !readdirSync(figmaDir).some((f) => f.endsWith('.svg'))) {
  out({
    pass: false,
    error: `this section renders vector art, but there is no Figma ground truth at ${figmaDir}`,
    hint: 'The Assets stage must save the exported SVGs there before the dev builds. Do NOT create '
      + 'those files yourself from the section\'s own markup — that would be forging the reference, '
      + 'and it is exactly the substitution this check exists to catch. Re-run the export from Figma.',
  })
}

const norm = (d) => d.replace(/\s+/g, ' ').trim()
const dAttrs = (svg) => [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => norm(m[1])).filter((d) => /\d/.test(d))

// Canonicalise through svgo so an OPTIMISED asset still proves it came from Figma.
// Same pass on both sides => byte-comparable. If svgo is unavailable we fall back to raw
// comparison rather than silently passing everything.
let svgoOk = true
const tmp = mkdtempSync(join(tmpdir(), 'svgfid-'))
const canon = (svgText) => {
  if (!svgoOk) return svgText
  try {
    const i = join(tmp, 'i.svg'); const o = join(tmp, 'o.svg')
    writeFileSync(i, svgText)
    execFileSync('npx', ['--yes', 'svgo', '--multipass', '-p', '2', '-i', i, '-o', o], { stdio: 'pipe' })
    return readFileSync(o, 'utf8')
  } catch { svgoOk = false; return svgText }
}

// --- ground truth ---------------------------------------------------------
const truthRaw = new Map()   // exact d -> source file   (for inline icons)
const truthCanon = new Map() // canonical d -> source file (for optimised asset files)
for (const f of readdirSync(figmaDir).filter((f) => f.endsWith('.svg'))) {
  const raw = readFileSync(join(figmaDir, f), 'utf8')
  for (const d of dAttrs(raw)) truthRaw.set(d, f)
  for (const d of dAttrs(canon(raw))) truthCanon.set(d, f)
}
if (truthRaw.size === 0) {
  out({
    pass: false,
    error: `this section renders vector art, but ${figmaDir}/*.svg contains no path data`,
    hint: 'Re-export the vectors from Figma. Do NOT hand-write SVGs into the ground-truth folder.',
  })
}

const subject = subjectEarly
const violations = []
let verifiedInline = 0
let verifiedAssets = 0

// --- 1. inline paths in the Liquid ----------------------------------------
for (const d of dAttrs(subject)) {
  if (truthRaw.has(d)) { verifiedInline += 1; continue }
  violations.push({
    kind: 'inline-path-not-in-figma',
    d: d.length > 90 ? d.slice(0, 90) + '…' : d,
    problem: 'This inline path is NOT in the Figma export for this section. It was hand-authored, '
      + 'retyped (one changed digit is enough), or copied from an icon library.',
  })
}

// --- 2. referenced asset files --------------------------------------------
const refs = new Set()
for (const m of subject.matchAll(/'([^']+\.svg)'\s*\|\s*(?:asset_url|inline_asset_content)/g)) refs.add(m[1])
for (const m of subject.matchAll(/"([^"]+\.svg)"\s*\|\s*(?:asset_url|inline_asset_content)/g)) refs.add(m[1])

for (const ref of refs) {
  if (!ref.startsWith(`dev-`)) {
    violations.push({
      kind: 'theme-stock-asset',
      d: ref,
      problem: `References '${ref}', which is not a dev-* asset — that is Horizon's stock icon library, `
        + 'not the owner\'s design. This is the exact substitution that shipped once already.',
    })
    continue
  }
  const file = `assets/${ref}`
  if (!existsSync(file)) {
    violations.push({ kind: 'missing-asset', d: ref, problem: `Section references ${file}, which does not exist.` })
    continue
  }
  const paths = dAttrs(canon(readFileSync(file, 'utf8')))
  if (!paths.length) {
    violations.push({ kind: 'empty-asset', d: ref, problem: `${file} contains no path data.` })
    continue
  }
  const bad = paths.filter((d) => !truthCanon.has(d))
  if (bad.length) {
    violations.push({
      kind: 'asset-not-from-figma',
      d: ref,
      problem: `${file} contains ${bad.length}/${paths.length} path(s) that are not in the Figma export `
        + `for this section (compared after an identical svgo pass, so optimising is fine — substituting is not).`,
    })
  } else verifiedAssets += 1
}

const pass = violations.length === 0
out({
  pass,
  section,
  subject: subjectPath,
  svgo: svgoOk ? 'used (optimised assets still verifiable)' : 'UNAVAILABLE — compared raw; an optimised asset may false-fail',
  figma_paths: truthRaw.size,
  verified_inline_paths: verifiedInline,
  verified_asset_files: verifiedAssets,
  violations,
  ...(pass
    ? { note: 'Every vector in this section traces to the Figma export.' }
    : { note: `FIDELITY FAILURE — this section renders artwork that is not in the owner's Figma file. `
        + `Replace each offending vector with the export from ${figmaDir}/. Do not "adjust" this check to pass.` }),
})
