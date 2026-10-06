## 再々検品 第2章カタログ（`src/catalog/index.mjs`、1b499e9..HEAD）

照合した材料は添付の diff と処置表だけです。quiet-confirmations と push の正規表現は、diff から写して node で実際に試しました。文字数上限の正規表現は `JA_CHAR_OBJECT` の定義が添付に無いため、コードを読んで判断しています。

### 処置表の各行

| 行 | 判定 |
|---|---|
| H-1 | 実装済み。`*_NO_OBJECT_AFTER` が trigger と LIMIT の両方に入っている。ただし新しい回帰あり（M1） |
| M-a | 実装済み（`(?<!…(don't\|do not\|never\|stop)\s)` が付いた） |
| M-b | 挙げられた例は通る（「やめて構わない」「控えてもらえませんか」は依頼として発火し、unless で取り消されない）。ただし代わりに、遅れて付く否定がすべて抜けた（**H1**） |
| M-c | 実装済み（窓は 、 と , で終わる）。全角の ，・ASCII の ,（JA 側）・改行は窓を越える（L1） |
| M-d | 実装済み |
| L-a | trigger 側だけ実装。unless 側の `(do not\|don't\|never) (just do it\|stop checking in)` には副詞の入る余地が無い（M2） |
| L-b | 実装済み |
| L-c | 実装済み。今回足された「トークン」で、引き金が少し広がった（L3） |
| L-d | 実装済み |
| L-e | 実装済み（LIMIT からは何も導かれない。trigger は裸の上限として従来どおり発火する） |
| L-f | 狙った作業手順の文は除外できた。ただし確認を求める文まで落とした（**H2**） |
| 「終わりを出したら」 | 記録どおり。3番目の分岐は シグナル/合図 を必須にしている |

### 指摘

**H1（high）quiet-confirmations の JA trigger と JA unless**
- 問題：M-b で否定を「動詞の直後」だけに絞ったため、以前の `{0,4}?ない` 窓が拾っていた遅い否定が抜けた。実測では「念のため確認はやめてほしくない」「確認の質問は控えてほしくない」「過剰確認は不要ではない」が、新しい正規表現で発火し（旧版は不発）、unless も false。確認を続けてほしいという依頼が、確認を減らす recipe に反転する。
- 同じ型の既存の穴として「省かずに」「やめずに」も発火したまま。
- 修正：両方の否定先読みに次を足し、それぞれ回帰テストを書く。
  - `ず(?:に)?`
  - `て(?:ほしく|もらいたく)ない`
  - `ては(?:いけ|だめ|ダメ)`
  - `(?:では|じゃ)ない`
  - `わけ(?:では|じゃ)ない`
  - `るべき(?:では|じゃ)ない`
  - unless 側には `(?:やめ|控え|省か)ず` を足す。

**H2（high）push gate の3番目の EN 正規表現**
- 問題：`without` の後ろを固定の語の一覧にしたため、確認を求める文で gate が消えた。4番目のパターンも `\bconfirm(?:ation)?\b` なので "confirming" に一致しない。実測では次の3文で、4本の EN パターンがすべて false。
  - "Never push without confirming with me."
  - "Do not push without my go-ahead."
  - "Never publish without letting me review it."
- 修正：語を並べるのをやめて、先読みに変える：`\bwithout\b(?=[^.!?;]{0,30}\b(?:ask\w*|confirm\w*|approv\w*|permission|consent|ok|go-ahead|sign-?off|review\w*|me|my)\b)`。"without running the tests" は引き続き除外される。4番目のパターンも `confirm\w*|approv\w*` に広げる。

**M1（medium）`JA_NO_OBJECT_AFTER` / `EN_NO_OBJECT_AFTER`（H-1 の回帰）**
- 問題1：句の中に上限が2つあると、返答の上限が消える。「回答は200字以内で件名は50字以内」では、200 の先読みが「で件名」を見て拒否し、50 の後ろ読みも「件名」を見て拒否する。結果、何も導かれず、trigger も成立しない。"Keep replies under 250 chars and commit titles under 72" も同じ。
- 問題2：窓が改行を越えるので、箇条書きの「- 回答は200字以内\n- コミット件名は…」でも上限が消える。
- 修正：
  - 先読みを修飾関係のときだけに絞る。JA は `(?!\s*の[^。！？、\n]{0,8}${JA_CHAR_OBJECT})`、EN は `(?!\s*(?:in|for|of|on)\s+(?:the |my |all )?[^.;,!?\n]{0,12}${EN_CHAR_OBJECT})`。
  - 全部の窓の除外クラスに `\n，,；;` を足す。

**M2（medium）quiet-confirmations の EN unless の1本目**
- 問題："Don't ever stop checking in with me." は trigger に一致し、unless に一致しない（実測）。L-a と同じ形だが、まだ直っていない。
- 修正：この unless 分岐にも `(?:\s+(?:ever|just|simply))?` を入れる。

**L1（low）`JA_NO_OBJECT` と `JA_CHAR_LIMIT` のすき間**
- 問題：「件名は英語,回答は200字以内」では、後ろ読みが ASCII の , を越えて「件名」を見る。
- 修正：M1 で挙げた文字クラスの追加で同時に直る。

**L2（low）`JA_CHAR_LIMIT`**
- 問題：「回答、200字以内」「回答については、200字以内」から上限が導かれない（trigger は発火する）。
- 修正：`(?:(?:は|も|を|については)?、)?` にする。

**L3（low）access-gate の JA trigger**
- 問題：「トークン消費で応答が失速」で発火する。
- 修正：`トークン(?:入力|発行|認証)` に絞るか、「トークン」を外す。

**L4（low）typo の EN unless**
- 問題："My typos: no need to point them out" と "don't ever point them out" で取り消しが起きる。
- 修正：後ろ読みに `need to|ever` を足す。

### manual の本文が外へ出る経路

この diff で変わったのは正規表現の定数だけです。出力・metrics・console への新しい経路は見当たりません。後ろ読み・先読みはどれも有界の窓なので、catastrophic backtracking の兆候もありません。

### 添付からは判断できなかったこと

- `JA_CHAR_OBJECT` の全体と `EN_CHAR_OBJECT` の後半。M1 は、「件名」「commit」「titles」が含まれる前提で書いています。
- テストファイル。処置表の各行に回帰テストが付いたかは確かめられません。
- `right()` / `unless()` の結合の仕方（OR か、行単位か、句単位か）。
- plugin/** と metrics を書き出す側のコード。出力経路は diff の範囲でしか見ていません。

**VERDICT: FAIL（high 2件）**
