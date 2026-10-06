# kokoro-mods カタログ再々検品（src/catalog/index.mjs、a91675c..HEAD、fold 後）

**結論: FAIL（high 1件）。** H-1、M-1、L-2 は処置どおりに入っています。M-3 は fold で新しい穴が開き、L-1 は fold で後退しました。M-2、L-3、L-4、L-6 は部分的な実装です。

確認方法: 添付 diff の正規表現を node でそのまま組み立て、試験文を当てました。実測は 21 本で、下の「true/false」はその結果です。trigger と `unless` の組み合わせ方（行単位で判定するか）は添付に無いため、行単位と仮定しています。

## 1. 処置表の各行は実装されているか

| 行 | 判定 | 根拠 |
|---|---|---|
| H-1 | 実装済み | 「確認の質問はやめないで」は false。英語は否定語の lookbehind が入っている。ただし副作用あり（M-a、M-b、L-a） |
| M-1 | 実装済み | "before pushing notifications" と "push-notification" は false、"before pushing to main" は true。「同じ文の中だけ」も、両側型が `[^.!?;]*` になっている |
| M-2 | 一部のみ | 4文字の上限は入った。ただし「短く答えなくていい」「短くまとめようとしないで」は false で、反対の依頼が素通りする（L-b） |
| M-3 | 未達（後退あり） | PR の境界は入った。しかし「目的語と数が同じ節にある」は実装されていない。下の H-1、M-c |
| L-1 | 後退 | "My typos: please don't point them out" が `unless` に true で一致する（M-d） |
| L-2 | 実装済み | "I'm a professor" を拾う形になった |
| L-3 | 一部のみ | 「門の語」に `確認` が入っており、門としての限定がほぼ効かない（L-c） |
| L-4 | 一部のみ | 「あとで出したら」と「おわりって言ったら」は直った。同じ型の「あとでいったら」（後で行ったら）、「あとで打ったら教えて」は引き続き trigger する（L-d） |
| L-5/L-6 | 一部のみ | 古いコメントと「説明コメント」は直った。区切りから `、` を外したため、別の節の数字を拾う（L-e） |

## 2. 残る指摘

**HIGH H-1**　`JA_CHAR_TRIGGER` / `EN_CHAR_TRIGGER`（brevity の trigger）
- 問題: 目的語の除外が「数字より前」を見る lookbehind だけになった。旧版は行全体の lookahead で、目的語が後ろにあっても除外していた。そのため後置の形が素通りする。
  - 「50文字以内のコミット件名にする」→ true
  - "Wrap at 72 chars max in commit bodies" → true
  - "Limit to 50 characters max for commit subjects" → true
- 影響: H8 と同じ種類の誤提案（コミット件名の上限が「短く答える」規則になる）が戻った。
- 修正案: 数字の後ろ、同じ節の中（日本語は `[^。！？、]{0,16}`、英語は `[^.;,!?]{0,24}`）にも目的語を否定する lookahead を足す。テストに後置の形を加える。

**MEDIUM M-a**　quiet-confirmations の英語 `unless`
- 問題: `\b(?:keep|continue) (?:…|confirming|asking)` が "don't keep asking" の中で一致する。
- 例: "Don't keep asking me to confirm; just do it" → `unless` が true になり、正当な依頼が抑止される。
- 修正案: この分岐の前に `(?<!\b(?:don['’]t|do not|never|stop)\s)` を付ける。

**MEDIUM M-b**　quiet-confirmations の日本語 `unless`
- 問題: `(?:やめ|減らし|控え|省)[^。！？]{0,6}?(?:ない|ません|るな)` が許可や丁寧な依頼の言い回しまで拾う。
- 例: 「確認の質問はやめて構わない」→ true、「控えてもらえませんか」も同型。
- さらに、`unless` は同じ行の別の trigger（「都度確認不要」など）もまとめて殺す。
- 修正案: 否定は動詞の直後（`ない(?:で|でください)?|ません(?!か)|るな`）に限る。「構わない／問題ない／もらえませんか」は除外する。

**MEDIUM M-c**　`JA_CHAR_OBJECT` / `EN_CHAR_OBJECT` の後ろ向き窓（`JA_CHAR_TRIGGER` / `EN_CHAR_TRIGGER` / `JA_CHAR_LIMIT` / `EN_CHAR_LIMIT`）
- 問題: 窓が `、` や `,` をまたぐ。そのため、同じ行の本物の brevity 依頼が拒否される。処置表の「同じ行の他の要求は提案される」に反している。
- 例: 「件名は英語、回答は200字以内」→ false、"Commit subjects in English, replies under 200 chars" → false。
- 修正案: 窓から `、,` も外して節の境界にする。

**MEDIUM M-d**　accept-typos の英語 `unless`
- 問題: 否定の lookbehind が "typos" の前にしか効かず、`[^.,!?]*` の中にある否定を見ていない。
- 例: "My typos: please don't point them out" → `unless` が true になり、正反対の依頼で accept-typos が抑止される。
- 修正案: `point` の直前にも `(?<!\b(?:not|never|don['’]t|do not)\s)` を置く。

**LOW L-a**　quiet-confirmations の英語 trigger
- 問題: 否定語と動詞の間に副詞が入ると、否定を見逃す。
- 例: "Never just skip the confirmation step" → true。
- 修正案: lookbehind を `(?:never|not|don['’]t|do not)(?:\s+(?:ever|just|simply))?\s` に広げる。`unless` 側も同様。

**LOW L-b**　brevity の日本語 `unless`
- 問題: 否定の形として `ない|ず` しか見ていないため、「〜なくていい」と、動詞からの距離が5文字以上の否定を取りこぼす。
- 例: 「短く答えなくていい」と「短くまとめようとしないで」は、どちらも反対の依頼なのに `unless` に一致しない。
- 修正案: `(?:ない|なく(?:て|ても)|ず)` にし、上限を6文字にする。

**LOW L-c**　block-ahead-warning の日本語 trigger
- 問題: 門の語に `確認` が入っており、「売上を確認したら失速していた」のような文で trigger する。
- 修正案: `確認` を外すか、`確認(?:ダイアログ|画面)` に限る。

**LOW L-d**　respect-stop-signals
- 問題: 「あとで」＋「いったら／打ったら」で引き続き trigger する。例「あとでいったら」（後で行ったら）、「あとで打ったら教えて」。
- 修正案: 「あとで」の時だけ、引用符か「と／って」を必須にする。

**LOW L-e**　`JA_CHAR_LIMIT`
- 問題: 区切りから `、` を外したため、別の節の数字を返答の上限として抽出する。
- 例: 「回答は日本語で、引用は200字以内」→ max_chars=200 が抽出される。
- 修正案: `、` は「回答は、」のように直後に来る1つだけを許す（`(?:は|も)?、?` の後に `[^。、,;]{0,12}?`）。

**LOW L-f**　publish-guard の3本目の trigger
- 問題: 隣接だった "push without" が「節の中のどこか」に広がった。処置表にない拡張です。
- 例: "Never push to main without running the tests" → true。publish の確認規則が提案される。
- 修正案: `without` の後ろを `(?:asking|confirmation|permission|approval|my)` に限る。

## 3. 本人の manual のテキストが外へ漏れる新しい経路

diff の範囲には見当たりません。抽出のキャプチャは数字のグループだけです。変更は正規表現とコメントだけで、出力や記録の呼び出しは追加されていません。

## 4. テスト

テストは添付されていません。そのため、否定のケースが「ガードが効いていること」を示しているのか、「単に trigger が一致しないだけ」なのかは判断できません。H-1 と M-a〜M-d は、少なくとも trigger が一致する文に否定を足した形でテストする必要があります。

## 5. 添付から判断できなかったこと

- `right()` / `unless()` / `publishPolarity` の判定単位（行か節か）と、trigger と `unless` の評価順
- 抽出した値が plugin/**、metrics、stdout/stderr へ流れる経路
- テスト本体と、DESIGN §5.4a の正確な文言

**VERDICT: FAIL（high 1件）**
