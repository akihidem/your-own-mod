# Inspection of W2 (catalog, matcher, diff), round 1

Reviewer: Claude (Opus) on AWS Bedrock via `ask-aws.sh review -r 10e6af2..3bf6e87 -s` on 2026-10-06. Three chunks; items marked 要確認 were verified by the integrator before being folded into `docs/design/prompts/w2-fix-round2.md`. Two further defects found by running the matcher on a real manual (table left-cell polarity for quiet-confirmations; frontmatter key format_version) are in the same prompt.

===== chunk 1/3 =====
# レビュー: `src/catalog/index.mjs`（チャンク 1/3）

前提として、`match.mjs`（unless の効く範囲、`lang` の判定、`hit.text` の形）と emitter 側（テンプレートの置換、params の clamp、phrases の照合方法）はこのチャンクに含まれていません。そこに依存する指摘には【要確認】を付けました。

## 重要度：高

**1. 1 行に「確認不要」と「push は確認」が並ぶと、publish-guard が消える【要確認：unless が行単位で効く場合】**
- 例：「都度確認不要、ただし push は確認して」という行。
  - trigger の 2 本目 `(?:y/n|確認|許可)[^。！？]*(?:push…)` に一致します。
  - 同時に、ja の unless `確認(?:せず|しないで|不要|は不要)` が前半の「確認不要」に一致します。
- `[^。！？]` は読点「、」で止まりません。そのため、ユーザーがよく書く「日常は確認なし／公開は確認」という書き方ほど、ガードが黙って無効になります。
- en の `\bno (?:confirmation|permission) (?:needed|required)\b` も同じです。「No confirmation needed for edits, but ask before pushing」でガードが外れます。
- 安全側の機能が失敗の向きに倒れるので、最優先と判断しました。
- quiet-confirmations と publish-guard は同じ行から同時に有効になってよい組み合わせです。そう扱われることをテストで固定するのが望ましいです。

**2. stop / fragment の phrases を「先頭一致」で照合すると、普通の依頼が打ち切られる【要確認：emitter の照合方法】**
- summary には「入力全体か先頭に一致」と書かれています。この通りなら、次の入力が stop 扱いになり、作業せずに終わります。
  - 「あとで見返せるように要約して」
  - 「終わりの段落を直して」
  - 「wrap up this function into a module」
- `tired`（fragment 側）も「tired of this bug, fix it」の先頭に一致します。ただし fragment 側は max_chars で絞られるので、影響は小さめです。
- 対策案：先頭一致は「語の直後が終端か句読点」に限る。あるいは、短文の上限を stop 側にも掛ける。

**3. lead-with-answer の rule 文が、既定値のままだと意味の通らない指示になる【確信：高。前提は `{max_chars}` が素直に置換されること】**
- 既定の `max_chars: 0` では、次の文がそのまま注入されます。
  > "…within 12 lines and, when 0 is greater than zero, within 0 characters."
- 条件分岐をモデルに委ねている形です。「0 characters」が制約として誤読される余地もあります。
- テンプレート側で節ごと出し分けるべきです。

**4. response-language の言語判定と trigger の範囲が粗い**
- `languageParams` は行の中で最初に出てきた言語名を採用します。
  - 「英語ではなく日本語で返答して」は `en` になります。
  - しかもこの行は ja の unless のどれにも一致しないので、そのまま有効になります。
- en の trigger `\banswer in\b` と `\b(?:respond|reply) in\b` は、言語と無関係な文にも一致します。
  - 例：「answer in bullet points」「reply in under 100 words」「answer in detail」
  - いずれも language 規則が profile の既定言語で有効になります。
- 対策案：trigger の側で直後に言語名を要求する。

## 重要度：中

**5. lead-with-answer の数値抽出**
- `(\d{2,4})\s*(字|chars|characters|words)` は `words` も `max_chars` に入れます。「200 words」が 200 文字になり、単位が合いません。
- trigger の `\d{2,4}\s*字` は「800字以上で書いて」のような長さを求める依頼にも一致します。その結果、簡潔化の規則と `max_chars=800` が付きます。
- 先頭側に境界が無いので、「12345字」からは `2345` を取ります。

**6. `rangeParams` の検査不足**
- 大小の検査がありません。「5〜3案」は min=5, max=3 になります。
- params の範囲（min 2..4, max 2..6）を超える値も、そのまま返します。例：「2〜9案」は max=9。【要確認：後段に clamp があるか】
- 正規表現が「案 / options」に固定されていません。同じ行に「3-5件」などがあると、そちらを拾います。

**7. focus-timer の `(\d{1,3})\s*(分|min)` も同じ型**
- 「2分」は下限 5 を下回り、「999分」は上限 180 を超えます。
- 「1200分」からは `200` を拾います。
- 休憩と無関係な「30分で終わる作業」も拾います。

**8. ja の trigger が広すぎて誤って有効になる（manual の行を広く走査する前提）【確信：中】**

| recipe | 広すぎる pattern | 誤って一致する例 |
|---|---|---|
| block-ahead-warning | `認証` | 「認証情報は読まない」 |
| session-resume-brief | `切替\|切り替え\|読み直` | 「ブランチを切り替える」 |
| respect-stop-signals | `あとで\|終わり` | 普通の文の中の語 |
| focus-timer | `休憩\|タイマー` / en `timer` | 休憩・タイマーに触れただけの文 |
| offer-options | en `alternatives` 単独 | alternatives を含む任意の文 |
| publish-guard | `公開` | 「非公開」「公開鍵」 |
| receive-only-fragments | `受け取って` | 「ファイルを受け取って」 |
| running-indicator | `can't tell if` | 進捗と無関係な文 |

**9. accept-typos の en unless が広すぎる**
- `please fix` は誤字と無関係な依頼でも一致します。
- 例：「Please fix failing tests; don't correct my typos」では、本来の希望（誤字を直さない）が消えます。

**10. 他ファイルとの前提の整合【要確認：match.mjs】**
- `^` で始まる unless が 3 か所あります（accept-typos、no-psych、publish-guard の en）。`hit.text` が Markdown の箇条書き記号（`- `）や前置きの空白を含むと、一度も一致しません。
- `lang: 'any'` を使っているのは publish-guard の unless だけです。matcher が `'any'` を扱っているか確認が必要です。
- 「push」のような英単語が混じる日本語の行で、ja と en のどちらの pattern 群が使われるかも確認が必要です。

## 重要度：低 / 設計・簡素化

**11. `Respond in {language}` に `ja` / `en` が入る**
- そのまま「Respond in ja」になります。`Japanese` / `English` に写してから埋めた方が確実です。

**12. publish-guard の ja summary に範囲の限界が書かれていない**
- en summary は「他のツールや内部で公開するスクリプトは対象外」と明記しています。ja には無く、日本語のユーザーには限界が見えません。
- 既定の patterns が拾わない操作もあります。設計上の割り切りなら、明記が要ります。
  - `git -c k=v push`、`git --git-dir=… push`
  - `gh pr merge`、`gh api` での書き込み
  - `docker push`、`cargo publish`

**13. 簡素化の余地**
- 左セルの trigger だけ object を直書きしています。`left(lang, ...)` の helper を `right` と対にすると揃います。
- `unless()` helper は lang を付けるだけです。今のままでも問題ありませんが、`right` との違い（cell を持たない）を一言コメントに残すと意図が伝わります。

**判断に足りない情報**
- unless の効く範囲（同じ hit だけか、行全体か、recipe 全体か）
- deriveParams の結果を params の min/max で clamp するか
- テンプレート置換で数値 0 をどう扱うか
- `hit.text` の正規化（trim、箇条書き記号の除去）

これらが分かれば、1・2・6・7・10 の確度を確定できます。
===== chunk 2/3 =====
# レビュー結果: チャンク 2/3（`src/diff.mjs`・`src/match.mjs`・`test/diff.test.mjs`）

コードは書き換えていません。テストも実行していません。下の全文だけを読んで判断しました。重要度の高い順に並べています。

## 中程度（直すことを推奨）

**1. `enabledByDefault` が順位で決まるため、`diffProposals` が無関係なレシピまで「変更」と出す**
- 対象: `match.mjs` の `matchRecipes` 末尾、`diff.mjs` の `FIELD_ORDER`
- `enabledByDefault` は `index < maxEnabled` で決まります。つまり全体の順位で決まります。
- 例えば、確かさ `high` のレシピが1件増えたとします。すると、それまでちょうど `maxEnabled` 位にいた別のレシピが押し出されます。そのレシピ自体は何も変わっていないのに `changed [enabledByDefault]` と表示されます。
- テスト「a one-section revision reports exactly its added, removed, and changed recipes」は手作りの proposal を使っていて、`matchRecipes` の出力を通していません。そのため、この連鎖は検出できません。テスト名が実際の挙動より強い主張になっています。
- 対策の候補は2つです。
  - `enabledByDefault` の差分を「順位の変動による変化」として別扱いにする。
  - `matchRecipes` の実出力を使って、1節だけ改訂した場合の差分テストを追加する。

**2. `buildBundle` の `notMatched` が全体カタログ `RECIPE_IDS` を基準にしており、`matchRecipes` に渡した `recipes` とずれる**
- `matchRecipes(profile, recipes = RECIPES)` はレシピの一部だけでも受け付けます。一方、`buildBundle` は常に全体の `RECIPE_IDS` との差を `notMatched` にします。
- 一部のレシピだけで照合した場合に起きること:
  - 評価していないレシピまで「照合したが外れた」として `notMatched` に載る。
  - カタログに無い id の proposal は、どこにも現れない。
- 対策の候補: `buildBundle` に評価対象の id 一覧を渡す。または、「この関数は全体カタログ専用」とコメントに明記する。

**3. `slugFor` が日本語（ASCII 以外）の名前をすべて `'profile'` に潰す**
- `[^a-z0-9]+` で ASCII 以外の文字を全部取り除くので、`ことりの取説` のような名前は `'profile'` になります。
- このツールは `ja` 表示や `kokoro`/`torisetsu` 形式を前提にしています。名前が日本語だけのプロフィールは、どれも同じ slug になります。`pluginName` もこの slug から作られているなら、プラグイン名が重複します（`pluginName` の作り方は他チャンクにあるため未確認）。
- 全角の英数字（`ＡＢＣ`）も消えます。先に `normalize('NFKC')` をかければ救えます。
- 重複を避けたいなら、slug を作れなかった時に `sha256` の先頭数文字を付ける方法があります。
- 細かい点: `name: ''` は `||` によって無視され、frontmatter の名前に切り替わります。おそらく意図どおりです。

**4. 空文字に一致しうるパターンは、後ろにある本当の一致を取り逃す（確信は中程度）**
- `hitFor` は `exec` が返す最初の一致の長さが 0 なら捨てて、そのセルを諦めます。
- 例えば `/\d*/` は `"max 3 lines"` に対して位置 0 で空文字に一致します。その結果、後ろの `3` は拾われません。
- カタログにこの形のパターンがあるかは、`catalog/index.mjs` が見えないため確認できていません。無ければ実害はありませんが、そうしたパターンは書けない（書いても一致しない）ことを明記しておくと安全です。

## 低（気づいた点）

**5. メモリ上の bundle と JSON から読んだ bundle を比べると、偽の差分が出る可能性（推測）**
- `isDeepStrictEqual` は `{a: undefined}` と `{}` を別物として扱います。
- `paramsFor` は `structuredClone(spec.default)` を使います。そのため、`default` が無い（`undefined` の）パラメーターがあると、メモリ上では値が `undefined` のキーとして残ります。JSON を経由した側ではそのキーが消えます。結果として `params` が変わったと誤判定されます。
- `-0` と `0` も、strict な比較では別物になります。
- これが起きるのは、カタログに `default` の無いパラメーターがある場合だけです。カタログの中身が無いため判断できません。

**6. evidence が先頭3件までしか保存されない**
- 4件目以降の引用が増えても減っても、差分には一切出ません。
- 一方、文書の前の方に新しい一致行が入ると、3件枠が押し出されて `evidence` の変更として出ます。
- 仕様の範囲内ですが、diff のドキュメントに一言あると利用者が誤解しません。

**7. `quote` が `line.raw` そのもの**
- 箇条書きの記号を `-` から `*` に変える、行末の空白を変える、といった意味の変わらない編集でも `evidence` 変更になります。
- `raw` に記号が含まれるかは、パーサーが見えないため不明です。

**8. 「プロフィールを変更しない」というドキュメントの約束が、浅いコピーでしか守られていない**
- `hitFor` は `{...line}` で浅くコピーしています。そのため、`line` の中にある配列やオブジェクトは元のプロフィールと共有されたままです。
- さらに、`deriveParams(hits, profile)` には `profile` 本体がそのまま渡されます。
- カタログが内部コードなので実害は小さいですが、`matchRecipes` が強制しているのではなく、レシピ側の規律に依存しています。

**9. 1行あたりのパターンの扱い**
- 否定パターン（`unless`）は、行の種類が `row` でも `cell` 指定を見ずに行全体（`line.text`）で判定します。そのため、左のセルにある否定語が右のセルの一致も止めます。コメントの意図（言語をまたいだ否定）と合っていれば問題ありません。
- `exec` は呼び出しのたびに正規表現を作り直しています。「行数 × トリガー数」回コンパイルされます。`lastIndex = 0` に戻すだけでも、状態が持ち越されない点は同じく防げます。性能が問題になる規模でなければ今のままで構いません。

**10. `paramsFor` は数値を範囲に収めるだけで、整数に丸めない**
- `max_lines` のように整数であるべきパラメーターに、`deriveParams` が 3.5 を返すとそのまま通ります。
- `spec` に整数かどうかの情報があるかは不明です。

**11. 同じ `recipeId` が重複した場合の扱いが無い**
- `diffProposals` は `Map` を使うので、重複は後の方が勝ち、黙って1件に潰れます。入力の不正を知らせないままになります。

## テストについて（`test/diff.test.mjs`）

- **日本語の見出しの検査が効いていない**: `assert.match(text, /追加|削除|変更/u)` は、`変更なし` にも一致するので必ず通ります。項目の訳（`設定`・`引用` など）も検査されていません。行ごとに完全一致させる方が確実です。
- **該当なしの表示が未テスト**: 空のリストのときに出る `none`/`なし` を通るケースがありません。
- **部分文字列を数えている**: 「各 id を1回だけ表示」の検査は `split(id)` で文字列の出現回数を数えています。id 同士が部分文字列の関係になると（`publish-guard` と `publish-guard-strict` など）壊れます。今の id では問題ありません。
- **`matchRecipes` の実出力を使っていない**: 1件目の指摘と同じく、diff のテストは手作りの proposal だけで書かれています。`matchRecipes` → `diffProposals` の結合テストが無いため、「1節の改訂で、その節の分だけが出る」という主張は確かめられていません。

## 判断に足りない情報

- `catalog/index.mjs` のレシピの形:
  - `unless`・`triggers[].lang/cell`・`sections` が必ずあるか
  - `params` の `default`/`type`/`min`/`max`/`options`/`multiple`
  - 空文字に一致しうるパターンの有無
- `profile.language` が取る値: `mixed` のような値があると、`lang` が `any` のトリガーしか動きません。
- DESIGN §5.1 と §5.4 の Profile・Bundle の定義、`line.raw` に記号が含まれるか、`pluginName` を `slugFor` から作っているか。
- `test/match.test.mjs` で上の 2・4・10 番がテストされているか（他チャンクです）。
===== chunk 3/3 =====
# test/match.test.mjs レビュー（3/3 チャンク）

テストファイルの本文だけを読んで判断しました。`src/match.mjs` と `src/catalog/index.mjs` は見ていないため、カタログ側の内容によって結論が変わる指摘には「要確認」と付けています。コードは変更していません。

## 重要度: 高〜中

**1. 禁止語テストに、過剰に厳しい部分と抜けている部分がある**
- **過剰に厳しい（確実）:** `ADD` に `i` フラグが付いているため、英語の普通の単語 "add" にも一致します。今テストが通っているのは、たまたまカタログの文に "add" が無いからです。将来 "Add a note…" のような文を書いた時点で、誤って赤になります。`ADD`・`ASD`・`HSP`・`IQ` だけは大文字小文字を区別して照合する必要があります。
- **抜けている:** このツールは `language: 'ja'` が既定なのに、日本語の語（発達障害・自閉症・うつ病・医師・カウンセラーなど）がひとつも入っていません。ja の文は実質的に検査されていません。
- **黙って通る（確実）:** `Object.values(translated)` は、`{ja, en}` ではなくただの文字列が来ると1文字ずつに分けてしまいます。1文字では複数文字の語に一致しないので、必ず緑になります。値がオブジェクトであることを先に assert する必要があります。

**2. "words" を文字数（`max_chars`）として扱っている（設計上のバグをテストが固定している）**
`'Brief, 123 words.'` から `{ max_chars: 123 }` を期待しています。123語は英語でおよそ600〜700文字なので、利用者が求めた長さの5分の1程度に縮めてしまいます。`'Keep it short: 600 words.'` も同じです。対応は、語数を文字数に換算するか、"words" を導出の対象から外すかのどちらかです。

**3. 否定ケースが、`unless` が効いていることを証明していない**
`polarity negative` と `required unless cases` は「そのレシピが一致しない」ことしか見ていません。そもそもトリガーが当たらない文なら、`unless` が無くても緑になります。
- 例（推測）: `'Do not log context switches.'` は、トリガーが `\bcontext switch\b` なら "switches" に当たりません。
- 対策: 各否定文について `{...getRecipe(id), unless: []}` では一致することを先に assert すると、`unless` が実際に止めていることが保証されます。

**4. 根拠として引用されない行から params が作られている**
`later explicit derivations … beyond the evidence cap` では、4行目の `200 chars` が `max_chars` になっています。しかし `evidence` は先頭3行で打ち切られるので、その行は引用に出てきません。最後のテストが掲げる「提案は必ず原文の行を引く」原則と、値の出どころの点で食い違います。
- 案A: params の出どころとなった行を、上限とは別に必ず `evidence` に含める。
- 案B: params ごとに出どころの行番号を持たせる。

**5. `slugFor` が日本語のタイトルではほぼ常に `profile` になる**
- 主な利用者は日本語のタイトルを書くはずなので、大半のバンドルが `kokoro-mods-profile` という同じ名前になります。複数プロファイルを入れると衝突する懸念があります。
- `name: '---'` の時に frontmatter の名前（`front-matter`）へ順に戻らず、いきなり `profile` になります。上位の候補が正規化で空になったら次の候補へ進む方が自然に見えます。意図した仕様なら、その理由をコメントで残してほしいところです。

## 重要度: 中〜低

**6. ランキングのテストが「上限を適用した evidence 件数」を実際には試していない**
上限（4件→3件）に当たるのは `focus-timer` だけで、これは low の単独順位なので並び順に影響しません。同じ確信度の中で、たとえば5件ヒットと3件ヒットが同順位になりカタログ順で決まる、というケースが無いため、テスト名が主張している性質を検証していません。また期待する並び順は、`receive-only-fragments` の sections に `care` が含まれる、などのカタログの中身に暗黙に依存しています（要確認）。

**7. `unless` の `lang` の扱いがトリガーと食い違っている可能性（確信なし）**
`rejected` のケースでは、プロファイルが `en`、`unless` が `lang: 'ja'` なのに抑止されることを期待しています。一方トリガーは、`lang: 'en'` を ja のプロファイルに当てると一致しないことをテストしています。
- 意図的なら（`unless` は言語に関係なく安全側に倒す）、その理由をコメントで残してほしいです。
- そうでなければ、このテストは「別のセルを見ている」と「言語を無視している」の2つを1件に混ぜていて、片方が壊れても気づけません。

**8. `confidence` のテストが `matchRecipes(profile)[0]` を使っている**
`'Answer first.'` に別のレシピが確信度の高い順で先に一致すると、無関係な理由で落ちます。他のテストと同じく `find(item => item.recipeId === 'lead-with-answer')` にした方が安全です。

**9. en トリガーの `\b` 検査が弱い**
`source.includes('\\b')` は、どこか1か所に `\b` があれば通ります。`/\bfoo|bar/` のように、選択肢の片方にしか境界が付いていない形を見逃します。`lang: 'any'` のトリガーは検査の対象外です。

**10. 範囲の導出で `min ≤ max` を検査していない**
`5〜3案` のような逆向きの範囲や、上限・下限への切り詰めの後で `min > max` になるケースがありません。また区切り文字のループは `proposal` が見つかったかを assert していないため、見つからない時は TypeError で落ち、失敗の理由が分かりにくくなります。

## 重要度: 低（設計メモ・判断に足りない情報）

**11. 手書きのパーサー契約がずれていく危険**
`profileFrom` は、パーサーの出力の形（`raw`、`left`/`right`、`inExample`、`'unknown'` の section を `sections` から除くこと）を手で再現しています。実際のパーサーの出力と照らし合わせるテストが、このチャンクには見当たりません。他のチャンクで担保しているか確認してください。

**12. 判断に足りない情報**
- `src/constants.mjs` は変更ファイルの一覧にありません。`DEFAULT_MAX_ENABLED` と `SECTION_KEYS` が変更前の時点で存在しているか確認が必要です。
- CASES で使っている section（`weak`・`focus`・`decision`・`about` など）が `SECTION_KEYS` に含まれているかを検査していません。
- ランキングのテストは `DEFAULT_MAX_ENABLED ≤ 6` を暗黙の前提にしています。

**13. その他の細かい点**
- boolean の params は導出では一切変えられない仕様になっています。将来 boolean を導出したくなった時の拡張点として、意図をコメントで残してほしいです。
- `buildBundle` は `sha256: ''` を検査せずに受け入れています。
- `bundle.proposals` は呼び出し元と同じ配列を共有するので、後から書き換えると bundle 側にも反映されます。これはテストが意図的に固定している挙動ですが、変更されうる参照を共有している点は注意が必要です。

## よくできている点

- `lastIndex` が保たれることと、空の正規表現で一致しないことの検査
- 入力の行を逆順にしても行番号順に並べ直し、元の入力を書き換えないことの検査
- 共有されている既定値の配列を壊さないことの検査
- `C:\` 形式のパスからファイル名だけを取り出すことの検査

これらは良い回帰テストです。
