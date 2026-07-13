#!/usr/bin/env node
// section-state — the durable ledger of what has ACTUALLY passed QA.
//
// WHY THIS EXISTS
// A run died mid-flight (expired Shopify CLI token) and every lane went blind at once.
// The code on disk survived — but the knowledge of which sections had already been
// pixel-verified did not. A fresh run starts every lane at round 1 = "Build", so a dev
// would cheerfully rewrite a section that had already passed at 0.5%, and we'd pay for
// it again in tokens and in risk.
//
// So passing is recorded HERE, on disk, against a hash of the exact files that passed.
// A section is skipped only if it passed AND its files have not changed since. Touch the
// Liquid and it re-verifies — the ledger can never bless code it has not seen.
//
//   node .claude/tools/section-state.mjs get  <name>            -> {status, ...} | {status:"none"}
//   node .claude/tools/section-state.mjs pass <name> --diff '{"1440":0.12,"375":0.31}'
//   node .claude/tools/section-state.mjs fail <name> --reason "..."
//   node .claude/tools/section-state.mjs list
//
// NEVER record a pass by hand, and never record one for an environment failure. A green
// row here means "a pixel diff under threshold was actually measured", nothing less.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

const LEDGER = '.claude/state/sections.json'

const load = () => (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : {})
const save = (d) => {
  mkdirSync('.claude/state', { recursive: true })
  writeFileSync(LEDGER, JSON.stringify(d, null, 2) + '\n')
}

// Hash exactly the files that constitute the section. If any changed, a prior pass is stale.
const filesOf = (name) => [
  `sections/dev-${name}.liquid`,
  `assets/dev-${name}.css`,
  `assets/dev-${name}.js`,
]
const hashOf = (name) => {
  const h = createHash('sha256')
  let any = false
  for (const f of filesOf(name)) {
    if (!existsSync(f)) continue
    any = true
    h.update(f).update(readFileSync(f))
  }
  return any ? h.digest('hex').slice(0, 16) : null
}

const [, , cmd, name, ...rest] = process.argv
const arg = (k) => {
  const i = rest.indexOf(`--${k}`)
  return i === -1 ? undefined : rest[i + 1]
}
const out = (o) => { console.log(JSON.stringify(o, null, 2)); process.exit(0) }

const db = load()

if (cmd === 'list') {
  const rows = Object.entries(db).map(([n, r]) => {
    const fresh = r.status === 'passed' && r.hash === hashOf(n)
    return { section: n, status: r.status, diff: r.diff, stale: r.status === 'passed' && !fresh, at: r.at }
  })
  out({ sections: rows, passed: rows.filter((r) => r.status === 'passed' && !r.stale).length, total: rows.length })
}

if (!name) out({ error: 'usage: get|pass|fail|list <name>' })

if (cmd === 'get') {
  const r = db[name]
  if (!r) out({ status: 'none', reason: 'never attempted' })
  if (r.status !== 'passed') out(r)
  const now = hashOf(name)
  if (now !== r.hash) {
    out({ status: 'stale', reason: 'files changed since the pass was recorded — must re-verify', recorded_hash: r.hash, current_hash: now, diff: r.diff })
  }
  out({ ...r, verified_current: true })
}

if (cmd === 'pass') {
  let diff
  try { diff = JSON.parse(arg('diff') || '{}') } catch { out({ error: 'bad --diff JSON' }) }
  const nums = Object.values(diff).filter((v) => typeof v === 'number')
  if (!nums.length) {
    out({ error: 'refusing to record a pass with no measured diff numbers. Pass --diff \'{"1440":0.1,"375":0.2}\' from the real pixel-diff output.' })
  }
  const h = hashOf(name)
  if (!h) out({ error: `refusing to record a pass: no files exist for dev-${name}` })
  db[name] = { status: 'passed', diff, hash: h, at: new Date().toISOString() }
  save(db)
  out({ recorded: 'passed', section: name, diff, hash: h })
}

if (cmd === 'fail') {
  db[name] = { status: 'failed', reason: arg('reason') || 'unspecified', at: new Date().toISOString() }
  save(db)
  out({ recorded: 'failed', section: name })
}

out({ error: `unknown command: ${cmd}` })
