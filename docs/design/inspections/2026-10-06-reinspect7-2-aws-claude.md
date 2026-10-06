# kokoro-mods カタログ第7回再検査（src/catalog/index.mjs、99ca7d1..HEAD）

## 処理表の各行の実装状況

| 行 | 判定 |
|---|---|
| H-A | 実装済み。「showing me」と「letting me」は、`without` の後30字の先読みに入っている |
| H-B | **一部のみ**。「I say」「I tell」「I give」は捕まる。「I've said so」「I've signed off」「I explicitly say so」は捕まらない |
| M-1 | 実装済み。ただし範囲が広すぎて退行がある（下記 M-a） |
| M-2 | 実装済み。`(?:思\|考\|言)[^。、]{0,4}?(?:ない\|ません)` で「思っていません」「言いません」の両方が取り消される |
| L-1 | 実装済み。`な(?=…)` と `る?べき` が入った。副作用は下記 L-a |
| L-2 | 実装済み。ただし**締めすぎて退行**している（下記 H-1） |
| L-3 | 記録済み。対応として妥当 |

## 残っている指摘

**H-1（high・退行）**
- 場所：push/publish の gate、unless/until/before の正規表現と、ask 語の位置を問わない正規表現。
- 問題：fold 前は `confirm\w*` が「Never push unless confirmed.」に一致していた。今は確認に人の主語が必要になり、どの正規表現にも一致しない。そのため「Don't push until I've confirmed.」「Don't push until I've signed off.」のような普通の文で gate が消える。
  - 「I've」の形が `(?:I|…) (?:have |has )?` に合わない。
  - `sign-?off` が「signed off」に合わない。
- 修正：
  - 主語の部分を `(?:I|you|we|the user|someone)(?:['’]ve| have| has)?(?:\s+\w+ly)?\s+` にする。
  - 動詞に過去形（said、told、gave、signed、approved）を加え、`sign(?:ed)?[- ]?off` を足す。
  - unless/until/before の直後に来る裸の `confirm\w*` を戻す。L-2 は「(tests?|build|CI|checks?) (are|is|have been) confirmed」を否定後読みで除外して守る。

**H-2（high・既存）**
- 場所：静かな確認（quiet-confirmations）の日本語トリガー。
- 問題：「念のため確認を省くのはやめてください」「確認の質問を省くことはしないでください」は、確認を省くなという逆の依頼。しかしトリガーが `省く` や `やめ` で発火し、unless には「動詞＋のは／ことは＋やめ／しないで」の形が無いため、レシピが付く。fold で `省く` がトリガーに加わり、この経路がもう一本増えた。
- 修正：
  - トリガーの否定先読みに `(?:の|こと)(?:は|を)?(?:やめ|しないで|控え)` を加える。
  - unless 側にも `(?:省[きかいく]|やめる|減らす|控える)(?:の|こと)(?:は|を)?(?:やめ|しないで)` を足す。
  - 設計文書がこの形を受け入れ済みとしているなら medium に下げる。設計文書は今回添付されていない。

**M-a（medium・退行）**
- 場所：unless の譲歩節の選択肢。
- 問題：`[^。！？]*` が読点を越え、さらに `が`・`けど` で何にでもつなぐ。そのため「確認の質問はやめてほしいけど、テストは省かないで」でレシピが失われる。これは第5回の M3 で直した節の範囲を、譲歩節の経路から崩している。
- 修正：
  - `が` を外す。
  - 後半の節を「`、?\s*(?:確認(?:は|を)?)?`＋動詞＋否定」の形に限り、別の主題（〜は／〜を）を挟めないようにする。

**M-b（medium）**
- 場所：unless/until/before の正規表現。
- 問題：「unless the user explicitly confirms」「until you hear from me」が捕まらない。副詞が入る形と、言い回しが違う形。
- 修正：H-1 の副詞スロットで前者は解決する。後者は `hear from me` を加える。

**L-a（low）**
- 場所：`JA_VERB_NEGATED` に足した `な(?=…)`。
- 問題：「過剰確認はいらないな。」のような口語の肯定文まで取り消してしまう。
- 修正：`な` の直前を辞書形（`[くぐすつぬぶむる]`）に限る後読みを付ける。

**L-b（low）**
- 場所：`without` の正規表現。
- 問題：まだ `confirm\w*` のまま。「without the tests confirmed green」で gate が付き、L-2 と食い違う。
- 修正：L-2 と同じ除外を入れる。

**L-c（low）**
- 場所：until/before の正規表現。
- 問題：裸の `ok(?:ay)?` と `approv\w*` のため、「until the build looks OK」で gate が余分に付く。安全側に倒れるので害は小さい。
- 修正：`ok` を `(?:I|you) ok\w*`、`an? ok`、`OK from me` のように人に結び付ける。

## 漏えい経路

この diff は正規表現の定数とコメントだけを変えている。マニュアルの文を plugin/**、metrics export、stdout、stderr に出す新しい経路は見当たらない。

## 添付だけでは判断できなかったこと

- **設計文書**：「current design text」は添付に含まれていなかった。どの言い回しが受け入れ済みかを照合できないため、H-2 と M-b の重大度は暫定。
- **テスト**：テストファイルが無く、各行に回帰テストがあるかを確認できない。
- **`right` / `unless` の関数本体**：無いので、一致したときの実際の効き方（gate の付与やレシピの取り消し）は、コメントから推定している。
- **出力経路のコード**：plugin/** への出力、metrics、ログを書くコードが無いので、漏えいの判断は diff の範囲に限られる。
- **unless 以外の取り消し**：catalog の別の場所にある unless や右側のルールが、H-1 と H-2 の文を拾っている可能性は確認できない。

**VERDICT: FAIL（high 2件）**
