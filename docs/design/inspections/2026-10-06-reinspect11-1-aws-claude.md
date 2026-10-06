# kokoro-mods 第11回再検品 chunk 1（matcher）

## 処理表の各行の確認

| 行 | 判定 |
|---|---|
| M-A | **コード側は処理表どおり。** `asksByTrigger` に節の判定が加わりました。人か依頼を指す語（`ASKING_CLAUSE_MARK`）を含み、免除の言い回しを含まない節がトリガーに当たれば依頼と扱います。"Before you push, push without asking." の "Before you push" は印に当たらないので、§5.4a どおり免除のままです。ただし「目的語＋人＋てから/まで」のトリガーは添付に catalog が無いため確認できません。 |
| L-A | **入っています。** 3列目 `byVocabulary` で、語彙だけ（トリガーなし）でゲートが残るかを assert しています。手で追うと false は4行で、注記の「three rows」とずれています（実害なし）。 |
| L-B | **入っています。** を形は `切(?!り分)`、は形は `切(?:っ\|る\|り)(?!分)` です。「イシューは確認なしで切り分けていい」は目的語に当たらず、`!waiver` の assert があります。「切っていい」は免除のままです。 |

## 修正で生じた退行と、残っている指摘

**1. medium — `src/match.mjs` `ASKING_CLAUSE_MARK` / `publishPolarity`**
- 問題：節の判定を、手で管理する2本目の語彙表で絞っています。H-1 が「catalog の語彙とずれない」ために直した型と同じで、また手書きの表がずれる余地を作っています。
- 欠けている語の例：英語の `review\w*` に対応する日本語「レビュー」「チェック」。人を指す名詞「上司・チーム・リーダー・担当」。英語の "lead"、"team"、"says so"。
- 例文：「pushはレビューが通ってから、イシューは確認なしで立てていい」"Don't push until the team lead says so, but feel free to open issues without asking."
- 語彙側ではどれもゲートを残しません（`PUBLISH_ASK` と `PROHIBITION` に当たりません）。catalog のトリガーがこれらの節に当たるなら、普通の文でゲートが消える **high** になります。当たるかどうかは添付からは判断できません。
- 修正案：絞り方を逆にします。節の判定は既定で有効にし、除外するのは「裸の時の節」だけにします（`^\s*(?:before|after|when|once)\s+(?:you\s+|we\s+)?push\w*\s*$`、「push(する)?前に」など）。不確かな側を提案に倒す方針とも合います。

**2. medium — `src/match.mjs` `publishPolarity`（`asksByTrigger`）**
- 問題：主題の「は、」で節が割れると、トリガーが目的語と人を同時に見られません。
- 例文：「pushは、私がいいと言ってから、イシューは確認なしで立てていい」。文単位の判定は免除の言い回しがあるので除外されます。節は「pushは」と「私がいいと言ってから」に分かれ、どちらもトリガーに当たりません。語彙側も「いいと言って」を依頼と読みません。そのためゲートが消えます。
- 修正案：文から「免除の言い回しを含む節」だけを空白に置き換え、残りの文にトリガーを当てます。主題の「は、」が残りの節とつながったまま判定されます。

**3. low — `src/match.mjs` `ASKING_CLAUSE_MARK`**
- 問題：`OK` が `\b` の外にあり、`i` フラグ付きなので "looks"、"token"、"book" にも当たります。`PERMISSION` の注記にある「OK needs ASCII bounds」と食い違っています。誤りはゲートを残す側に倒れます。
- 修正案：`(?<![A-Za-z])(?:OK|ＯＫ)(?![A-Za-z])` にします。

**4. low — `test/match.test.mjs`**
- 問題：トリガーを渡した状態で、節の判定が免除を誤って打ち消さないことを確かめるテストが diff にありません。
- 例："Push without asking; I'll review the PR later." では、`;` で節が割れ、人とレビューを含む節ができます。トリガーが当たると、免除を求めた人に recipe が提案されます。
- 修正案：この文と "Before you push, push without asking." を、トリガー付きで `waiver && !asking` と assert します。

**手書きの内容が外へ出る新しい経路：見つかりませんでした。** 今回の差分は真偽値の判定を変えただけです。`unlessText` は `hitFor` の中で使われるだけで外へ出ません。例外メッセージに含まれるのは行番号と配列の位置だけです。

## 添付からは判断できないこと
- catalog の publish-guard トリガーの実際のパターン（指摘1と4の深刻度がこれで決まります）
- 新しい3行と既存の免除テスト（「mainへpushしないで。…」の文など）が、トリガー付きで実際に緑になるか。テストの実行結果が添付されていません。
- plugin/**、metrics の出力、CLI の出力の側のコード

VERDICT: PASS（high 0件。ただし指摘1は catalog のトリガー次第で high に変わる条件付き）
