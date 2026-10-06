# kokoro-mods chunk E 再検品（test/cli.test.mjs の抜粋と chunk E の処置表だけで判定）

## 1. 「folded」の行は実装されているか

| 行 | 判定 | 根拠 |
|---|---|---|
| H1 | **一部だけ確認できた** | `plugin/` に対する A5c の照合（`privateLines` と title / `frontmatter.name` / `user_alias` / `alias`）はあります。export の `plugin` が `bundle.pluginName` と一致することも検査しています。一方、「slug は `--name` からだけ作り、無ければ `profile`」の正否は、添付に無い VALID 表の `expected.slug` / `source` 次第です。`--name` を正しく受け付ける場合のテストも抜粋にありません。4文字の下限は `privateLines` の中にあり、本体は添付外です |
| M1 | 判定できない | README が添付にありません |
| M2 | **不完全** | 処置表は「すべての fixture で非 JSON の `propose` と `check` を走査する」としています。しかし valid fixture で走査しているのは非 JSON の `propose` の再実行だけです。`check` は `--json` だけで、stderr を照合していません。「すべての fixture」が成り立つのは invalid 側だけです |
| M3 | 実装されているが弱い | 4節の A9-1 と A9-2 を参照 |
| M4 | 判定できない | CI の YAML が添付にありません |
| M5 | 実装されている | 実行件数・pass と fail の件数・`(pass) 名前` を検査しています。ただし `KOKORO_MODS_SKIP_CLAUDE=1` の時はこの検査ごと走りません。CI が main やタグでこの変数を立てていないかは、添付からは分かりません |
| M6 | 実装されている。ただし「suppressed はレシピごと」は半分だけ | 生成された `register.ts` を型除去（Node の type stripping）で実行し、その export を `assertMetricsExport`・`readExport`・`report` に通しているので、実物を検査しています。一方 `suppressed` は「publish-guard では拒否される」側しかテストがありません。`suppressed` を持つレシピで受理される側のテストがありません |
| M7 | 判定できない | package.json も CI も添付にありません。なお `--experimental-strip-types` は Node 22.6 未満に存在しないので、エンジンの下限が「≥22」のままだと 22.0〜22.5 ではテストが落ちます |
| L3 | **一部だけ** | 再実行時の diff とインストールパスは検査しています。「recipes の列」は `recipes --lang ja` の終了コードを見るだけで、列の中身を検査していません。option のエラーは usage テストが途中で切れていて全体を確認できません |
| L4 | 実装されている | 別プロセスで `TZ=Pacific/Kiritimati`・`LC_ALL=C` にして、出力のバイト列が同じことを確かめています |
| L9 | 判定できない | `claude(…, h)` の helper 本体が添付にありません |
| L1, L2, L5〜L8, L10 | 判定できない | 対象の文書・設定が添付にありません |

## 2. 退行（regression）

添付の範囲では退行を確認できませんでした。

## 3. 本人の取扱説明書（以下「マニュアル」）の文章が漏れる新しい経路

確定した経路はありません。ただし未確認の経路が2つあります。

- 共通 helper の `proposed()` が `propose --json` を呼び、bundle を stdout から読んでいるなら、`evidence[].quote`（マニュアルの行そのもの）が設計どおりに stdout へ出ています。helper が添付外なので判断できません。
- `diff` の出力に quote が含まれるかどうかも不明です。

## 4. 残る指摘

**中: test/cli.test.mjs・INVALID ループ・`messages.includes(needle)` による除外**
- 問題: 除外する集合を、検査対象のコード自身の出力（finding の message）から作っています。将来、実装が別のマニュアル行を丸ごと message に入れるように壊れると、その行は「message に含まれる」ので照合から外れ、テストは緑のままです。自分の出力を自分の免罪に使う循環になっています。`flagged` の照合も fold していない生の文字列で比べているので、正規化した形での表示は検出できません。さらにコメントは「token だけの行は message 経由で見えてよい」と書いていますが、`flagged` の assert はその例外を実装していません。そういう fixture が無いか、あればテストが落ちるかのどちらかです。
- 修正案: 許可する token は INVALID 表に期待値の列として固定します。message は「`<rule>: <token>`」の決まった書式に完全一致することを assert します。その上で、除外なしに全マニュアル行を fold して照合します。

**中: A9 のテスト・throw する `fetch`**
- 問題: 実装側で `try/catch` して代替に倒すと、`fetch` を呼んでも終了コード 0 になります。このテストは「呼ばれなかった」ことを証明しておらず、引き金が引かれなかったことしか示していません。また `h.run` が子プロセスを起動する作りなら、親プロセスで差し替えた `fetch` は効きません（helper が添付外なので判断できません）。
- 修正案: 呼び出し回数を数えて `assert.equal(calls, 0)` を加えます。`h.run` が in-process であることは helper 側で assert します。

**中: A9 のテスト・静的検査の範囲**
- 問題: 対象は `src` と `bin` の `.mjs` だけです。生成物 `plugin/**`（とくに `hooks/register.ts`）は、利用者の Claude の中で動いて metrics を持つのに、`fetch` / `import` の検査がありません。他のテストで検査しているかは不明です。
- 修正案: `plugin/**/*.ts` にも同じ正規表現を当てます。

**低: `runGeneratedModule`**
- 問題: 子プロセスの stderr を検査していません。stdout に書けば JSON が壊れて落ちますが、`console.error` は素通りします。
- 修正案: `assert.equal(child.stderr, '')` を加えます。

**低: bundle の形を拒否するテスト・拒否された再実行**
- 問題: 拒否された `propose` が `h.out` の既存ファイルを変えていないことを検査していません。
- 修正案: ループの前後で `snapshot(h.out)` が一致することを assert します。

**低: A6 のテスト**
- 問題1: `__proto__` を key に持つ入力（`options` や `counts` の下）のケースがありません。検査の前に spread で写し替える実装だと、その key が消えて黙って受理されます。
- 修正案1: そのケースを追加します。
- 問題2: カタログには載っているが今回の bundle では選ばれていないレシピ id を `counts` に入れるケースもありません。
- 修正案2: そのケースを追加します。

**低: `assertPluginTestRun`**
- 問題: テスト名で走ったことを確かめているのは publish-guard と submit-detector だけです。他のレシピは「件数の下限」でしか担保されません。
- 修正案: 選ばれた各レシピに、少なくとも1つの名前を必須にします。

**低: L4（別プロセスの決定性）**
- 問題: ロケールが `C` だけでは、トルコ語の i のような大小変換の差を突けません。
- 修正案: `LC_ALL=tr_TR.UTF-8` の実行を追加します。

## 5. 否定ケースはガードを証明しているか

- **INVALID**: 終了コード 3 と、決まった rule と行番号の finding を確かめているので、ガードが実際に働いたことの証明になっています。ただし漏洩の照合は上の除外で弱まっています。
- **A6 と bundle の形**: どちらもケースごとに決まった message との完全一致を assert しているので、ガードの証明になっています。
- **生成モジュール**: 拒否（`REFUSAL`）と composer 経由の許可を並べているので、origin ガードの陽性対照があります。`git push` も、grant の前は deny、後は通過で、件数 2 から 3 の増分まで確かめています。ガードの証明になっています。
- **fetch**: 引き金が無かったことの証明にとどまります（4節の A9-1）。
- **usage の `山田`**: 終了コード 2 が同時に出ているので、ガードの証明になっています。

## 6. 添付だけでは判定できなかったこと

- helper の本体（`harness`・`h.run`・`proposed`・`privateLines`・`fold`・`claude`）
- VALID / INVALID の表
- README・CI・package.json
- 生成される `register.test.ts` の中身
- 本物のエンジンのイベントの形と、自作の `$` 代役との一致

**VERDICT: PASS（high 0件・medium 3件。M2 と L3 は処置表の記述より範囲が狭く、M1・M4・M7 ほか多数の行は判定できない）**
