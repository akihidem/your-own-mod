# 凍結契約: w2-catalog-match

> plan: `PLAN.yaml` / plan sha256: `609421f8be4791c2969011d7bdd5f8120c3f015ecdf34e894b87d98f91785790`
> この契約は plan-graph.py が生成した。**契約の変更は plan を直して再生成する**
> （手で書き換えたら凍結が意味を失う。loop-protocol §1-4 と同じ規律）。

## 目的
Implement the 17-recipe catalog, the matcher with verbatim evidence, ranking, and the proposal diff

## 書いてよい場所（これ以外は書かない）
- `src/catalog/`
- `src/match.mjs`
- `src/diff.mjs`
- `test/match.test.mjs`
- `test/diff.test.mjs`

## 読むだけ（書いたら契約違反）
- `docs/design/DESIGN.md`
- `src/constants.mjs`

## 公開するインタフェース（他ノードがこれを前提に実装する＝勝手に変えない）
- `impl:match`

## 前提として与えられるインタフェース（自分では作らない）
- `iface:design`

## 完了条件（全て YES で完了。緩めない・作り替えない）
- `node --test test/match.test.mjs test/diff.test.mjs exits 0`
- `every recipe has a positive and a polarity-negative test per language on hand-built Profile objects`
- `ranking enables at most maxEnabled proposals by default`
- `diffProposals reports added, removed and changed ids on hand-built bundles`

## 並列に走っている可能性のあるノード
- `w1-profile-check`
- `w3-emit`

## 着手前に owns の実行時ガードを入れる
```bash
OG=~/.claude/scripts/owns-guard.py
$OG install --repo .                                  # pre-commit(冪等・全 worktree 共有)
$OG init --repo . --node w2-catalog-match --plan <repository>/PLAN.yaml
```
以後、owns の外へ出る commit は止まる。逸脱が必要なら `OWNS_GUARD=off git commit ...`
（塞がないが、意識的に踏んだ記録として残る）。

## 逸脱時
契約外の変更が必要と判じたら、**黙って広げず** ここで停止して plan の修正を求める。
