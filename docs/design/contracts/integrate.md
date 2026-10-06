# 凍結契約: integrate

> plan: `PLAN.yaml` / plan sha256: `609421f8be4791c2969011d7bdd5f8120c3f015ecdf34e894b87d98f91785790`
> この契約は plan-graph.py が生成した。**契約の変更は plan を直して再生成する**
> （手で書き換えたら凍結が意味を失う。loop-protocol §1-4 と同じ規律）。

## 目的
Merge, run the full suite, independent review (Claude on AWS Bedrock) to PASS, record the implementation and inspection summary

## 書いてよい場所（これ以外は書かない）
- `docs/design/INTEGRATION.md`

## 読むだけ（書いたら契約違反）
- `src/`
- `bin/`
- `test/`
- `fixtures/`
- `README.md`
- `README.ja.md`

## 公開するインタフェース（他ノードがこれを前提に実装する＝勝手に変えない）
- `release:v0.1`

## 前提として与えられるインタフェース（自分では作らない）
- `impl:cli`

## 完了条件（全て YES で完了。緩めない・作り替えない）
- `node --test test/ exits 0 on the merged tree`
- `independent review verdict is PASS with no must-fix left open`
- `docs/design/INTEGRATION.md lists each worker, worktree, input commit, result commit and reviewer`

## 並列に走っている可能性のあるノード
（なし＝この時点では単独で走る）

## 着手前に owns の実行時ガードを入れる
```bash
OG=~/.claude/scripts/owns-guard.py
$OG install --repo .                                  # pre-commit(冪等・全 worktree 共有)
$OG init --repo . --node integrate --plan <repository>/PLAN.yaml
```
以後、owns の外へ出る commit は止まる。逸脱が必要なら `OWNS_GUARD=off git commit ...`
（塞がないが、意識的に踏んだ記録として残る）。

## 逸脱時
契約外の変更が必要と判じたら、**黙って広げず** ここで停止して plan の修正を求める。
