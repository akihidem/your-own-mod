# 凍結契約: w1-profile-check

> plan: `PLAN.yaml` / plan sha256: `609421f8be4791c2969011d7bdd5f8120c3f015ecdf34e894b87d98f91785790`
> この契約は plan-graph.py が生成した。**契約の変更は plan を直して再生成する**
> （手で書き換えたら凍結が意味を失う。loop-protocol §1-4 と同じ規律）。

## 目的
Parse kokoro.md / torisetsu.md / generic profiles into the Profile contract and run the content check

## 書いてよい場所（これ以外は書かない）
- `src/profile.mjs`
- `src/check.mjs`
- `test/profile.test.mjs`
- `test/check.test.mjs`
- `fixtures/`

## 読むだけ（書いたら契約違反）
- `docs/design/DESIGN.md`
- `src/constants.mjs`

## 公開するインタフェース（他ノードがこれを前提に実装する＝勝手に変えない）
- `impl:profile`

## 前提として与えられるインタフェース（自分では作らない）
- `iface:design`

## 完了条件（全て YES で完了。緩めない・作り替えない）
- `node --test test/profile.test.mjs test/check.test.mjs exits 0`
- `fixtures/valid has 3 profiles (ja kokoro, ja torisetsu, en generic), fixtures/invalid has 6 (one per F rule), fixtures/benign has 2 that pass`
- `every Finding for an invalid fixture carries the expected rule id`
- `parseProfile marks HTML comment lines as kind comment and example subsections as inExample`

## 並列に走っている可能性のあるノード
- `w2-catalog-match`
- `w3-emit`

## 着手前に owns の実行時ガードを入れる
```bash
OG=~/.claude/scripts/owns-guard.py
$OG install --repo .                                  # pre-commit(冪等・全 worktree 共有)
$OG init --repo . --node w1-profile-check --plan <repository>/PLAN.yaml
```
以後、owns の外へ出る commit は止まる。逸脱が必要なら `OWNS_GUARD=off git commit ...`
（塞がないが、意識的に踏んだ記録として残る）。

## 逸脱時
契約外の変更が必要と判じたら、**黙って広げず** ここで停止して plan の修正を求める。
