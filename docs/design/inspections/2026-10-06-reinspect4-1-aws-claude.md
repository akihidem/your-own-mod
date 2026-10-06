# kokoro-mods 照合部（src/match.mjs）第4回 再検品

## 1. 処置表の各行の実装状況

| 行 | 判定 |
|---|---|
| H1 | 実装済み。`(では\|じゃ)ありません`、`思いません`、`(よく\|良く)ありません` が PROHIBITION に入り、`構いません` が PERMISSION に入っています。 |
| H2 | 列挙された副詞については実装済み（hardly・barely も含む）。ただし副詞が閉じた一覧なので抜けがあります（下の High-2）。 |
| H3 | 実装済み。IMPERATIVE_WAIVER の日本語側・英語側の両方が、trim 済みの節の末尾 `$` に固定されています。 |
| M1 | 実装済み。節の終わりの `？` と `ですか$` で質問を判定します。付加疑問の抜けがあります（Medium-3）。 |
| M2 | 実装済み。`sentence.replace(PUBLISH_WAIVER,' ')` の後に、素の don't／do not／didn't を判定します。 |
| M3 | 実装済み。`だ(?=…よ\|ね)` と `で(?:す(?!か)…)` で「だと」「だった」を外しています。 |
| M4 | 実装済み。習慣とみなした場合に止まるのは `stated` だけで、PERMISSION の経路はそのまま残ります。設計 §5.4a の通りです。 |
| L1 | 実装済み（`\bpush(?:es\|ed\|ing)?\b`）。 |
| **L2** | **未実装。** 先読みがあるのは語の後ろだけで、前を見る lookbehind がありません。そのため節末の「かわいい」「つよい」（後ろが 。 か行末）は今も permission として当たります。誤判定には珍しい文型が要るので、深刻度は Low です。修正案：`(?<![ぁ-んァ-ヶ一-龠])(?:いい\|よい\|良い)` のように、前にかなが続く場合を除外します。 |
| L3 | 記録のみで、コード変更の必要はありません。version の正規表現も変わっていません。 |

テストファイルは添付されていないので、どの行についてもテストの有無は判断できません。

## 2. 残っている指摘

**High-1** src/match.mjs `PROHIBITION` / `PERMISSION`（publishPolarity）
- 問題：「確認せずにpushしない方がいい」「確認なしのpushは避けたほうがいい」「…控えたほうがいい」が、ゲートを外す waiver になります。
- 理由：文末の「いい」が PERMISSION に当たります。一方で、waiver の語句を取り除いた残り「pushしないほうがいい」には、`しないで`／`しないこと` 以外の否定がありません。避け・控えも PROHIBITION にありません。安全ゲートをはっきり求める、よくある助言の文型です。
- 修正：PROHIBITION に `ない(?:ほう\|方)が\|避け\|控え\|べきで(?:は)?ない` を加えます。あわせて PERMISSION の「いい」から、直前が `(?:ほう\|方)が` のもの（助言であって許可ではない）を除外します。

**High-2** src/match.mjs `PROHIBITION`
- 問題：英語の否定と許可語のあいだに入る副詞が閉じた一覧です。"Pushing without asking isn't actually OK."、"…is no longer OK."、"You can no longer push without asking." の3文は、いずれも OK／you can で permission になり、prohibition は当たらず、ゲートが外れます。
- 修正：副詞を `\w+ly\|ever\|so\|that` 程度まで一般化し、`no\s+longer` を PROHIBITION に加えます。あるいは、許可語と同じ節に `n't\|\bnot\b\|no longer` があれば prohibition とします。

**Medium-1** `publishPolarity`（REPORTED の判定）
- 問題：伝聞を見ているのは `stated` だけで、`PERMISSION` の経路では見ていません。そのため「確認せずにpushしていい、という人がいる」「確認なしでpushしてOKって言う人がいる」（節の中の「って言う」）、"Some people say you can push without asking." が waiver になります。設計 §5.4a の「伝聞は opt-out を述べない」に反します。
- 修正：`permitted` の条件全体に `!reported` を掛けます。伝聞の判定は、節の後ろだけでなく節の中の `って言\|と言\|say\|said` も見るようにします。

**Medium-2** `PROHIBITION`
- 問題：外側からの否定が拾われません。"Nobody said you can push without asking."、"It is not true that you can…"、「確認なしでpushしていい、なんてことはない」はいずれも waiver になります。
- 修正：`nobody\|no one\|not true\|ことはない\|わけない` を加えます。

**Medium-3** `publishPolarity`（QUESTION の判定）
- 問題："You can push without asking, right?" は waiver 節の終わりが「,」なので質問と判定されず、waiver になります。
- 修正：文の終わりが `？` であれば、その文に含まれる節すべてを質問として扱います。

**Low-1** `PUBLISH_OBJECT`
- 問題：`\bissues?\b` が「Fix issues without asking, it's fine.」のように公開以外の文脈でも当たり、関係のない waiver を受け入れます。
- 修正：issue は open／file／create などの動詞と並んだ時だけ公開対象とします。

## 3. 処置による退行

PUBLISH_WAIVER は global の正規表現で、外側の replace の実行中に内側でも replace に使われています。仕様上、外側は一致をすべて集め終えてからコールバックを呼ぶので、lastIndex の干渉は起きません。waiver 語句を取り除いても、ゲートを求める文の禁止語が消えた例は見つかりませんでした。日本語の「確認しない」を取り除いても、続く「しないで」は残ります。今回の追加はどれも prohibition を増やす方向なので、安全側を崩す退行は見当たりません。

## 4. 手記の本文が外へ出る経路

この file の中では、新しい経路は見つかりませんでした。
- エラー文が含むのは行番号・配列の位置・recipe id だけです。
- 派生パラメータは、範囲のある数値か options の中の文字列に限られます。
- version は正規表現で絞っています。
- slug は `--name` だけから作ります。
- `unlessText` は戻り値に入りますが、hitFor の先へは渡されません。

ただし `evidence.quote` と `matched` は手記の本文そのもので、proposals 経由で Bundle に入ります。

## 5. 添付から判断できなかったこと

- テストの中身（各行がテストで固定されているか）
- publish-guard の trigger パターン（PUBLISH_OBJECT が拾わない「pull request」「deploy」などで、そもそも trigger が当たるか）
- emitter・CLI・metrics の各処理が `evidence.quote`／`matched` を plugin/**・metrics の出力・stdout／stderr に書くかどうか

**VERDICT: FAIL（High 2件）**
