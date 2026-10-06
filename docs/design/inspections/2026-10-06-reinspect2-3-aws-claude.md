# kokoro-mods 再々検品：matcher テスト（a91675c..HEAD、fold 後）

添付の2ファイル（`r2-match-test.diff` と disposition 表の 1・3）だけで判断しました。

## 1. disposition 表の各行は実装されているか（表3）

- **H-1：実装済み。** 次の3点を確認しました。
  - trigger を言語（`trigger.lang`）と読むセル（`cellsOf(line, trigger.cell)`）で絞っている。
  - `unless` を持つ recipe は、`unless: []` にすると提案が1件出ることを確かめている。
  - publish-guard は、`publishPolarity` が「waiver あり・request なし」と判定することを確かめている。
  - ただし publish-guard の前提条件には穴があります（M-A）。
- **H-2：実装済み。** 日英の両方で、別の対象を名指しした字数制限から `max_chars` が 0 になることを見ています。境界は filler 11 で 200、12 で 0 です。narrow trigger 表にも否定例が入っています。
- **M-1：実装済み。** 「Avoid pushing without confirmation」が confidence high の側に入っています。
- **M-2：実装済み。ただし弱い（M-B）。**
- **M-3：一部だけ実装。**
  - `pushは確認しない` と `Do not ask before you push.` は waiver として入っています。
  - 「pushの許可なし」は添付のどこにもありません。
  - 「test says so」と書かれていますが、DESIGN §5.4a を指すコメントがテストにありません。
- **M-4（TypeError のメッセージ）：添付では確認できません。** 行番号だけを含むことを確かめる assert が diff にありません。別の diff テストファイルにあるなら、そのファイルが必要です。
- **M-5：実装済み。**
  - `veto.lastIndex = 7` の g 付き regex を直接使うと、`test` が lastIndex を 0 に戻すので `lastIndex === 7` の assert が落ちます。
  - 同じく直接使うと `'veto needle'` が7文字目から探されて一致せず、抑止されないので失敗します。
  - セルの範囲は、`veto | needle`（提案あり）と `other | veto needle`（抑止）の対で見ています。
  - `probeRecipe` の定義は添付にありません。
- **L-1〜L-3：実装済み。**
  - L-1：`stripLeadingLookbehinds` と、`\b` または `(?<![\d|\w` の直後に `[\d` が続く形の規則。
  - L-2：`'   '` は rejected、`undefined` と `null` は fallback。
  - L-3：publish-guard の `unless` が `[]` であることの assert。
- **L-4：DESIGN の記載は添付が無く確認できません。** 許可リスト側のテストはあります。

## 2. 表1（matcher）をテストが裏付けているか

- H-1〜H-4、M-1、M-2、M-3（コメント修正）、M-4（version）、L-1〜L-3 には、それぞれ対応するテストがあります。
- 薄い点：
  - H-2 の否定のパターンは「じゃない」と「isn't」だけです。「OKではない」「is not ok」「not fine」がありません。
  - M-2 は「token」だけで、「book」がありません。

## 3. fold による退行と、手記の文字が外へ出る新しい経路

- **新しい経路の候補（M-C）：** version の検査が `1.2.3-rc.1` を通します。semver の prerelease 部分は英数字なら何でも入るので、手記 frontmatter の version に書いた文字がそのまま plugin/** へ写る可能性があります。
- **確認できない点：** `publishPolarity` が export され、手記の文字を半分隠しただけの `unlessText` を返します。CLI、metrics、ログがこれを出力していないかは、添付では分かりません。
- **退行の候補（L）：** narrow trigger 表で、respect-stop-signals の正例が「終わりを出したら止めて。」から「終わりの合図を出したら止めて。」に差し替わっています。旧文が提案を出さなくなった（取りこぼしが増えた）可能性がありますが、表1にも表3にもこの変更の記載がありません。

## 4. 否定例は「抑止の仕組み」を証明しているか、「trigger が無いこと」だけか

- **仕組みを証明している：**
  - `unless` を持つ recipe への `assertSuppressed` 全般（counterfactual があるため）
  - lastIndex の probe
  - `ぼかし字数` 系の derive が 0 になる例
  - 鏡像の行2（左セルの request が読まれないこと。右セルなら提案が出る対がある）
- **trigger が無いことしか示していない：**
  - offer-options の `Give me a single option.` と `一案だけにして`（コメントで自認済み）
  - quiet-confirmations の最初の6件（「positive pair で証明」と書いてあるが、対が揃っていない → M-D）
  - 鏡像の行3（M-B）
- **publish-guard の否定例：** 前提条件は `publishPolarity` 自身の判定なので、自己参照で counterfactual になりません（M-A）。

## 5. 残っている指摘

| 重要度 | file / 関数 | 問題 | 修正案 |
|---|---|---|---|
| medium (M-A) | test/match.test.mjs `assertSuppressed`（publish-guard の分岐）と polarity テスト | 正例は全部 `section: 'boundaries'` で、否定例は section なしです。section や confidence で提案が止まる場合、waiver が働いていなくても否定例が通ります。前提条件は「waiver なら提案しない」の反実仮想になっていません。 | 否定例の profile を正例と同じ section にそろえる。waiver ごとに、waiver 句だけを除いた最小対の文で `matchRecipes` が1件を返すことを、同じ関数の中で assert する。 |
| medium (M-B) | 「judged per trigger cell」テストの鏡像の行3 | `["Don't push without asking.", 'Publish without confirmation.', null]` を `deepEqual []` で見ています。右セルで trigger が一致しなくても通ります。 | null の行は `assertSuppressed(recipe, profile)` で判定する（行4の `'other'` は除く）。 |
| medium (M-C) | src/match.mjs `buildBundle` の version 検査と、`buildBundle` のテスト | prerelease / build の部分が任意の英数字を通します（例：`1.0.0-adhd`、`1.0.0-alice`）。Appendix A の語も検査されずに plugin/** へ写ります。 | 形を `^\d+(\.\d+){0,2}(-(alpha\|beta\|rc)(\.\d+)?)?$` に限定する。`1.0.0-adhd` と `1.0.0+x` が null になる否定例を追加する。 |
| medium (M-D) | 「quiet-confirmations never fires」テスト | 否定例のうち3件に最小対の正例がありません。`Never skip the confirmation before deleting` の正例は目的語が違います。`Do not drop…` と `省かないで` には正例がありません。trigger 自体が一致していない可能性を排除できません。 | `Skip the confirmation before deleting`、`Drop the routine confirmations`、`念のため確認を省いて`、`確認を減らしたりして` を `length 1` の側に追加する。 |
| low | limits テスト | 返答語と字数のあいだに別の目的語が挟まる形（`返答に含めるコメントは50字以内`）が未検査です。12字窓の規則では誤って derive する可能性があります。 | expected 0 の行として追加する。 |
| low | polarity テスト | M-3 の「pushの許可なし」が無く、§5.4a へのコメントもありません。 | waiver 側に追加し、根拠のコメントを付ける。 |
| low | polarity テスト | 否定形の permission が2形しかありません。`ok` の境界も「book」が未検査です。 | 「OKではない」「is not ok」「not fine」と `book` を追加する。 |
| low | 鏡像 / probe | lastIndex の probe は `unless` だけを見ていて、言語の違う `unless` が適用されないことを検査していません。 | `lang: 'ja'` の veto が en の profile では効かない例を追加する。 |

## 6. 添付だけでは判断できなかったこと

- src/match.mjs 本体（`publishPolarity` の節の切り方、12字窓の数え方、version の正規表現）。
- `probeRecipe` と CASES の否定例が `assertSuppressed` を通っているか。
- M-4（TypeError）のテスト。
- DESIGN §5.4a（L-4、M-3 の根拠）。
- `unlessText` や assert メッセージが CLI / metrics / stderr に出ないこと。
- expert-role-with-evidence で「I’m a professor, so answer as a specialist.」を抑止するのが仕様どおりか（recipe の定義が無いため）。
- respect-stop-signals / block-ahead-warning / lead-with-answer の trigger を狭めた変更の disposition（chunk B の表が無いため）。
- テストの実行結果。

**VERDICT: PASS（high 0件・medium 4件）**
