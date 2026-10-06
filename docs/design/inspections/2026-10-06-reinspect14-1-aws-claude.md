# kokoro-mods 第14回再検品 — chunk 1（matcher）

## 処分表の照合

| 指摘 | 実装されているか |
|---|---|
| H-a | **実装済み。** `CLAUSE_SPLIT` から `and` が外れ、`CLAUSE_PARTS` には残っています。"You can push and open PRs without asking." は次の流れで waiver になります。節が文全体になり、"you can" が許可語として働き、禁止語はありません。asking 側の残りは "You can push and" です。こうなるのは、publish-guard の trigger がこの残りに一致しない場合に限ります。2本のテストが「提案なし」を固定しているので、通っているものとして扱います。 |
| M-a | **コード側は実装済み。** `PUBLISH_ASK` には レビュー も 査読 も入っておらず、コメントにも記録されました。テスト「公開前に査読を通して。…」は提案1件を確認しています。ただし、catalog の trigger が 査読 を含むかどうかは添付からは確認できません。 |
| L-b | **実装済み**（コメントの追加）。 |

## 残っている指摘

**High-1** — `src/match.mjs` `publishPolarity`（`IMPERATIVE_WAIVER` と `EXPLICIT_WAIVER` の節末判定）
- **問題:** 節を `and` で切らなくなったため、`and` の後ろにもう一つ節が続くと「節の終わり」の判定に失敗します。"Just push without asking and I'll check it afterwards." では trimmed が文全体になり、`IMPERATIVE_WAIVER` の `$` に届きません。`PERMISSION` にも一致しないため、`negatedWaiver` が立ち、publish-guard が提案されます。これは safety 枠なので既定で有効になります。確認なしを頼む普通の英文が、その逆である recipe を受け取ってしまいます。第12回の修正（`and` で切る）で偶然塞がっていた穴が、第13回の修正で再び開きました。§5.4a は節が `and` でも終わると定めているので、設計の上では waiver になるはずの文です。
- **修正案:** 命令形・述語形の節末判定には `and` を含む splitter（`CLAUSE_PARTS` と同じ境界）で切った節を使い、許可語の範囲だけを but/however までにします。あわせて "Push without asking and I'll review later." を waiver（提案なし）として固定するテストを追加します。

**Medium-1** — §5.4a の設計文と `CLAUSE_SPLIT`
- **問題:** 凍結済みの設計文は今も「clauses end at … but/however/and」と書いていますが、コードは許可の範囲から `and` を外しました。また `\n` と `(` `)` も設計文には載っていません。設計とコードが黙って食い違っています。
- **修正案:** 設計文を「許可は but/however まで、asking 側の空白化は and でも切る」と書き分け、refreeze の理由として台帳に残します。

**Low-1** — `publishPolarity`（`PUBLISH_OBJECT` を節で判定する箇所）
- **問題:** 節が広がったため、`and` の向こうにある公開対象が waiver の対象として扱われます。たとえば "Feel free to run the linter without asking and push when it passes" は、push についての waiver としてこの行を外してしまいます。逆の向き、"Feel free to fix typos without asking and push only after my review" は、asking 側の残り "and push only after my review" に catalog の trigger が一致する場合に限ってゲートが残ります。
- **修正案:** `PUBLISH_OBJECT` は `and` で切った節で判定します（High-1 と同じ splitter を使います）。

## 退行と新しい漏洩経路
- 退行は上の High-1 と Low-1 です。日本語側の経路は今回の差分で変わっていません。
- 新しい漏洩経路は見つかりませんでした。差分は正規表現とコメントだけで、`buildBundle` と slug は変わっていません。例外メッセージに含まれるのは行番号だけです。plugin/**、metrics、stdout、stderr に手書き説明書の本文が届く経路は増えていません。

## 添付から判断できなかったこと
- catalog の publish-guard trigger の本文。次の三つは、いずれもこれに依存します。
  - H-a のテスト2本が実際に緑になるか
  - 査読 を trigger が含むか
  - Low-1 の逆向きの文でゲートが残るか
- テストの実行結果。
- test diff の第1ブロック（catalog の第13回由来）が受け持つ範囲。chunk 1 の外です。

**VERDICT: FAIL（high 1件）**
