# kokoro-mods matcher 第3回再検品（src/match.mjs × DESIGN §5.4a）

## 1. 処置表の各行の実装状況

テストファイルは添付されていません。このため、各行がテストで固定されているかは判断できず、以下はコードだけの判定です。

| 行 | 判定 |
|---|---|
| F1 | **実装済み**。英語の完全形（"no confirmation needed" と "don't want/need (any) confirmation"）が `EXPLICIT_WAIVER` に入っています。"no confirmation" 単独は `PUBLISH_WAIVER` にしか一致しないため、安全側の「negatedWaiver」に落ちます。 |
| F2 | **列挙された語は実装済み**。`PERMISSION` の `you (?:can\|may)(?!n't\|\s+not\b\|not\b)` も正しく働きます。ただし丁寧形と副詞が挟まる否定が抜けています（下の H1・H2）。 |
| F3 | **実装済み**。日本語の各述語に節末の先読みが付きました。ただし先読みが `だ`・`です`・`？` も通します（M1・M3）。 |
| F4 | **一部が未実装**。「pushする」の除外、「勝手に」の削除、「される」の追加はできています。しかし `IMPERATIVE_WAIVER` の `(?:ください\|ね\|よ)` が節末に固定されていません。DESIGN の「ends the clause」を満たしていないため、この行は未実装と判定します（H3）。 |
| F5 | **実装済み**。 |
| F6 | **一部が未実装**。deploy は削除済みで、publish・PR・issue・release には語境界があります。`push` だけは境界がなく、"pushy" や "pushover" にも一致します（L1）。 |
| F7・F8 | 記録だけの行なので、コードで確かめる対象はありません。F8 の「file 名は PROPOSALS.json にしか入らない」は添付からは検証できません。 |

## 2. 残っている指摘

### H1（high）丁寧形の否定を許可語として読み、安全ゲートを外す
- **場所**: src/match.mjs の `PROHIBITION`（`publishPolarity` から使用）
- **問題**: 「〜ません」型の否定が入っていません。次の文はどれも、許可語（いい・大丈夫）を拾ったうえで禁止語が見つからず、waiver と判定されてゲートが外れます。
  - 「確認せずにpushしていいとは思いません。」
  - 「確認なしでpushしても大丈夫ではありません。」
  - 「確認せずにpushしていいわけではありません。」
  - 「良くありません」
  
  取説は です・ます 調で書かれることが多いです。DESIGN が凍結した例（「大丈夫じゃない」「いいとは思わない」「いいわけがない」）の丁寧形そのものです。
- **修正案**: `PROHIBITION` に `(?:では|じゃ)ありません|(?:よく|良く)ありません|思いません|思えません|わけ(?:では|じゃ)?ありません|困ります|いけない|なりません` を加える。`ません` を丸ごと加えると「構いません」（許可）まで禁止になるので避ける。あわせて「構いません」を `PERMISSION` に加える。

### H2（high）副詞を挟んだ英語の否定を見逃す
- **場所**: `PROHIBITION`
- **問題**: "Pushing without asking isn't really OK." では、`PERMISSION` が OK を拾います。一方 `PROHIBITION` は否定と ok が隣り合う形しか見ないため、"really" が挟まると一致せず、ゲートが外れます。"is not really fine"、"I'm not exactly okay with…"、"hardly ok" も同じです。
- **修正案**: 否定の後ろに `(?:\w+\s+){0,2}` を許す。または `hardly|barely` を禁止語に加える。

### H3（high・今回の fold で生じた退行）命令形の判定が節末に固定されていない
- **場所**: `IMPERATIVE_WAIVER`
- **問題**: 「確認せずにpushしてよく事故る。」は、「してよ」の部分が命令形として一致して permitted になります。禁止語もないため、ゲートが外れます。これは DESIGN が名指しで waiver ではないとした "Pushing without asking has burned me" の日本語版そのものです。他にも次の文でゲートが外れます。
  - 「確認せずにpushしてくださいと言われても困ります」（H1 とも重なる）
  - 「確認せずにpushしてね、という人がいる」
- **修正案**: `して(?:ください\|ね\|よ)?\s*$` に改める。判定対象は節（`clause.trim()`）なので `$` で固定できる。

### M1（medium）疑問文を許可として読む
- **場所**: `EXPLICIT_WAIVER` の先読み、`publishPolarity`
- **問題**: 次の文でゲートが外れます。
  - 「pushは確認不要ですか？」：先読みが `です` を通す。
  - 「確認せずにpushしていい？ダメ。」：禁止の判定が文ごとなので、次の文の「ダメ」が届かない。
  - "You can push without asking? No."：同じ理由。
- **修正案**: 先読みから `？`・`?` と `ですか` を外す。waiver の文が疑問符で終わるときは negatedWaiver として扱う。

### M2（medium）句読点で区切られた英語の否定を見逃す
- **場所**: `PROHIBITION`
- **問題**: "Please don't, even if it seems fine, push without asking." では、節 "push without asking" が `IMPERATIVE_WAIVER` に一致します。一方 `PROHIBITION` は "don't" を think・let・want が続く形でしか拾わないため、ゲートが外れます。"Don't — I repeat — push without asking" も同じです。
- **修正案**: `do\s+not|don['’]t|didn['’]t` を単独で禁止語に加える。waiver 自身の "don't ask" は `replace(matched)` で取り除かれるので、正しい waiver を壊しません。

### M3（medium）`だ` の先読みが広すぎる
- **場所**: `EXPLICIT_WAIVER`
- **問題**: 先読みの `だ` が「だと」「だった」も通します。そのため「pushは確認不要だと思われがち」が waiver になります。
- **修正案**: `だ(?=\s*(?:[。、！？]|$|よ|ね))` に絞る。

### M4（medium・設計の問題）一人称の習慣文を waiver として読む
- **場所**: `EXPLICIT_WAIVER`
- **問題**: "I never ask before pushing, and it bit me" や「私はpushの前に確認しない。」が waiver になります。F4 で「pushする」を外した理由（命令ではなく習慣の文だから）と矛盾します。ただし DESIGN 自体が「pushは確認しない。」を waiver と凍結しているため、直すには refreeze が必要です。
- **修正案**: 主語 I・we・私 が付く述語を除外する。refreeze の要否は人間判断です。

### L1（low）`PUBLISH_OBJECT` の push に語境界がない
- **修正案**: `\bpush(?:es|ed|ing)?\b` にする（日本語の直前直後でも `\b` は成立します）。

### L2（low）`PERMISSION` の日本語の許可語が部分一致
- **問題**: 「つよい」の中の「よい」、「かわいい」の中の「いい」を許可語として拾います。
- **修正案**: 直前に仮名がないことを条件にする。

### L3（low）version の数字に個人情報が入りうる
- **問題**: version が数字だけでも、「1990.4.12」のように誕生日を運べます。届く先は bundle の中だけです。

## 3. 本文が外へ出る新しい経路

match.mjs の中にはありません。例外メッセージに入るのは、位置、行番号、recipe id、定数だけです。derive で文字列が通るのは options に列挙された値だけです。

## 4. 添付から判断できなかったこと

- テストが各処置と H1〜H3 の文を固定しているか（テストは添付されていません）。
- catalog の publish-guard の trigger。上の各文で、そもそも trigger が発火するかは trigger 次第です。
- `evidence.quote`・`matched`・`profile.file`・`profile.language` を受け取る側（emitter・CLI・metrics）が、それを plugin/**・stdout・export に書き出さないか。
- `profile.language` と `profile.format` が列挙値に限られているか。

**VERDICT: FAIL（high 3件）**
