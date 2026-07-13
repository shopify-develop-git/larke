# First live run — findings (2026-07-13)

First attempt to actually execute the figma-shopify workflow, on the hero section alone
(desktop `45031:3637`, mobile `44935:4051`).

**No section was built.** The run never reached the Brief. Everything below is a defect the
workflow's static verification could not have caught, because until today not one line of it had
ever been executed.

---

## Blocking: agent definitions named a Figma MCP server that does not exist

`figma-reader`, `asset-prep`, `pm`, and `qa-visual` all declared their Figma tools as
`mcp__figma-remote-mcp__*`. The Figma server actually connected in this project is
**`mcp__plugin_figma_figma__*`**.

A subagent's `tools:` frontmatter is an allowlist. Names that match nothing are dropped **silently** —
so `figma-reader` spawned holding only `Read` and `Write`, with no Figma access and no error.

Fixed: all four agent files renamed to `mcp__plugin_figma_figma__*`. All five tool names
(`get_design_context`, `get_variable_defs`, `get_screenshot`, `get_metadata`, `download_assets`)
exist on the real server. `mcp__chrome-devtools__*` and `mcp__claude-in-chrome__*` were already correct.

### The failure was loud, and that is the good news

`figma-reader` refused to describe the design from memory. `asset-prep` refused to export with no
image list. The PM refused to write a contract with no Brief. QA refused to verify a section that did
not exist. Nothing fabricated a passing result to keep the pipeline moving — which is exactly what
the design asks for.

---

## Registries are snapshotted at session start — edits do not take effect

Two separate caches, one shared consequence: **a file you just fixed is not the file that runs.**

| What | Symptom | Escape hatch |
|---|---|---|
| `.claude/workflows/*.js` via `Workflow({name})` | Ran a stale copy. A fix to line 32 still threw from the *old* line 17. | `Workflow({scriptPath: "…/figma-shopify.js"})` reads the real file. |
| `.claude/agents/*.md` | `figma-reader` still reported only `Read`/`Write` after the rename. Probed twice. | **None. The session must be restarted.** |

`agentType` resolves from the frozen agent registry, so there is no `scriptPath` equivalent.
The corrected agent files are on disk and correct; they simply cannot load until a restart.

---

## `args` reaches a workflow script as a JSON string, not an object

`figma-shopify.js` opened with `const cfg = args?.config`, which is `undefined` when `args` arrives as
a string — and it always does. The script threw `Pass .claude/figma-shopify.json as args.config` and
died in under 15ms, before spawning a single agent. As written it could never have run.

Fixed at `.claude/workflows/figma-shopify.js:32`:

```js
const input = typeof args === 'string' ? JSON.parse(args) : args
```

Related: the `figma-shopify` **skill** documents `Workflow({name, args: "<free text>"})`, an
invocation the script cannot accept. The skill needs correcting to pass `{config, sections}`.

---

## Preflight cannot verify the browser, and says so rather than guessing

Three Chrome browsers are connected. A subagent cannot choose between them and cannot prompt the
user, so preflight returned `ok: false` on the admin-login item and stopped the run before any lane
started. Correct behaviour — it declined to report a PASS for something it had not observed.

Resolved by selecting the browser from the main loop:

- **Browser 2** — `7e735363-dd6e-4c17-b0c8-c5135ce97161` — logged into the wearelarke admin.
  Content → Files renders, with an Upload files button. **This is the one to use.**
- **Browser 1** — `dd856b0a-5727-4e2d-9f84-a526432a73a6` — redirects to
  `/challenges/user_verification`, a bot-detection challenge. Never to be solved or bypassed.

`switch_browser` (the "let me pick it in Chrome" flow) timed out with no browser responding.
`select_browser` by deviceId works.

The preflight prompt is hardcoded in the script and receives only `cfg.store` and
`cfg.figma.file_key`, so the browser selection cannot be passed in through config. Either the prompt
should interpolate a browser block, or browser selection should be settled before the workflow starts.

---

## Two environment quirks worth keeping

**The dev server 500s during startup sync.** For roughly the first minute, `127.0.0.1:9292` serves
Shopify's "Failed to Upload Theme Files" page listing 16 *stock* Horizon files, each rejected with
`Invalid schema: setting with id="…" default must be a color or dynamic source access path`. Those
files are unmodified since the initial commit, and local `shopify theme check` does not flag them at
all. It clears itself and the server then serves HTTP 200.

Risk: a QA agent that hits `:9292` inside that window gets a 500 and could log it as a section defect.
`qa-visual` and `qa-metrics` should retry on 500 rather than treat it as a finding.

**The admin renders fine in a background tab.** The brief warns it would not. It did — both
Content → Files and the theme editor rendered without the window being focused. `asset-prep` should
be able to upload unattended.

---

## To resume

1. **Restart the session.** This is the only way to load the corrected agent definitions.
2. Re-run the hero lane via `scriptPath`, not `name`:

```
Workflow({
  scriptPath: "/Users/mynenkoyevhenii/Documents/EVDEV/Github/larke/.claude/workflows/figma-shopify.js",
  args: { config: <.claude/figma-shopify.json>, sections: [
    { name: "hero", figma_name: "_Master Hero Media", desktop: "45031:3637", mobile: "44935:4051" }
  ]}
})
```

3. First checkpoint: `figma-reader` must return a real Design Brief with actual Figma values. If it
   again reports only `Read`/`Write`, the agent registry still has not reloaded — stop, do not proceed.

Still unproven end-to-end: the Brief, the WebP export and upload, the contract, both devs, the pixel
diff, and the 0.5% threshold. Nothing downstream of preflight has run even once.
