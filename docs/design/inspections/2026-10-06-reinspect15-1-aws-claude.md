# kokoro-mods 第15回再検品 — chunk 1（matcher）

## 処分表の各行

| 行 | 判定 |
|---|---|
| High-1 | **実装済み。** `tight` は "and" でも区切ります。`PUBLISH_OBJECT`、`IMPERATIVE_WAIVER`、`EXPLICIT_WAIVER`、`habit`、`okTag` は `tight` を見ます。`PERMISSION`、`QUESTION`、`REPORTED` は今も広い `clause` と `trimmed` を見ます。"Just push without asking and I'll check it afterwards" を手で追うと、`tight` は「Just push without asking」で、`IMPERATIVE_WAIVER` に当たり、habit にはならず、prohibited も偽です。結果は waiver になります。テストも2文追加されています。 |
| Medium-1 | **ほぼ実装済み。** §5.4a に2つの範囲が書き分けられました。ただし first-person habit が tight 側で読まれることが書かれていません（Low-1 として下に記載）。 |
| Low-1 | **実装済み。** `PUBLISH_OBJECT.test(tight)` に変わり、"run the linter … and push" の否定テストもあります。 |

## 残る指摘

**High-1：けどの後に「、」が無いと、新しく足した「後でいい」で門が外れる**
- ファイルと関数：`src/match.mjs`、`publishPolarity` と `asksBeyondWaivers`。原因は `CLAUSE_SPLIT`、`CLAUSE_SPLIT_TIGHT`、`CLAUSE_PARTS` です。
- 問題：今回の fold で `PUBLISH_WAIVER` に「(は|も)?(後|あと)で(いい|…)」が入りました。ところが日本語の逆接「けど・けれど・ですが・だが」はどの区切り記号にも入っていません。
- 例：「レビューは後でいいけど公開は私がチェックしてから」（「けど」の後に「、」なし）
  - 区切りが無いので、`tight` も `clause` も文全体になります。そのため対象語「公開」があると判定されます。
  - `PERMISSION` は「いい(?=けど)」で一致し、`prohibited` は偽です。結果は `waiver=true` になります。
  - unlessText に残る「チェック」は、`PUBLISH_ASK` の `check\s+with\s+me` に当たりません。
  - `asksBeyondWaivers` では文全体が1つのまま空白化され、core が空になって false を返します。
  - その結果、門を求める普通の文で門が落ちます。「、」を入れると逆に waiver が無視されて門が残るので、句読点の有無だけで結論が反転します。
- 修正案：`けど|けれど(?:も)?|ですが|だが` を3つの区切り正規表現すべてに加えます。あわせて、日本語版の回帰テスト「〜は後でいいけど公開は私が…してから」（「、」あり・なし両方）を足します。

**Medium-1：waiver が先・公開動詞が "and" の後ろにある形を失う**
- ファイルと関数：`publishPolarity` の `PUBLISH_OBJECT.test(tight)`。
- 問題："Don't ask me and just push." や "No confirmation needed and push freely." は、`tight` が「Don't ask me」だけになります。このため waiver そのものが無視され、門が残ります。前回までは waiver でした。
- §5.4a は "linter … and push" の例でこの原則を受け入れ済みなので、重大度は medium です。
- 修正案：`tight` に対象語が無い場合でも、直後の "and" 節が `^\s*(?:just\s+)?(?:push|publish)\b` で始まるなら、その節で対象語を探します。

**Low-1：§5.4a の範囲の記述が足りない**
- ファイル：§5.4a（設計文）。
- 問題：first-person habit が tight 側で読まれることが書かれていません。
- 修正案：tight の列挙に「the first-person habit」を加えます。

**Low-2：設計文と英語パターンの食い違い（今回の fold 以前から）**
- ファイル：`EXPLICIT_WAIVER`。
- 問題：英語の分岐は節末に固定されていません（"do not ask" は `\b` で終わるだけ）。一方 §5.4a は "must end the tight clause" と書いています。
- 修正案：英語の分岐に `(?=\s*$)` を付けるか、設計文で英語を除外します。

## 漏えい経路

今回の差分で増えた出力はありません。追加されたエラー文もありません。manual の文面が plugin/**、metrics export、stdout、stderr へ出る新しい経路は見当たりませんでした。`evidence.quote` と `matched` が bundle に入るのは以前からの設計です。

## 添付から判断できなかったこと

- catalog の publish-guard の triggers 本文。High-1 の例文がそもそも hit することは、テストにある既存の陽性例「私のPCで私がチェックしてから公開」からの推定です。
- テストが実際に緑かどうか。
- High-1 の fold の英語2文が `asksBeyondWaivers` の残り部分（"and I'll check it afterwards"）で trigger に当たらないかどうか。これは trigger の中身次第です。
- 否定テストのリストの「Same section as the positives」以外の判定方法。
- export と plugin 側のコード。

**VERDICT: FAIL（high 1件）**
