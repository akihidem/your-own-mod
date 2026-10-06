# 凍結契約: w4-cli

> plan: `PLAN.yaml` / plan sha256: `609421f8be4791c2969011d7bdd5f8120c3f015ecdf34e894b87d98f91785790`
> この契約は plan-graph.py が生成した。**契約の変更は plan を直して再生成する**
> （手で書き換えたら凍結が意味を失う。loop-protocol §1-4 と同じ規律）。

## 目的
CLI (check, propose, diff, report, recipes), metrics export shape, README in en and ja, end-to-end tests

## 書いてよい場所（これ以外は書かない）
- `bin/`
- `src/cli.mjs`
- `src/report.mjs`
- `src/metrics.mjs`
- `test/cli.test.mjs`
- `package.json`
- `README.md`
- `README.ja.md`
- `.github/`

## 読むだけ（書いたら契約違反）
- `src/profile.mjs`
- `src/check.mjs`
- `src/catalog/`
- `src/match.mjs`
- `src/diff.mjs`
- `src/emit.mjs`
- `src/templates/`
- `fixtures/`
- `docs/design/DESIGN.md`

## 公開するインタフェース（他ノードがこれを前提に実装する＝勝手に変えない）
- `impl:cli`

## 前提として与えられるインタフェース（自分では作らない）
- `impl:profile`
- `impl:match`
- `impl:emit`

## 完了条件（全て YES で完了。緩めない・作り替えない）
- `node --test test/ exits 0`
- `exit codes follow DESIGN.md section 9 (tested for 0, 2, 3, 4, 5) and errors carry no input excerpt (A12)`
- `propose on each valid fixture writes a folder that passes claude plugin validate --strict and claude plugin test`
- `assertMetricsExport rejects a free-text field and accepts a hand-built export`

## 並列に走っている可能性のあるノード
（なし＝この時点では単独で走る）

## 着手前に owns の実行時ガードを入れる
```bash
OG=~/.claude/scripts/owns-guard.py
$OG install --repo .                                  # pre-commit(冪等・全 worktree 共有)
$OG init --repo . --node w4-cli --plan <repository>/PLAN.yaml
```
以後、owns の外へ出る commit は止まる。逸脱が必要なら `OWNS_GUARD=off git commit ...`
（塞がないが、意識的に踏んだ記録として残る）。

## 逸脱時
契約外の変更が必要と判じたら、**黙って広げず** ここで停止して plan の修正を求める。
