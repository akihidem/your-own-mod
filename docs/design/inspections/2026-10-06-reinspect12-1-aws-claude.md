# 第12回 再検品：chunk 1（matcher）

## 処理表の各行は実装されているか

| 行 | 判定 | 根拠 |
|---|---|---|
| 1 | 実装済み | `ASKING_CLAUSE_MARK` は削除され、`asksBeyondWaivers` が置き換えた。先に waiver の節を空白に置き換え、残りの文に trigger を当てる。残りが空、または `BARE_TIME_CLAUSE` に一致するときは false を返す。"Before you push" と「pushする前に」は `BARE_TIME_CLAUSE` に一致する。 |
| 2 | おおむね実装済み | 判定は節ごとではなく、残りの文全体で行う。そのため、「pushは、」で切られた主題も、後ろの節と同じ文字列の中に残る。ただし、残り「pushは、私がいいと言ってから、」に catalog の trigger が一致するかは、trigger の本文がないので確かめられない。テストの1行目（1399行）がそれを固定しているとみなした。 |
| 3 | 該当なし（moot） | 一覧そのものが無くなった。 |
| 4 | 実装済み | 3文で `waiver && !asking` と抑止を確かめている。ただし英語は1文だけで、日本語の「後でレビューする」型の文はない（下の M-1）。 |

## fold で入った後退

**M-1（medium）**
- 場所：`src/match.mjs` の `PUBLISH_ASK`
- 問題：fold で `レビュー|査読` が足された。`PUBLISH_ASK` は `unlessText` の全体を見るので、waiver と同じ欄に「レビュー」と書いてあるだけで asking=true になる。たとえば「確認せずにpushして。PRのレビューは後で私がする。」は、はっきりした waiver なのに安全 mod が medium で提案される。外れるのは安全側だが、普通に書く文である。行4の英語版 "I'll review the PR later" はこの語彙を通らないので、テストでは見えない。
- 修正：
  - `PUBLISH_ASK` から `レビュー|査読` を外し、trigger 側の判定（`asksBeyondWaivers`）に任せる。
  - 上の日本語文を「抑止される」側のテストに加える。

**L-1（low）**
- 場所：`asksBeyondWaivers`
- 問題：残りの文に trigger を当てるので、waiver の前置き条件まで依頼として数えうる。たとえば「pushはCIが通ってから、確認なしでしていい」。どこまで拾うかは trigger 次第で、外れるのは安全側。
- 修正：前置き条件だけの節を「抑止される」側のテストで固定する。必要なら、`BARE_TIME_CLAUSE` に「〜が通ってから」「〜したら」を足す。

## 残っている指摘（後退ではなく、もとからある穴）

**H-1（high）**
- 場所：`src/match.mjs` の `CLAUSE_PARTS` と `CLAUSE_SPLIT`（関数は `asksBeyondWaivers` と `publishPolarity`）
- 問題：節を区切る語に "and" がない。"Wait for my go-ahead before pushing and feel free to open issues without asking." を追うと次のようになる。
  1. 文全体が1つの節として扱われ、空白に置き換わる。
  2. 残りが空なので、trigger による判定は false になる。
  3. "feel free" が permission に一致し、禁止の語はない。
  4. `unlessText` に残る "go-ahead" は `PUBLISH_ASK` にない。
  5. 結果は `waiver && !asking` となり、push の安全ゲートが消える。

  2つの命令文を "and" でつなぐのは、ごく普通の書き方である。日本語の「…てから、…」は読点があるので救われる。英語は、`PUBLISH_ASK` にない言い方（go-ahead, "until I've looked at it" など）だと、このまま落ちる。前提として、`, but` 版のテスト（1395行）から、この文は trigger に一致するとみなした。
- 修正（どちらか、または両方）：
  - `CLAUSE_PARTS` と `CLAUSE_SPLIT` に `\band\s+(?=(?:feel\s+free|you\s+(?:can|may)|go\s+ahead|just|please|open|file|create|post|raise)\b)` を足す。
  - または `asksBeyondWaivers` で、節ごと消すのをやめる。消すのは waiver の語句と、その目的語から permission 語までの範囲に限る。
  - あわせて、この英文を「ゲートが残る」側のテストに加える。

## 手記の文が外に出る新しい経路

ない。`asksBeyondWaivers` は真偽値しか返さない。`hitFor` が取り出すのは `matched`、`waiver`、`asking`、`conflict` だけである。例外メッセージに入るのは行番号だけ。`buildBundle` と slug の処理は変わっていない。`CLAUSE_EDGE` の g フラグは `replace` でしか使われず、`exec` は正規表現を複製しているので、状態が呼び出しをまたいで残ることもない。

## 添付だけでは判断できなかったこと

- catalog にある publish-guard の trigger 本文。これがないと、行2の残りの文、H-1 の文、L-1 が実際に trigger に一致するかを確かめられない。
- テスト表の3列目（true/false）が何を意味するか。
- テストを実際に走らせた結果。テストは実行しておらず、添付の文字列を手で追っただけである。

**VERDICT: FAIL（high 1件）**
