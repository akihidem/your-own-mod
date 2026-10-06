# kokoro-mods 再検品：matcher / diff テスト（7b6e003..HEAD、チャンク B・D）

添付された差分と、チャンク B の処置表だけで判断しました。matcher 本体、catalog、DESIGN §5.4a、チャンク D の処置表は添付されていません。

## 1. 「folded」とされた行が実装されているか

**チャンク B**

| 行 | テストで裏付けられているか |
|---|---|
| H1（放棄宣言の判定を matcher が行う） | **一部のみ。** 新しく「確認なしのpushは厳禁」と "Pushing without asking is forbidden" が high で入りました。ただし元の指摘にある英語の例 **"Avoid pushing without confirmation" がありません**。また catalog の `unless: []` は「publish-guard を検査から外す」だけで、空であることは確かめていません。さらに既存の否定ケース「pushは確認しない」「pushの許可なし」は、まだ抑止される前提のままです。これは「明示的な許可があり、同じ節に禁止がない時だけ放棄とみなす」という処置と食い違って見えます（下の M-3）。 |
| H2（push通知の除外） | **一部のみ。** 2文で `[]` を確かめているだけで、対になる陽性（「pushの前に確認して」が発火する）がこの差分にはありません。日本語の混在行（「push通知は要らない。pushの前に確認して」）もありません。英語の混在行は high で確認済みです。 |
| M3（他の物の字数制限を拾わない） | **実装されていません。** 否定ケース 'Within 250 chars.' → 0 が削除され、陽性の 'Keep answers within 250 chars.' に置き換わりました。「ブランチ名は30字以内」型のケースも、「12文字以内」の境界のケースも残っていません（H-2）。 |
| M1・M2・M4・M5・M7・L 各行 | この差分には該当テストがなく、判断できません。 |

**チャンク D**

| 行 | テストで裏付けられているか |
|---|---|
| H1（セル単位の判定） | 処置表がないので、処置文との照合はできません。テストは本物の recipe に切り替わり、8件の陽性と6件の抑止があります。 |
| L2（quote がない行は raw から引用しない） | **実装されています。** quote を消した行で `TypeError` が出ることを確かめていて、ガードの証明になっています。ただし新しい漏えい経路があります（M-4）。 |

## 2. 否定ケースは「ガード」を証明しているか、「トリガーが無いだけ」か

- **`assertSuppressed` の前提確認が弱くなりました（H-1）。** 以前は「unless を外すと実際に提案が出る」ことを確かめていました。今は「トリガーの正規表現が text・left・right のどれかに当たる」だけです。トリガーの言語（lang）、セクション、セル（cell）は見ていません。これは publish-guard だけでなく、`assertSuppressed` を使う全 recipe に効きます。コメント自体も、抑止の理由が「行だけ読む規則」でもよいと認めています。つまり、トリガーがそのセルを読まないだけでも合格します。
- **抑止される6文**について：
  - 「確認せずにpushする」と「Feel free to push without asking」は、対になる陽性（「確認せずにpushしないで」→ high、"Pushing without asking is forbidden" → high）が同じテストにあります。なので極性の判定を見ていると言えます。
  - 「push は確認しなくていい」は、陽性側が「ただし…」付きの medium だけで、近い対です。
  - **"No confirmation needed for pushing" と "Do not ask before you push." には対になる陽性がありません。** 抑止の理由がトリガーの不一致なのか極性の判定なのか区別できません。
  - "Do not ask before you push." は禁止語 "Do not" を含むのに抑止を期待しています。処置文の「節に禁止がない」と字面上は矛盾します。
- **push通知**：`[]` を確かめているのは、仕組み上「トリガーが無いこと」そのものです。それ自体は意図どおりですが、陽性の対がないと先読み（lookahead）が効いていることの証明になりません。
- **表の行のケース**：2件目が ["Don't push without asking.", 'Ask before you push.'] に変わりました。これは依頼どうしで、放棄宣言を含みません。セルをまたぐ取り消しが起きても失敗しないケースです。削除された鏡像のケース（左が依頼、右が放棄宣言）が、ちょうどコメントの主張を確かめるものでした。「避ける側のセルにしか依頼がない時は読まない」も、コメントで述べているだけでテストがありません。
- **slug**：frontmatter と title を入れたまま 'profile' を確かめ、禁止語を含む名前でも説明書由来の名前に戻らないことを確かめています。これはガードの証明になっています。ただし `-autisticx` のケースは、切り詰めのガードではなく、部分一致による拒否でも合格してしまいます。source も確かめていません（L-2）。

## 3. 後退と新しい漏えい経路

- 削除されたテストで消えた検証が2つあります。g フラグ付きの unless 正規表現の `lastIndex` を matcher が変えないこと、そして unless がトリガーのセル・範囲の中だけで効くこと（先読みの4パターン）です。publish-guard 以外の recipe では今も unless を使うので、この検証は必要なままです（M-5）。
- **漏えい経路**：quote がない時の `TypeError` のメッセージに、行の text や raw が入っていないか確かめていません。CLI がそのまま stderr に出せば、コメント部分も含めて説明書の文が漏れます（M-4）。
- plugin/** と metrics の出力へ説明書の文が届く新しい経路は、この差分からは見つかりませんでした。slug は明示した名前だけを使うようになり、むしろ減っています。

## 4. 残っている指摘

**High**

- **H-1** `test/match.test.mjs` の `assertSuppressed`
  - 問題：前提確認が「どこかのセルで正規表現が当たる」だけになり、抑止の原因が unless なのか、言語・セル・セクションの不一致なのか区別できません。全 recipe の unless テストが弱くなっています。
  - 修正：unless を持つ recipe には旧来の確認（`{...recipe, unless: []}` で1件出る）を戻します。publish-guard には、極性の判定を切る注入点（例：`matchRecipes(p, r, { polarity: false })`）で1件出ることを確かめるか、言語・セクション・セルが同じで放棄の語だけ違う陽性の対を必須にします。前提確認でも `trigger.lang` と `trigger.cell` を考慮します。
- **H-2** `test/match.test.mjs` の「bounded derivations」
  - 問題：M3 のガードを試す否定ケースがなくなりました。
  - 修正：次を追加します。
    - 'Keep branch names within 30 chars. Answer first.' → `max_chars: 0`
    - 「ブランチ名は30字以内。結論を先に。」→ 0
    - 返答の語からの距離が12字と13字の境界ケース

**Medium**

- **M-1** 同じテストの H1 ケース群
  - 問題："Avoid pushing without confirmation" がありません。
  - 修正：high で追加します。
- **M-2** 表の行のループ
  - 問題：放棄宣言どうしの鏡像ケースが消え、2件目は放棄宣言を含みません。
  - 修正：["Don't push without asking.", 'Publish without confirmation.'] を、期待値を明記して戻します。「避ける側のセルにだけ依頼がある」→ `[]` も追加し、同じ文を読む側のセルに置いた陽性の対を付けます。
- **M-3** 'required unless cases' の「pushは確認しない」「pushの許可なし」と、"Do not ask before you push."
  - 問題：明示的な許可がない文や禁止語を含む文で抑止を期待していて、処置の「明示的な許可の時だけ放棄」「迷ったらゲート側に倒す」と食い違います。
  - 修正：DESIGN §5.4a に照らしてどちらかに決め、期待値を high にするか、許可とみなす根拠をコメントに書きます。
- **M-4** quote 拒否のテスト（チャンク D の L2）
  - 問題：例外メッセージに説明書の文が入らないことを確かめていません。
  - 修正：`assert.throws(..., e => e instanceof TypeError && !/needle|private/.test(e.message))` にします。CLI 側にも固定文のエラー出力テストを足します。
- **M-5** 削除された `lastIndex` とセル範囲のテスト
  - 問題：publish-guard 以外の unless 経路で、この検証が失われました。
  - 修正：仮の probe recipe（publish-guard 以外）で同じ検査を戻します。

**Low**

- **L-1** catalog テストの英語境界の検査
  - 問題：`branch.startsWith('(?<![')` は、数字を含まない後読み（lookbehind）も通してしまいます。
  - 修正：`(?<![0-9０-９])` との完全一致にするか、文字クラスに全角数字を含むことを必須にします。
- **L-2** slug の切り詰めケース
  - 問題：source を確かめておらず、部分一致による拒否と区別できません。
  - 修正：切り詰める前は許可される名前（例：`'a'.repeat(32)+'-autisticx'` が部分一致で拒否されない設計なら、その形）を使い、`slugSource === 'rejected'` も確かめます。
- **L-3** catalog テスト
  - 問題：publish-guard の `unless` が空であることを確かめていません。
  - 修正：`assert.deepEqual(recipe.unless, [])` を加えます。
- **L-4** ADD・OD・DAN を禁止語から外したこと
  - 問題：付録 A の内容次第で、凍結した基準を緩めたことになります。根拠をこの差分で確かめられません。
  - 修正：refreeze の理由を台帳と照合します。

## 5. 添付だけでは判断できなかったこと

- matcher 本体（publishPolarity、quote 拒否の実装と例外メッセージ）
- catalog の実際のトリガー、`sections`、`lang`、`cell`
- DESIGN §5.4a の本文と付録 A
- チャンク D の処置表
- M1・M2・M4〜M7・L の各行に対応するテスト
- テストを実際に走らせた結果（緑かどうか）

**VERDICT: FAIL（high 2件）**
