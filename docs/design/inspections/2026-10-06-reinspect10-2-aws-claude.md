# kokoro-mods 10回目の再検品（chunk 2・catalog）

**結論:** 2行（H-3 と L-3）は実装されていますが、それぞれ新しい high を生みました。判定は FAIL で、high は2件です。

## 対応表の照合

| 指摘 | 判定 |
|---|---|
| H-1 | 実装済み。`JA_VERB_NEGATED` に `(は\|を)(やめ\|…\|不可)` が入り、trigger と unless の両方で働きます。ただし trigger 本体（`省` を `省[きかいく]` に限るかどうか）は添付に無いため、「省略」の「省」だけでヒットしないかは判断できません。 |
| H-2 | 実装済み。`(?:せ)?ず` と unless の `省略(する\|し\|せ)?` が入っています。 |
| H-3 | 実装済み。ただし穴があります（下の F-2）。 |
| M-1 | 実装済み。"we" が `EN_PERSON_GATE` に入っています。 |
| L-1 | 実装済み。lookbehind で `confirm\w*` が止まっても、新しく足した `confirm\w* (with\|by) (me\|the user)` で拾えます。 |
| L-2 | 実装済み。「不要だが、なくすのは禁止」は譲歩の分岐と `のは禁止` を通るので、空振りしないテストになりました。by-me の分岐は削除されたので、この指摘自体が対象を失っています。 |
| L-3 | 実装されましたが、範囲が広すぎて退行しました（F-1）。 |

## 残っている指摘

**F-1 high**
- 場所: `src/catalog/index.mjs` の `JA_NEG_TAIL`（quiet-confirmations の trigger と unless）
- 問題: `い(?!と)` は、`て(ほしく…)は?`・`(では\|じゃ\|で)`・`べきでは` の後ろの否定にも効きます。そのため「念のため確認を減らしてほしくないと思っています」「念のため確認は不要ではないと思います」がどちらも否定と読まれません。確認を続けてほしいという普通の文で trigger が発火し、unless も取り消しません。依頼の逆のレシピが提案されます。
- 修正: `(?!と)` を素の動詞否定の枝だけに限ります。そのうえで `ないと(?=思\|考\|言\|感\|決め\|のこと)` は否定として残します。上の2文を否定側のテストに加えます。

**F-2 high**
- 場所: `src/catalog/index.mjs` の `EN_STATE` / unless・until・before の trigger
- 問題: "Never push until you get the green light." では、`EN_STATE` の `green` がヒットします。一方 "you" は `EN_PERSON_GATE` に無いため、gate が外れます。旧版でも拾えていなかった文ですが、今回の設計「既定は gate を残す」に反します。
- 修正: `green` を `(?<!the )green(?! light)` にするか、`green-?light\|nod\|thumbs?-?up` を `EN_PERSON_GATE` に加えます。この文を肯定側のテストに加えます。

**F-3 medium**
- 場所: 同じ trigger
- 問題1: "until it's OK'd" と "until it looks good" は、`it` が状態語として扱われ、gate が外れます。
- 問題2: 判定の窓は40字です。"until the changes on the feature branch have been reviewed by me" では、人を表す語が40字より後ろにあり、状態語 `changes` が先に見つかって gate が外れます。
- 修正: `ok'?d\|okay'?d` を人の側に加えます。人の語は窓の制限なしに文末まで探します。

**F-4 medium（設計と実装の食い違い）**
- 場所: `EN_STATE`
- 問題: 設計文は「"before lunch" は人も状態も含まないので gate を残す」としています。しかし `lunch\|dinner\|breakfast` が `EN_STATE` に入っているため、実装では gate が外れます。
- 修正: どちらかに揃えます。安全側の gate を残すなら、食事の語を `EN_STATE` から外します。

**F-5 medium**
- 場所: `JA_PUBLISH_ASK` と `JA_PUBLISH_WAIVER` の非対称
- 問題: 承諾・了承・合図・OK を ask 語に追加しましたが、waiver 側には追加していません。そのため「pushする前の了承は不要です」が gate として発火します。
- 修正: waiver 側にも同じ語を追加します。

**F-6 low**
- 問題: `合図` と `OKが出` の追加で、「テストのOKが出てからpush」「pushしてから合図して」が gate になります。安全側の過剰発火です。
- 修正: CI の主語（テスト・CI・ビルド）を除外します。

## 外部への漏れ

今回の変更は正規表現の定数とテストだけです。plugin/**・metrics・stdout・stderr に出る新しい経路はありません。テストの assert のメッセージに出るのは fixture の文だけです。

## 添付から判断できないこと

- quiet-confirmations と publish-guard の trigger 本体の全文（`省` の範囲、ask 語がどこにあっても発火する trigger の `confirm` の lookbehind）
- `publishPolarity` と §5.4a が waiver 語を独自に持っているか
- `ruling.asking` が proposals や metrics に入るか
- テストを実際に流した結果。添付に実行ログは無く、私も実行していません。

**VERDICT: FAIL（high 2件）**
