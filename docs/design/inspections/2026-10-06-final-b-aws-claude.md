# kokoro-mods 検品報告：Chunk B（レシピカタログ `src/catalog/index.mjs`）

**判定: FAIL。high が 2 件あります。** どちらも安全レシピの `publish-guard` で、確認の門を求めている行が「確認は要らない」という意味の行として扱われ、門が提案されません（安全側に倒れない）。

## 検証の方法
添付のカタログを `/tmp/km/` に写し、該当する trigger・unless・deriveParams を Node で実行しました。matcher 本体は添付に無いので、判定は次の簡易ロジックで代用しています。「trigger が当たり、unless が同じ行に当たらなければ hit」。下の例文は、すべてこの実行で結果を確かめたものです。

---

## 1. プライバシー（DESIGN §2, A5）— カタログ側で漏れる経路は見つかりませんでした

- 文書に入る文はすべてカタログ内で書いたものです。対象は `rule` / `note` / `title` / `summary` / `description` で、手帳の文は入りません。差し込まれるのは `{min}{max}{max_lines}{max_chars_clause}{language}` だけで、どれも数か固定の語です。
- deriveParams が返すのは数値（lead-with-answer・offer-options・focus-timer）か、`'ja'|'en'|profile.language` のどれか（response-language）だけです。自由な文字列は返しません。phrases と patterns は導出していません。
- `matched` は `[^。！？]*` を含む trigger で長くなり、本人の文がそのまま PROPOSALS に入ります（例：「あとでPRを出したら」）。報告ファイルは非公開の扱いなので契約違反ではありません。ただし、`matched` が `plugin/**` やメトリクスに渡らないことは emitter の Chunk で確かめる必要があります。
- 禁止語（付録 A の英語リスト）を全文と目で照合しました。該当はありません。

## 2. 指摘（重い順）

### HIGH-1 `publishWaiver()`：禁止の語が足りず、門を求める行を打ち消す
- **場所:** `publishWaiver()` の `cancellation`、および publish-guard の `unless`
- **問題:** 打ち消しの語は `ASK|ない|禁止|ダメ|だめ|な|never|not|don't|no…` だけです。このため、次の行が「確認不要」と同じ扱いになり、hit が消えます。
  - 「確認しないでpushするのはやめて」
  - 「確認なしのpushは厳禁」
  - "Pushing without asking is forbidden"
  - "Avoid pushing without confirmation"

  どれも本人が門を求めている行で、§5.4a の「迷ったら門を残す」に反します。
- **直し方:**
  - 打ち消し語に `やめ|NG|厳禁|禁|いけない|許さ|困る|forbid\w*|prohibit\w*|avoid|stop|must(?:n['’]t| not)|should(?:n['’]t| not)|not (?:ok|allowed)` を加える。
  - できれば向きを逆にする。打ち消し語を列挙するのをやめ、免除を表す語（`不要|しなくていい|OK|構わない|fine|go ahead`）が文の述語になっている時だけ免除として扱う。
  - 上の 4 文を回帰テストにする。

### HIGH-2 `push notification` / `push通知` が行全体を打ち消す
- **場所:** publish-guard の `unless('any', /\bpush notifications?\b|push\s*通知/iu, …)`
- **問題:** §6 では、これらの修飾語は「その一致だけを外し、push/PR/Issue を含む行は打ち消さない」と決まっています。ところが実装は行ごと打ち消します。次の 2 行は門が提案されません。
  - "Push notifications are fine, but ask me before you push"
  - 「push通知の実装はOK。pushの前には必ず確認して」
- **直し方:** unless から外し、`JA_PUBLISH_OBJECT` と英語の trigger の側で否定先読みにする。`\bpush(?!\s*(?:通知|notifications?))\b`。`非公開`・`公開鍵` と同じ形です。

### MEDIUM-1 lead-with-answer：「500文字以内」が拾えない
- **場所:** `JA_CHAR_LIMIT`、unless の `字以上`、integrator の修正行
- **問題:** どれも数字の直後に `字` が来る形しか見ていません。日本語で一番よく使う「500文字以内」は trigger にも導出にも当たりません。逆向きの指定も打ち消せず、「簡潔に、ただし500文字以上で」が hit になります（逆の振る舞い）。
- **直し方:** 3 か所すべてで `\s*(?:文字|字)` にする。

### MEDIUM-2 lead-with-answer：逆を求める行で発火する
- **問題:** 次の 2 行が hit になります。
  - 「短く答えないで」
  - "Don't be too brief"

  unless にあるのは `短くしないで`、`not too`、`don't be brief` だけで、これらの形を取りこぼしています。§6 の極性ルール（`短くしないで` で発火しない）の趣旨に反します。
- **直し方:**
  - 日本語の unless に `短く(?:答|まと|返|書)\S*?ない` を加える。
  - 英語は `(?:do not|don['’]t|never) be (?:too )?(?:brief|concise)` にする。

### MEDIUM-3 lead-with-answer.max_chars：別の対象の上限から導出する（H8 の残り）
- **問題:** 「返答は簡潔に、ブランチ名は30字以内」から `max_chars=30` が出ます。integrator の修正は対象名を列挙して除く方式なので、`ブランチ名`・`変数`・`PR` などの抜けがいくらでも残ります。§5.4a は「上限が回答にかかっている行だけ」から導出すると定めています。
- **直し方:** 回答を表す語と数字を同じ節の中で隣接させて読む。例：`(?:回答|返答|答え|説明)[^。、,;]{0,12}?(\d+)\s*(?:文字|字)\s*(?:以内|…)`。英語も同じ形で、`(?:answers?|repl(?:y|ies)|responses?)\b[^.,;]{0,20}?(?:under|within|…)`。

### MEDIUM-4 accept-typos-as-intent：指摘してほしい行を「指摘しない」規則に変える
- 「誤字は指摘して、見落としたくないので」→ hit します。原因は unless の `(?![^。！？]*ない)` で、同じ節の後ろにある、無関係な「ない」でも打ち消しが外れます。
- 「誤字があったら教えて」と "I make typos; please point them out" → hit します。`教えて|知らせて|them` の言い方を拾えていません。
- **直し方:**
  - 先読みを動詞の直後の否定だけにする：`(?!(?:ほしく)?ない|ないで|なくて)`。
  - 動詞に `教えて|知らせて` を加える。
  - 英語に `point (?:them|it) out|let me know about (?:my )?typos` を加える。

### MEDIUM-5 response-language：言語を取る位置が誤り（§5.4a の凍結事項に反する）
- **問題:** 「常に英語の資料を読むが、返答は日本語で」→ `en` になります。`常に(日本語|英語)` が先の位置で当たるためで、§5.4a が防ごうとした型そのものです。
- **直し方:** `常に(日本語|英語)で(?:返|答|応答|話)` に絞る。または、返答を表す語の側の選択肢を先に評価する。

### MEDIUM-6 focus-timer.interval_minutes：凍結した導出元が 1 つ増えている
- **問題:** 4 つ目の選択肢 `タイマー(を)?N分で入れ` は §5.4a の「only from」の外です。「タイマーを25分で入れて」から 25 が出ます。
- **直し方:** 削除する。必要なら DESIGN を `refreeze --reason` で更新する。

  あわせて注記します。「1時間以上休憩なしで作業しがち」から 60 が出るのは、凍結した仕様どおりの振る舞いです。将来の改訂候補として残します。

### MEDIUM-7（条件付き）`cell:'left'` の trigger が箇条書きにも当たるなら逆転する
- **問題:** 「一案だけ出して」が offer-options に、「念のため確認してね」が quiet-confirmations に当たります。表の左のセル（避けたいこと）なら正しい読みですが、箇条書きでは逆の要望です。matcher が left の trigger を `row` 以外にも当てるかどうかは、添付からは判断できません。
- **直し方:** matcher で `cell:'left'` の trigger を表の行だけに限る。そのことをテストで固定する。

### LOW
- **respect-stop-signals:** 「あとでPRを出したら確認して」→ hit します。`あとで…出したら` は仕様の表どおりですが、普通の作業手順の文で誤発火します。`出したら` を `(?:合図|シグナル)を出したら` にすると直ります。
- **expert-role-with-evidence:** "I work as a professor" → hit します。自己紹介の文で専門家の役が付きます。`about` 節を除外するか、`answer as a` / `act as a` に絞ると直ります。
- **focus-timer:** 「タイマーを使うのはやめて」→ hit します（逆の要望）。unless に `タイマー[^。！？]*(?:やめ|不要)` を加えると直ります。
- **block-ahead-warning:** 表にある単独の `手数が増える` / `失速` の trigger がありません。「手数が増えると失速する」が当たりません。安全側に倒れる縮小なので、仕様と合わせるかどうかを決めて記録してください。
- **節全体の `[^。！？]*(?:ない|不要)` 型の unless:** 打ち消しが広すぎて取りこぼします。例：「日本語で答えてください、分からない単語は英語併記で」→ 打ち消されます。安全側ですが、提案が黙って消えます。
- **evidence の既定値:** `recipe()` が「KOKORO SPEC §1.2 / §7」を、仕様が指定していない 10 本にも付けています。注記は正直ですが、§6 の対応表と食い違っています。`cogsync` は参照先が特定できません。

## 3. テストと README について
カタログのテストは添付に無いため判断できません。§6 は各レシピに「言語ごとに肯定 1 件と極性否定 1 件」のテストを求めています。上の MEDIUM-2 と MEDIUM-4 の文は、その極性否定の最初の候補です。HIGH-1 と HIGH-2 の 6 文は、publish-guard の否定テスト（門が残ること）に加えてください。

publish-guard の `summary` は保護の限界（Bash 以外のツール、内部で push するスクリプト）を ja/en とも明記しています。ここは正確です。

---

## 添付から判断できなかったこと
- matcher：`matched` の決め方、left の trigger を当てる範囲、確認と免除が同じ行にある時に confidence を medium で止める処理、上限の切り詰め、evidence の選び方
- emitter：`{language}` の埋め方、profile-rules の見出し、`matched` が `plugin/**` に入らないこと
- CLI、テストファイル、README、生成されるモジュールのガード処理（§5.7 の diff、終了コード）
- `profile.language` が取りうる値

## 確認した integrator の修正（印の付いたもの）
- **lead-with-answer の対象名 unless（H8、「Integrator's correction」）：** 方向は正しいです。ただし列挙方式なので漏れがあり（MEDIUM-3）、`文字` を見ていない（MEDIUM-1）ため、修正としては不完全です。
- 印の付いた修正はこの 1 件だけでした。

**VERDICT: FAIL（high 2 件）**

確認に使った写しとプローブは `/tmp/km/` にあります（`index.mjs` と `probe.mjs`、`node probe.mjs` で再実行できます）。
