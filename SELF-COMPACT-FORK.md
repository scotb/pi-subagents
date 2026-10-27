# self-compact fork notes

This fork (`scotb/pi-subagents`, branch `self-compact`) adds child self-compaction to
pi-subagents: children get `view_context` / `self_compact` tools, and the runner's
drain-hold gate keeps the parent from settling a child while a compaction is in flight.

## Intentional divergence from upstream

The fork modifies the 7 bundled `agents/*.md` files:
- adds `self_compact, view_context` to each agent's `tools:` allowlist
- adds `subagentOnlyExtensions: /home/ubuntu/.pi/agent/extensions/self-compact`
  (sandbox-specific path — the extension's install location in the pi-sandbox container)

Consequently **4 upstream unit tests fail by design** (verified identical before and
after the 2026-10-20 rebase to v0.79.2):

| Test file | Failing test(s) | Why |
|---|---|---|
| `test/unit/agent-frontmatter.test.ts` | bundled standard agents keep bounded tool allowlists | allowlists now include the two self-compact tools |
| `test/unit/agent-management.test.ts` | reports bundled reviewer supervisor contact without mutation tools in capabilities | same |
| `test/unit/agent-overrides.test.ts` | keeps strict builtin tools unless a role opts into inheritance | same |
| `test/unit/default-extensions.test.ts` | subagent extension defaults (3 subtests) | the `subagentOnlyExtensions` field changes ambient discovery/loading |

These are **not** regressions. Do not "fix" them by reverting the agent changes.

## Known flaky under load

`test/unit/await-async-run.test.ts` → `rejects with the abort reason while waiting`
fails in full-suite runs under CPU contention; passes in isolated runs on both the
rebased and pre-rebase trees.

## Environment-specific failures (not regressions)

`test/unit/run-child-session.test.ts` does not run green in the pi-sandbox
container (verified identical on pre- and post-rebase trees, 2026-10-27):

- `settles a timed-out run whose session creation never returns` (upstream
test) hangs and cancels the rest of the file: the run settles only through
the unref'd 3s abort-backstop timer, and the isolated test process has
nothing else keeping the event loop alive, so node exits first. Verified to
fail identically on pure upstream v0.83.0 (`d9c5ca29`) — an upstream issue.
- `delivers the resumed task as a prompt` and `defers a timeout kill` (fork
tests) fail the same way on the pre-rebase tree (`45327ce1`) as on the
rebased tree: their settle paths also rest on unref'd timers (resume
delivery grace window / abort backstop).
- `re-routes the resumed task to a follow-up` (fork test) passes in isolated
runs.

The `fileLaunch` test helper was missing the `capture` key required by the
current launch API (TypeError in `armFinalDrainTimer`); fixed in `49c81936`.

These are environment artifacts (isolated node:test process + unref'd
timers), not regressions. Do not chase them when rebasing.

## Rebase log

- 2026-10-20: rebased onto v0.79.2 (`7927cf21`). The 4 known failures were
  verified identical.
- 2026-10-27: rebased onto v0.83.0 (`d9c5ca29`) from fork point `7927cf21`.
  Two conflict stops, both resolved by keeping both sides:
  - `581cb057`: upstream structured-output follow-up block (#2997) + fork
    self-compact settle-skip guard in the prompt-resolution path — both
    kept, upstream block first.
  - `f93d0e11`: state vars, `compaction_start` handler, `compaction_end`
    handler (two separate `if` blocks), and the test file (upstream
    `runFinalReply` tests + fork resume-gate tests) — all kept.
  Follow-up: `49c81936` test-helper fix (`capture` on `fileLaunch`).
  Typecheck passes; the 4 known failures verified identical.

## Rebase checklist

1. `git tag backup/self-compact-pre-rebase-<date> HEAD`
2. `git fetch upstream && git rebase --onto upstream/main <fork-point> self-compact`
3. `npm run typecheck`
4. Run the 5 test files above — expect exactly the 4 documented failures
5. Content-diff old vs new patch set (`git diff <fork-point>..HEAD` before/after,
   stripped of index/@@ headers) to confirm the fork commits survived intact
6. Dev mode: restart the container with `--dev`, smoke-test a worker child
   (it should list `self_compact` and `view_context` among its tools)
