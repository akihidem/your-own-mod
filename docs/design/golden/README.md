# Golden mod

A complete, minimal function-hook mod with its test, validated on Claude Code 2.1.290 on 2026-10-06:

```
claude plugin validate --strict docs/design/golden/plugin   # Validation passed
claude plugin test docs/design/golden/plugin                # 4 pass, 0 fail
```

It proves the idioms the emitter (DESIGN.md §7, §7.1) relies on: appending one `session` section in `prompt.compose`; a `prompt.submit` hook that attaches a context note with `next({ ...e, context })` and carries a `.catch` (strict validation treats a gating hook without one as an error); a Bash `tool.call` guard that reads the grant from `$.store` before `next` and denies with a fixed sentence; tests that dispatch `$.prompt.compose` with every field set, record what reaches the bottom hook, and use `mock.store` / `mock.clock`. The marketplace file needs a `description` to pass `--strict`.
