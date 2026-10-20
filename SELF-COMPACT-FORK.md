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

## Rebase checklist

1. `git tag backup/self-compact-pre-rebase-<date> HEAD`
2. `git fetch upstream && git rebase --onto upstream/main <fork-point> self-compact`
3. `npm run typecheck`
4. Run the 5 test files above — expect exactly the 4 documented failures
5. Content-diff old vs new patch set (`git diff <fork-point>..HEAD` before/after,
   stripped of index/@@ headers) to confirm the fork commits survived intact
6. Dev mode: restart the container with `--dev`, smoke-test a worker child
   (it should list `self_compact` and `view_context` among its tools)
