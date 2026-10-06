# kokoro-mods 第9回再検品：chunk 2 カタログ（`src/catalog/index.mjs` 5e4b216..34d286f）

## 処理表の各行の照合

| 行 | 判定 | 根拠 |
|---|---|---|
| H1 | 実装されている | unless の動詞群に `減らす` `省略(?:する\|し)` `なくす\|なくし` が入り、`JA_VERB_NEGATED` の `(?:る)?(?:の\|こと)(?:は\|を)?(?:やめ…)` が「のはやめ」「ことはしないで」に当たる。trigger に `省略` を追加し、陽性テストもある。ただし「念のため確認をなくすのは禁止」のテストは素通りで、unless の検査になっていない（L-2）。 |
| H2 | 実装されている | `my (?:ok\|okay)` と `(?:I\|we)(?:['’]m\| am\| are) (?:ok\|okay\|fine) with` が入った。 |
| M1 | 実装されている | 逆接の分岐に `が(?=、)` が入った。`[^。！？、]*` の分岐は「、」を越えないが、逆接の分岐が拾う。 |
| L1 | 実装されている | `confirm\w* (?:with\|by) (?:me\|the user)` は lookbehind を持たないので、CI 除外を越えて当たる。 |
| L2 | 実装されている | was/were を unless・until・before 側と without 側の両方に入れた。陰性テスト「the tests were confirmed green」もある。 |

## 残る指摘

**H-1（high、今回の修正による退行）** `quiet-confirmations` の ja trigger。
- 問題：今回 trigger に `省略` を足したため、名詞の「省略」を禁じる普通の文に recipe が付く。
  - 「確認の質問の省略は禁止です」：以前はどの動詞も当たらなかったが、今は `省略` が当たる。`JA_VERB_NEGATED` は「は禁止」を「の／こと」から始まる形でしか見ない。
  - 「念のため確認の省略はやめてください」「念のため確認の省略はしないでください」：`やめ` や `しないで` で当たる（修正前からの穴）。
  - unless の動詞群は `省略(?:する|し)` だけなので、名詞の形を打ち消せない。
- 修正案：unless に `省略(?:は|を)?(?:やめ|しないで|控え|禁止)` を足す。trigger の `省略` の否定先読みにも `(?:は|を)(?:やめ|しないで|控え|禁止)` を足す。陰性テスト3文を追加する。

**H-2（high、今回の修正による退行）** 同じ trigger と unless。
- 問題：「念のため確認は省略せずに行ってください」は、新しく入った `省略` で当たる。設計文の否定は「ない／ません／るな／の・こと…」だけで、「ず（に）」を含まない。unless の `省略(?:する|し)` も「せず」を拾わない。
- 同じ仕組みで「省かずに」「やめずに続けて」も recipe が付くはず（修正前からの穴）。
- 修正案：`JA_VERB_NEGATED` に `ず(?:に)?` を足す。unless に `省略せず` を足す。陰性テストを追加する。

**H-3（high）** `publish-guard`、unless・until・before の regex。
- 問題：今回の修正は ok/fine だけを列挙した。次のような普通の文で gate を失う。
  - 「Don't push until I'm happy with it」
  - 「Never push unless it's OK with me」
  - 「until I'm satisfied」
- 修正案：述語を `(?:ok|okay|fine|happy|satisfied|comfortable)` にする。`(?:it['’]s|it is) (?:ok|okay|fine) (?:with|by) me` も足す。陽性テストと陰性テストの組を足す。

**M-1（medium）** 同じ regex。
- 問題：「unless we're OK with it」が漏れる。`['’]re` が無い。
- 修正案：`(?:['’]m|['’]re| am| are)` にする。

**L-1（low）** without 側の regex。
- 問題：L1 の `confirmed by me` を写していない。「Never push without the build being confirmed by me」が CI 除外で落ちる。
- 修正案：同じ分岐を without 側にも足す。

**L-2（low）** `test/match.test.mjs`。
- 問題1：「念のため確認をなくすのは禁止」は trigger に当たる動詞が無く、テストが素通りで成立する。unless を検査していない。
- 問題2：「until it was confirmed by me」は lookbehind が働かないまま一般の `confirm\w*` で当たるので、L1 の分岐を通っていない。
- 修正案：前者は「念のため確認は不要だが、なくすのは禁止」のように trigger に当たる文に変える。後者は「until the tests were confirmed by me」に変える。

**L-3（low）** unless の否定分岐。
- 問題：「確認の質問は省略しないと進まない」（条件文）も打ち消され、recipe を失う。
- 修正案：`ない(?!と)` にする。

## manual の文章が外へ出る経路

今回の差分は regex とテストだけで、出力・ログ・export に触れていない。新しい経路は見当たらない。

## 添付から判断できなかったこと

- `JA_VERB_NEGATED` の全文。「ず」を含むかどうかで H-2 の成否が変わる。
- 「ask word anywhere」を判定する第3の regex の語彙。H-3 の文を拾っている可能性がある。
- `publishPolarity` の本体。
- `right()` と `unless()` が行・セルをどの範囲で照合するか。
- 一致した文字列を matcher が stderr やメトリクスに書くかどうか。

**VERDICT: FAIL（high 3件）**
