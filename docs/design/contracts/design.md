# 凍結契約: design

> plan: `PLAN.yaml` / plan sha256: `609421f8be4791c2969011d7bdd5f8120c3f015ecdf34e894b87d98f91785790`
> この契約は plan-graph.py が生成した。**契約の変更は plan を直して再生成する**
> （手で書き換えたら凍結が意味を失う。loop-protocol §1-4 と同じ規律）。

## 目的
Freeze the data contracts, catalog, acceptance criteria and work split (DESIGN.md, constants)

## 書いてよい場所（これ以外は書かない）
- `docs/design/`
- `src/constants.mjs`
- `PLAN.yaml`

## 読むだけ（書いたら契約違反）
- `docs/research/`

## 公開するインタフェース（他ノードがこれを前提に実装する＝勝手に変えない）
- `iface:design`

## 前提として与えられるインタフェース（自分では作らない）
（なし）

## 完了条件（全て YES で完了。緩めない・作り替えない）
- `docs/design/DESIGN.md v0.2 has sections 5 (contracts), 8 (acceptance A1-A12) and 10 (work split)`
- `node --check src/constants.mjs exits 0`
- `plan-graph.py check PLAN.yaml exits 0`
- `independent design review returned no must-fix finding left open`

## 並列に走っている可能性のあるノード
（なし＝この時点では単独で走る）

## 着手前に owns の実行時ガードを入れる
```bash
OG=~/.claude/scripts/owns-guard.py
$OG install --repo .                                  # pre-commit(冪等・全 worktree 共有)
$OG init --repo . --node design --plan <repository>/PLAN.yaml
```
以後、owns の外へ出る commit は止まる。逸脱が必要なら `OWNS_GUARD=off git commit ...`
（塞がないが、意識的に踏んだ記録として残る）。

## 逸脱時
契約外の変更が必要と判じたら、**黙って広げず** ここで停止して plan の修正を求める。
