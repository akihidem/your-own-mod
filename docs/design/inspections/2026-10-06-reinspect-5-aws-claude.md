# kokoro-mods chunk C 再検品（`test/emit.test.mjs`、7b6e003..HEAD）

判断の材料は添付の test diff と disposition 表だけです。`src/emit.mjs`、生成される `register.ts`、`templates/tests.mjs`、カタログの fixture（`recipe()` の title と rule の本文）は添付にありません。そのため、各行が「テストで裏付けられているか」までしか判定できません。

## 1. 「folded」の各行がテストで裏付けられているか

| 行 | 判定 | 根拠 |
|---|---|---|
| M leakNeedles | **一部のみ** | 次の3点は裏付けあり。12字以上は catalog に入っていても needle になる（`title.en = quote` にした上で E_LEAK）。短い非カタログ文は needle になる（`canary-x`）。NFKC と小文字化で1本にまとまる（`['canary-y']`）。一方、`' 確認 '` の行はアサーションがありません。「カタログ由来」「plugin 名由来」の免除も、どちらの経路で免除されたのか切り分けられていません（§3）。 |
| M pluginName | 裏付けあり | §3 を参照。「slug を manual から作らない」（chunk E H1）は添付の外です。 |
| L E_BUNDLE | **裏付け不足** | テストは sha256 だけです。version、confidence、enabledByDefault、params の4項目は検査されていません。 |
| L NFKC と大文字小文字 | 裏付けあり | 大文字のコピーと全角のコピーがどちらも E_LEAK になります。 |
| M 不正な pattern は全拒否 | 裏付けあり | 空リスト `[]` が残っています（§2）。 |
| L BOOLEAN_DEFAULTS | 裏付けあり | 比較相手が manifest ではありません（§2）。 |
| L NUMBER_BOUNDS | 裏付けあり | 4件の clamp を実行して確認しています。 |
| M resetState | **弱い** | 静的な正規表現で照合しているだけで、取りこぼしの経路があります（§2）。 |
| PHRASE_SUFFIX、cwd、composer gate、stop の negative、compose、未テスト項目 | 判定不能 | 対象のコードとテストが添付にありません。 |

## 2. 残る指摘

**M1 ― `emit.test.mjs` の leak-needles テスト：テストの前提が確かめられていない**
- 問題：「`Lead with the answer` は catalog rule に入っている」「`synthetic` は catalog title に入っている」は、コメントで主張しているだけです。fixture にその文字列が無い場合、「12字以上はカタログに入っていても needle になる」というアサーションは、免除の分岐をまったく通らずに緑になります。さらに `synthetic` は plugin 名 `kokoro-mods-synthetic` の一部でもあります。このため `!includes('synthetic')` が通っても、カタログ免除が効いたのか plugin 名免除が効いたのか区別できません。
- 修正案：まずカタログ本文を fold した値に対し、`includes(fold('Lead with the answer'))` と `includes('synthetic')` を assert します。カタログにだけ現れ、plugin 名には含まれない短い語で、カタログ免除の分岐を別に1件立てます。

**M2 ― leak-needles の `' 確認 '` の行：アサーションが無い**
- 問題：「入っていれば免除、無ければ needle」とコメントにあるだけで、どちらの結果も検査していません。前後の空白を削る処理（trim）が効いているかも未確認です。
- 修正案：fixture の ja title に `確認` が入っているかを確定させます。その上で、期待値（needle `確認` か、免除か）を assert します。加えて `' 確認 '` という空白付きの needle が無いことも assert します。

**M3 ― invalid-patterns テスト（`register.ts` の Bash ハンドラ）：空リストで guard が黙って外れる**
- 問題：`[]` は「全部コンパイルでき、どれにも一致しない」状態です。結果として publish guard は全コマンドを素通りさせます。これは今回直した「黙って guard が止まる」不具合と同じ型ですが、テストに入っていません。
- 修正案：`[]` を不正として全拒否するか、許すかを DESIGN §7 で決めます。どちらにしても、`[]` の場合をテストに加えます。

**M4 ― detector-helpers テスト（`resetState`）：取りこぼしと実行順の穴**
- 問題が3つあります。
  - 対象の変数名が手書きのリストです。そのため、新しく増えた module 直下の `let` や、`const x = new Map()`/`new Set()` の中身はリセット漏れを検出できません。
  - `timer?.cancel()` と `timer = ` の順序を検査していません。代入を先にすると cancel は何もせず、前回の timer が動き続けます。
  - `chain = chain` のような意味の無い代入でも照合に通ります。
- 修正案：
  - source から `^let (\w+)` を全件抜き出し、リストと完全一致させます。
  - cancel の位置が代入より前であることを index で比べます。
  - できれば `resetState` を実際に実行し、各変数が初期値に戻ることを検査します。

**M5 ― `E_PLUGIN_NAME` の直後にある E_BUNDLE の検査：テストが1項目だけ**
- 問題：enabledByDefault は BOOLEAN_DEFAULTS の元になる値です。ここに真偽値以外の値（例：`'false'`）が入ると、guard の既定値が崩れる経路になります。
- 修正案：version、confidence、enabledByDefault（`'true'`、`1`、`undefined`）、params（範囲外、型違い）について、それぞれ別の bundle で E_BUNDLE になることを確かめます。それぞれに正例（`doesNotThrow`）も1件付けます。

**L1 ― runtime-options テスト：比較相手が manifest ではない**
- 問題：テスト名は「manifest の既定値に戻る」ですが、実際に比べているのは recipe の `param.default` と `bundle.proposals`です。manifest が proposal の値で既定値を描く場合、表示される既定値と実行時の戻り先がずれても検出できません。
- 修正案：生成された `plugin.json` の userConfig の既定値を parse し、NUMBER_DEFAULTS と BOOLEAN_DEFAULTS が一致することを assert します。

**L2 ― 漏洩の fail-closed テスト：形を変えたコピーでのエラー文が未確認**
- 問題：大文字と全角のコピーでは `code` しか確かめていません。fold してから照合する実装が、一致した部分をエラー文に入れて返しても検出できません。
- 修正案：この2件でも、エラー文が path だけの `'E_LEAK: plugin/.claude-plugin/plugin.json'` と完全に一致することを assert します。

**L3 ― plugin 名テスト：境界の入力が足りない**
- 問題：文字列以外の値（`undefined`、`42`）、末尾の改行付き `'kokoro-mods-me\n'`、`'kokoro-mods-me '` が試されていません。
- 修正案：この3種を negative の入力に追加します。

**L4 ― `leakNeedles` の1文字除外が文書化されていない**
- 問題：disposition は「every quote and matched」なのに、1文字の matched は needles から外れます。quote 側の1文字も外れるのかは決まっていません。
- 修正案：DESIGN §5.5 に明記し、quote 側の1文字の場合もテストします。

**L5 ― invalid-patterns テスト：許可期間中・guard off のときの順序が未確認**
- 問題：publish の許可期間中（`store.get` が未来時刻を返す）と、`publish_guard: false` のときに、不正な pattern をどう扱うかが試されていません。
- 修正案：この2つの場合の期待値を決めてテストします。

**L6 ― 既定の pattern がコンパイルできるかを emit 時に検査しているか不明**
- 問題：カタログが壊れると、Bash を全部拒否する plugin がそのまま出荷されます。
- 修正案：emit 時にコンパイル失敗を E_BUNDLE で拒否し、そのテストを追加します。

## 3. negative ケースは guard を証明しているか

- **plugin 名**：証明しています。毎回まっさらな bundle で名前だけを変えています。正例が3件あるので、ほかの理由で throw した可能性も外れます。
- **不正な pattern**：証明しています。`ls` でも拒否されること、一致しない `ls` が正しい pattern では素通りすること、metrics が `publish-guard:denied` だけになることがそろっています。
- **`'\\-'`**：`u` flag を付けてコンパイルした場合に限り不正になる入力です。この種類の不正を検出できるかどうかは、実装のコンパイル方法次第です。
- **`matchedOnly` の doesNotThrow**：matched の語がカタログに入っていれば、免除を証明しています。fixture が見えないので確定はできません。
- **`synthetic`、`push`**：どちらの免除経路で通ったのか切り分けられていません（M1）。

## 4. 退行と、新たな漏洩経路

- 退行は見当たりません。fixture から `'['` を外したのは、「不正な pattern は全拒否」へ方針を変えたことと整合しています。
- 免除に使う元のテキストは、静的なカタログと、描画前のテンプレートの原文だけであるべきです。描画後の出力や proposal の params を含むと、manual の短い文が自分自身を免除してしまいます。これが生じるかは、添付からは判定できません。
- 拒否文は定数と PLUGIN 名だけで、pattern を返しません。metrics の bump も件数だけで、文字列を含みません。

## 判定できなかったこと

- `leakNeedles` の実装：免除に使うテキストの範囲、trim の有無、部分一致かどうか。
- `leakCheck` の検査対象に、metrics export と stdout/stderr が入っているか。
- fixture のカタログ本文。
- `normalizeOptions` と `resetState` の本体。
- `templates/tests.mjs`（composer gate、stop、compose、A6）。
- chunk E H1、DESIGN §5.5、§6、§7 の本文。

**VERDICT: PASS（high 0件。medium 5件は次の修正で反映してください）**
