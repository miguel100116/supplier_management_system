# Token-efficient repository work

Use this workflow with [AGENTS.md](../../AGENTS.md). Reduce repeated reading and noisy output while preserving context, correctness, and required checks.

## Start with a bounded question

1. State the requested outcome and acceptance criteria.
2. Run `git status --short`; inspect diffs for likely edit targets.
3. Read [agent memory](AGENT_MEMORY.md), then relevant sections of the README, turnover, and second brain as required by AGENTS.md.
4. Search the smallest likely directory for the feature's label, symbol, route, or storage key. Expand only when the evidence requires it.
5. Read the complete relevant function/component and its callers, contracts, persistence, authorization, and tests before editing.

## Search and read efficiently

Use targeted commands from the repository root, replacing the example terms:

```powershell
rg -n 'featureSymbol' src/pages src/features
rg --files src/features/reports
rg -n '^##|^###' docs/engineering/SECOND_BRAIN.md
Get-Content docs/engineering/SECOND_BRAIN.md | Select-Object -Skip 20 -First 40
git diff -- path/to/affected-file
```

- Use heading searches to locate documentation sections before reading ranges.
- Batch independent read-only checks; keep dependent edits and verification sequential.
- Keep a short working note of files inspected, verified findings, and open questions. Re-read when files change or an assumption fails.
- Avoid whole-directory dumps, repeated full-file reads, dependency/generated directories, lockfile dumps, and unrestricted search output.
- If output truncates, narrow the query or read the missing range. Truncated output is incomplete evidence.
- Never read or print secrets for convenience. Inspect `.env.example`; inspect local configuration only when the user requests configuration diagnosis, reporting names/presence without values.

## Finish the slice

Make the smallest complete change. Run focused checks during iteration and the applicable AGENTS.md gates before handoff. Do not trade away coverage, authorization review, or required context to save tokens.

Report behavior changed, files, checks and limitations concisely. Update the second brain only for durable facts, with evidence and date. Stop searching when the requested acceptance criteria have adequate support.
