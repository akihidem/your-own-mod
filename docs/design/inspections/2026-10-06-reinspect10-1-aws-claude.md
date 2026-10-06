# kokoro-mods 第10回再検品 — chunk 1(matcher)

## 処置表の各行

| 行 | 判定 | 根拠 |
|---|---|---|
| H-1 | **実装されている** | `hitFor` は `lang` が `any` か profile の言語に一致する trigger を `publishPolarity` に渡している。`asksByTrigger` は、`PUBLISH_WAIVER` を含まない文で trigger に一致するものがあれば `asking` にする。`publishConflict` によって confidence は medium に下がり、テストもそれを確認している。ただし後述 L-A のとおり、テストの3例中2例は新しい仕組みがなくても通る。 |
| M-1 | **実装されている** | `WHETHER` は waiver より前の同じ節だけを見る。`かどうか` は述語の位置(lookahead)のときだけ疑問として数える。`QUESTION` から `i` フラグが外れたが、残りは日本語だけなので影響はない。 |
| L-1 | **実装されている** | `PUBLISH_OBJECT` の2つの形の両方に「切」が入り、テストもある。 |
| L-2 | **実装されている** | 「いいよ」「OKだよね」が waiver の一覧に入った。どちらも末尾が `か` ではないので、`QUESTION` には当たらない。 |

## 残る指摘

**M-A(medium)** `src/match.mjs` / `publishPolarity` の `asksByTrigger`
- **問題**: trigger を当てる単位が「文」になっている。waiver の句を含む文はまるごと除外される。そのため、同じ文の別の節にある gate の依頼は、`PUBLISH_ASK` か `PROHIBITION` に当たらない限り拾われない。「、」「, but」で2つの節を1文につなぐ書き方はよくある。
- **例**: 「pushは私がいいと言ってから、イシューは確認なしで立てていい。」や "Wait for my go-ahead before pushing, but you can open new issues without asking."
  - catalog の trigger が前の節に一致して hit したとしても、waiver が成立して gate が外れる。
  - `PUBLISH_ASK` には「いいと言って」も "go-ahead" も "approve" も入っていない。
- **深刻度を high にしない理由**: §5.4a は判定の単位を「文」と明記しており、コードは設計どおりに動いている。また、実際の catalog の trigger がこれらの形に一致するかは、添付からは確かめられない。一致するなら high に上がる。
- **修正案**: trigger を節(`CLAUSE_SPLIT`)ごとに当て、waiver の句を含む節だけを除外する。あるいは `unlessText`(waiver の句を空白にした本文)に対して、文ごとに trigger を当てる。§5.4a の「a sentence」も「a clause」に直す。テストには、上の2文と同じ形(「、」でつなぎ、否定語も `PUBLISH_ASK` の語もない形)を入れる。

**L-A(low)** `test/match.test.mjs` の H-1 ブロック
- **問題**: 3例のうち2例は、新しい仕組みがなくても asking になる。
  - "Never push unless confirmed." は、今回 `PUBLISH_ASK` に足した `confirmed` に当たる(しかも `never` は `PROHIBITION` にも当たる)。
  - 「OKが出てから」は `PUBLISH_ASK` の `OKが出` に当たる。
  - `asksByTrigger` がないと落ちるのは "Don't push until you hear from me." の1例だけ。
- **修正案**: 各例について、`publishPolarity(text)`(trigger なし)では `asking` が偽になり、trigger ありでは真になることを並べて確認するテストにする。trigger 経路を外すとどの例が赤くなるのか、例ごとに分かるようにする。

**L-B(low)** `src/match.mjs` / `PUBLISH_OBJECT` に足した「切り」
- **問題**: 「イシューは確認なしで切り分けていい」のような、起票ではない作業まで公開の対象として扱う。publish-guard の trigger にも hit した場合は、waiver が成立して gate が外れる。ただ、この2つが同時に起きる文は不自然。
- **修正案**: `切(?:っ|る|り)(?!分)` のように「切り分け」を除く。

## リグレッションと外部への流出

- **リグレッション**: high に当たるものは見つからなかった。
  - `PUBLISH_ASK` の拡張と `asksByTrigger` は、どちらも gate を残す側(安全側)にしか動かない。
  - `SENTENCE_SPLIT` が "v1.2" や "e.g." の「.」でも文を切るが、これも依頼と読まれやすくなる側の誤り。
  - `PUBLISH_WAIVER` の `g` フラグは、`exec` 側で複製しているので状態は持ち越されない。
- **流出**: 新しい経路はない。
  - `unlessText` は戻り値の中にしか出てこず、`hitFor` が使うのは `conflict` と `waiver` / `asking` だけ。
  - 例外のメッセージに入るのは行番号と recipe id だけ。
  - 本文に由来する `matched` / `quote` が evidence に入るのは、既存の設計どおり。

## 添付からは判断できなかったこと

- `catalog` に入っている publish-guard の trigger の全文。M-A が high になるかどうかはここで決まる。「mainへpushしないで」に trigger が当たらない、という前提も確かめられていない。
- evidence(`quote` / `matched`)が `plugin/**`、metrics の export、stdout / stderr に出るかどうか。これは emitter と CLI 側の話で、今回の添付には入っていない。
- テストを実際に走らせた結果。

**VERDICT: PASS(high 0件)**
