# kokoro-mods 再検品（第2回）：照合部 `src/match.mjs`

添付の `src/match.mjs` と DESIGN §5.4a を、手でトレースして判定しました。テストは実行していません（テストは添付されていません）。

## 1. 処置表の各行は実装されているか

| 行 | 判定 | 根拠 |
|---|---|---|
| H-1 | **不完全** | 「確認なしの…」「確認せずに…」は門が残ります。ただし、同じ「むき出しの形」が別の綴りで素通りします。所見 F1・F3 |
| H-2 | **不完全** | 日本語の「大丈夫じゃない」「いいとは思わない」と、英語の "isn't ok" は禁止側に入ります。英語の can't、may not、don't think…ok と、日本語の「いいわけがない」「言ってない」が抜けています。所見 F2 |
| H-3 | 実装済み | 許可は節（`clause`）で、禁止は文（`sentence`）で読みます。「確認せずにpushするのは、絶対にやめて」は門が残ります |
| H-4 | 実装済み | 英語は `^…$` の固定と `-ing` の拒否で直っています。"Pushing without asking has burned me" は門が残ります。日本語側の拡張は F4 |
| H-5 | **判定不能** | catalog が添付されていません。行（row）でない入力は、`cellsFor` が `[line.text]` だけを返す点は確認できました |
| M-1 | 実装済み | 節に公開する動作が無い免除は、空白化されて無視されます。「テストは確認なしで回してOK」で門は落ちません |
| M-2 | 実装済み | `(?<![A-Za-z])OK(?![A-Za-z])` と `\bok\b` で、"token" は許可になりません |
| M-3 | 実装済み | `CLAUSE_SPLIT` のコメントを直しています。"Before you push, push without asking." を辿ると `IMPERATIVE_WAIVER` が成立し、免除になります |
| M-4 | **不完全** | 版番号の後ろの部分が無制限です。所見 F5 |
| L-1 | 実装済み | `FORBIDDEN_SLUG_SUBSTRING` で入っています |
| L-2 | 実装済み | `""` は空の slug になり、`rejected` を返します |
| L-3 | 実装済み | エラーは位置だけを示します。import と定数はすべて使われています |

## 2. 残っている所見

### F1（high）`EXPLICIT_WAIVER` の英語部分と `publishPolarity`

- **問題**：英語の選択肢は述語の形になっていません。それを節の全体で探すので、H-1 と同じ欠陥が英語に残っています。
  - "Pushing with no confirmation broke prod"：`\bno\s+confirmation\b` が一致し、禁止語が無いので門が落ちます。
  - "I don't want you to push without asking"：`\bdon't\s+want\b` が一致し、門が落ちます。
- **修正**：
  - `no confirmation` は `(?:is\s+)?(?:needed|required|necessary)` が続くときだけ認めます。
  - `don't (need|want)` は、直後に `(?:any\s+)?(?:confirmation|permission|approval|consent)` を必須にします（`PUBLISH_WAIVER` の6番目の選択肢と同じ形）。
  - 上の2文を否定側のテストとして固定します。

### F2（high）`PROHIBITION` と `PERMISSION`

- **問題**：否定された許可の英語形が抜けています。`you (?:can|may)` の `\b` は "can't" の `'` の手前でも成立します。
  - "You can't push without asking."
  - "You may not push without asking."
  - "I don't think it's ok to push without asking."
  - 「確認なしでpushしていいなんて言ってない」
  - 「確認なしでpushしていいわけがない」
  - 以上の5文はすべて、許可あり・禁止なしと判定され、門が落ちます。
- **修正**：
  - `PROHIBITION` に `can['’]?t|cannot|may\s+not|won['’]t|don['’]t\s+(?:think|want|let)|わけ(?:が)?ない|はず(?:が)?ない|言って(?:い)?ない` を足します。
  - `PERMISSION` の `you (?:can|may)` に `(?!n['’]t|not)` を付けます。

### F3（high）`EXPLICIT_WAIVER` の日本語部分

- **問題**：
  - 1番目の選択肢は助詞を省略でき、後ろの確認もありません。そのため「確認不要のpushが怖い」で門が落ちます。
  - 2番目と3番目の選択肢の後読みは `\s` を認めています。そのため「確認せず pushしてしまう」「確認なし pushで事故った」で門が落ちます。
  - どちらも、処置表が門を残すと書いた「確認なしのpushが心配」と同じ型です。
- **修正**：
  - 1番目の選択肢に、述語の終わりを見る後読み `(?=\s*(?:[。、！？]|$|です|だ|で(?:いい|OK)))` を付けます。
  - 2番目と3番目の選択肢の後読みを `(?=\s*(?:[。、！？]|$))` に変えます。

### F4（medium）`IMPERATIVE_WAIVER` と `PERMISSION`（設計の問題）

- **問題**：
  - 辞書形の「する$」を命令として数えています。そのため「いつも確認せずにpushする。」のような習慣の記述で門が落ちます。DESIGN が例に挙げているのは「pushして」だけです。
  - 凍結済みの許可語「勝手に」は、多くの場合は苦情です。「確認なしで勝手にpushされるのがつらい」で門が落ちます。
- **修正**：
  - 「する」を外し、「して(ください|ね|よ)?$」に限ります。
  - 「勝手に」は、`refreeze --reason` で基準から外すか、「勝手に…(して|していい)」に限ります。
  - 受け身の「される」を禁止側に足します。

### F5（medium）`buildBundle` の version

- **問題**：`[-+][0-9A-Za-z.-]+` に長さの上限も語彙の制限もありません。"1-yamada-taro" や "1.0-adhd" がそのまま bundle に入ります。手引き書の本文が入り込む新しい経路で、M-4 の処置が不完全です。
- **修正**：後ろの部分を `(?:-(?:alpha|beta|rc)(?:\.\d+)?)?` などに絞るか、全体を `^\d+(?:\.\d+){0,3}$` に限ります。後ろの部分を通すなら、少なくとも `slugChoice` と同じ禁止語の検査と長さの上限（例：32文字）をかけます。

### F6（low）`PUBLISH_OBJECT`

- **問題**：
  - 凍結した一覧（push・公開・publish・PR・issue・release）に、デプロイ・deploy・プルリクが無断で足されています。これは、免除が成立しうる範囲を広げる方向の変更です。
  - `issues?`、`releases?`、`publish` に語の境界がありません（例："tissue"）。
- **修正**：一覧を凍結版に戻すか、`refreeze` で追加の理由を記録します。英語の語には `\b` を付けます。

### F7（low）`slugChoice`

- **問題**：ハイフンを挟んだ "ad-hd" や "a-d-h-d" は、どの検査にもかかりません。
- **修正**：`ascii.replaceAll('-', '')` にも `FORBIDDEN_SLUG_SUBSTRING` をかけます。

### F8（low）`buildBundle` の `profile.file`

- **問題**：手引き書のファイル名（例：`山田_ADHD_取説.md`）がそのまま入ります。ファイル名は本文ではありませんが、人名や診断名を含みえます。export に届くかどうかは判定できません。
- **修正**：export に届くなら固定名にするか、ハッシュ化します。

## 3. 退行と、新しい漏えい経路

- **退行**：M-1 で、公開する動作の無い免除を空白化するようにしました。これで、その免除の確認語が `asking` から消えるようになりました。ただし、門が落ちるのは別の免除が成立した時だけで、その結論は設計どおりです。退行は見つかりませんでした。
- **漏えい経路**：
  - 本文が通る新しい経路は F5 の1本です。
  - エラーメッセージに含まれるのは行番号・位置・catalog の id だけで、本文は含みません。
  - `evidence.quote` と `matched` は、設計どおり本文を運びます。その先が `plugin/**`・export・stdout のどこに出るかは判定できません。

## 4. 否定側のテスト

テストは添付されていません。そのため、否定側の各ケースが「歯止めがあること」を証明しているのか、「引き金が引かれないこと」を見ているだけなのかは判定できません。F1〜F3 の各文は、`publishPolarity` の戻り値（`waiver === false` かつ `asking === true`）で固定することを勧めます。

## 5. 添付からは判定できなかったこと

- catalog の trigger の `cell` 指定（H-5）と `unless` の中身
- `constants.mjs` の実際の値（`TOOL_NAME`、`PLUGIN_NAME_PATTERN`、`PLUGIN_NAME_MAX_CHARS`）
- Appendix A の全語彙
- bundle や evidence を emitter・export・CLI が出力する経路
- テスト一式

**VERDICT: FAIL（high 3件）**
