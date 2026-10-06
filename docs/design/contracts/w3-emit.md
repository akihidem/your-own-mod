# 凍結契約: w3-emit

> plan: `PLAN.yaml` / plan sha256: `609421f8be4791c2969011d7bdd5f8120c3f015ecdf34e894b87d98f91785790`
> この契約は plan-graph.py が生成した。**契約の変更は plan を直して再生成する**
> （手で書き換えたら凍結が意味を失う。loop-protocol §1-4 と同じ規律）。

## 目的
Emit <out>/plugin (manifest with userConfig, marketplace, hooks module, tests) and the private PROPOSALS.md/json from a bundle

## 書いてよい場所（これ以外は書かない）
- `src/emit.mjs`
- `src/templates/`
- `test/emit.test.mjs`

## 読むだけ（書いたら契約違反）
- `docs/design/DESIGN.md`
- `docs/design/api-digest-w3.md`
- `docs/design/golden/`
- `src/constants.mjs`

## 公開するインタフェース（他ノードがこれを前提に実装する＝勝手に変えない）
- `impl:emit`

## 前提として与えられるインタフェース（自分では作らない）
- `iface:design`

## 完了条件（全て YES で完了。緩めない・作り替えない）
- `node --test test/emit.test.mjs exits 0`
- `emitted plugin.json userConfig has one boolean per proposal plus typed params with title and description`
- `no evidence canary appears under plugin/ and the manifest and module templates take no evidence (A5)`
- `emitting the same bundle twice yields identical file contents (A8 test)`
- `claude plugin validate --strict passes on the emitted folder when claude is on PATH`

## 並列に走っている可能性のあるノード
- `w1-profile-check`
- `w2-catalog-match`

## 着手前に owns の実行時ガードを入れる
```bash
OG=~/.claude/scripts/owns-guard.py
$OG install --repo .                                  # pre-commit(冪等・全 worktree 共有)
$OG init --repo . --node w3-emit --plan <repository>/PLAN.yaml
```
以後、owns の外へ出る commit は止まる。逸脱が必要なら `OWNS_GUARD=off git commit ...`
（塞がないが、意識的に踏んだ記録として残る）。

## 逸脱時
契約外の変更が必要と判じたら、**黙って広げず** ここで停止して plan の修正を求める。
