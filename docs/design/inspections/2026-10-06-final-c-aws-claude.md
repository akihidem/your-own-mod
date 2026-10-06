# kokoro-mods チャンク C（emitter・テンプレート・生成される plugin）検品報告

添付のテキストだけで判断しました。添付には行番号が無いので、場所はファイル名と関数名、またはコード片で示します。

## 1. プライバシーの約束（DESIGN §2・A5）

**[medium] 漏えい検査の針（needle）が凍結契約と違う** — `src/emit.mjs` の `emitPlugin`（`needles` の組み立て）
- **問題:** 添付の §5.5 は「すべての `quote` と `matched` を針にする（空文字だけ除く）」と凍結しています。コードは `matched` を外し、`LEAK_CHECK_MIN_CHARS`（コメントでは 12 文字）未満の quote も外しています。
  - コメントには「DESIGN を合わせた」とありますが、添付の v0.2.2 brief は旧い文面のままです。
  - 日本語は 12 文字未満でも 1 文になります（例: 「結論から先に」）。そのため短い行は二重目の防御からまるごと漏れます。
  - 一重目の防御（evidence を外してテンプレートへ渡す）は成立しています。ただ、二重目は短い行に対して働きません。
- **修正:** 空でない quote と matched をすべて針に戻します。そのうえで「カタログが書いた文字列（title・summary・rule・note・param の既定値・options）に含まれる針だけを免除する」許可リスト方式にします。あわせて、DESIGN 本文とこの brief の版をそろえます。

**[medium] `pluginName` と slug を emitter が検査していない** — `renderManifest`、`renderRegister`、`renderTests`
- **問題:** `bundle.pluginName` は `plugin.json` の `name`、`marketplace.json`、`register.ts`、テストにそのまま入ります。ここは公開される側です。
  - 二重目の防御は quote しか見ないので、slug に本人の名前が入った場合は止められません。たとえば slug が frontmatter の name や元のファイル名から作られる場合です。
  - JSON として埋め込まれるので、コードを差し込まれる心配はありません。
- **修正:** `emitPlugin` の冒頭で `/^kokoro-mods-[a-z0-9]+(?:-[a-z0-9]+)*$/` と長さの上限を確かめ、合わなければ throw します。slug をどう作っているかが別のチャンクにあるため、深刻度は暫定です。手書きの名前から作るなら high になります。

**[low] bundle の他の値を検査していない** — `renderManifest`
- **問題:** `profile.sha256` が 64 桁の16進数か、`enabledByDefault` が boolean か、`tool.version` の形を確かめていません。今は内部で作られる値ですが、manifest に直接入ります。
- **修正:** 型と正規表現で確かめます。

**[low] leakCheck は表記の揺れを見ない** — `leakCheck`
- **問題:** 一致を見るのは元の表記と JSON エスケープした表記だけで、NFKC 正規化や大文字小文字の違いは見ていません。
- **修正:** 両側を NFKC にしてから比べます。

**問題なしと確かめたこと:**
- `E_LEAK` のメッセージはパスだけを出します。`slice(0, indexOf(': '))` で切っており、パスには `': '` が入りません。
- `E_PARAM_FREE_TEXT` は id と param 名だけを出し、値は出しません。
- 生成されるモジュールは `e.text` と `e.answer` を保存も出力もしません。`e.answer` は行数を数えるだけです。
- status 行に出るのはツール名だけです。
- 書き出し（export）の options は数値と boolean に限られ、metrics は EVENTS の枠に組み直されます。

## 2. 失敗したら止まるか（fail-closed）

**[medium] 不正な正規表現が黙って素通りになる** — `register.mjs` の publish-guard
- **問題:** `try { return new RegExp(src).test(e.command) } catch { return false }` となっています。正規表現として壊れたパターンは「当たらない」扱いになり、そのパターンが守るはずの公開操作が通ります。配列であることは確かめていますが、各パターンが有効かどうかは確かめていません。
- **修正:** ガードの中で先に全パターンをコンパイルします。1 本でも SyntaxError なら、固定の invalid-configuration 文で deny します。テストも足します（§5）。

**[low] boolean の option には既定値の補完が無い** — `normalizeOptions`
- **問題:** 補完されるのは数値だけです。host が boolean のキーを渡さないと `!o.publish_guard` が真になり、ガードが切れます。manifest の既定値が true でも同じです。DESIGN が求めているのは数値の補完だけなので契約違反ではありませんが、ガードは安全側に倒れません。
- **修正:** `BOOLEAN_DEFAULTS` を作って補完します。

**[low] 数値を実行時に範囲内へ丸めていない** — `startFocus`、`startRunning`
- **問題:** `interval_minutes` が 0 なら `$.clock.every(0)` になり、`long_turn_seconds` が負なら即座に発火します。host が userConfig の min/max を強制しているかは、添付からは分かりません。
- **修正:** レシピの min..max に丸めます。

**問題なしと確かめたこと:**
- 自由記述の param（options の無い string）は、既定値と完全に同じ時だけ受け付けます。単数でも `multiple` でも同じです。
- 必須の param が欠けたら TypeError になります。
- leakCheck はファイルを書く前に走ります。
- `writePluginFolder` は全パスを先に検査します。
- 「一時フォルダーに書いてから入れ替える」処理と `maxEnabled` はこのチャンクにありません。

## 3. 生成されるモジュールのガードの意味

**[medium] 状態がモジュール全体で共有される** — `SUPPORT`、`METRICS`、`TOAST` などの `let`
- **問題:** `chain`、`interactive`、`cwd`、`lastToastAt`、`timer`、`focusTimer` が `register` の外にあります。
  - 同じプロセスで `register` が何度も呼ばれると、状態が混ざります。各テストの呼び出しや、同時に動く複数セッションが該当します。
  - 例: 前のテストの `lastToastAt` がクールダウンを効かせる、他のセッションの `cwd` で resume キーを作る。
- **修正:** 状態を `register` のクロージャの中へ移します。

**[low] 句末の閉じた集合を広げている** — `PHRASE_SUFFIX`
- **問題:** `[ーぁぃぅぇぉっ]` が入っていますが、凍結された集合（ね・よ・な・わ・です・ます・だ・よね・かも）にはありません。生成テストの「眠いーっ」はこの拡張に頼っています。
- **修正:** DESIGN 付録 A を改訂するか、この文字を外してテストも直します。

**[low] `$.session.cwd()` が Host 型に無い** — resume の `turn.complete` 側
- **問題:** kit に実在する API かどうか、添付からは判断できません。失敗しても try で握りつぶされ、resume 機能が黙って動かなくなります。

**問題なしと確かめたこと:**
- grant の読み込みは `next` より前で、読み込みが throw したら `.catch` の中で deny します。
- 状態を変えるコマンド（`export <path>`、allow-publish、focus、reset）は composer からだけ受け付けます。status と `export --print` はどこからでも答えます。
- allow-publish は 1..720 です。
- 句の一致は発話まるごとで判定し、stop が優先されて注記は 1 つだけです。
- toast のクールダウンは 60 秒をレシピ全体で共有し、見送った分は `suppressed` に数えます。
- subagent は running、turn.complete、focus から除外されます。publish-guard は subagent にも効きますが、これは正しい挙動です。

## 5. テスト

**[medium] composer 限定の門を実際には試していない** — `tests.mjs` の `exportChecks` の最後
- **問題:** `expect(register.toString()).toMatch(/…must be typed by the user\./)` は、ソースにその文字列があることしか確かめていません。拒否の動きは検証していません。コメントは「Node テストで origin を付けて実行する」と言いますが、そのテストは添付にありません。
- **修正:** kit が origin を渡せないなら、Node 側のテストで `e.origin.kind = 'plugin'` を付けて実際に呼び、拒否されることを確認します。その Node テストを検品対象に入れてください。

**[low] 共通の否定ケースが、receive-only だけの bundle では何も証明しない** — submit テストの共通ブロック
- **問題:** 「あとでテストして」「終わりました」などは、stop が bundle に無いと、ガードではなく引き金そのものが無いせいで通ります。receive-only の上書き phrases に「あとで」「終わり」が入っていないためです。
- **修正:** stop 系の否定ケースは `if (stop)` のブロックへ移します。receive-only だけの bundle には「疲れたけどやる」型だけを残します。

**[low] compose の on テストが中身を確かめていない**
- **問題:** 見出しの行しか確かめておらず、プレースホルダーが置き換わったかを見ていません。
- **修正:** `not.toMatch(/\{(min|max|language|max_lines|max_chars_clause)\}/)` を足し、規則の行数がレシピ数と同じであることも確かめます。

**[low] テストが無い挙動**
- 不正な patterns（配列でない値、壊れた正規表現）での deny
- allow-publish の範囲 1..720
- 共有の toast クールダウン
- running、focus、resume

§7.1 は必須にしていませんが、項目 3 の挙動を証明するものはありません。

**問題なしと確かめたこと:**
- ガードのテストは「下の hook に届いていない」ことで deny を証明しています。単に引き金が無いだけ、という形ではありません。
- 店（store）が throw するケースは、固定の文言まで確かめています。
- 文字数の境界（24/25、40/41）はきちんと押さえています。

## 判断できなかったこと

- slug と `pluginName` がどこから作られるか
- `LEAK_CHECK_MIN_CHARS` の実際の値（コメントでは 12）
- DESIGN 本文が本当に改訂されたか
- 一時フォルダーから入れ替える処理、`maxEnabled`、CLI の終了コードと出力
- Node 側のテスト（emitter の throw、leakCheck、composer の門）
- 実際の `claude` 実行ファイルで `plugin validate --strict` と `plugin test` を通したかどうか
- kit が `$.session` を持つか、`turn.*` に `.catch` が必要か、host が userConfig の min/max を強制するか
- README（このチャンクにはありません）

## 検品した integrator の修正（コメントで印のあるもの）

1. emit.mjs の針の集合（quote は 12 文字以上だけ、matched は外す。round 3 の後）→ 上の medium の指摘
2. tests.mjs の export を別テストに分けたこと（`separateExport`、T-2）→ 妥当
3. tests.mjs のガードテストを、grant の状態ごとに `mock.store` で別テストにし、store が throw するケースは自前の bottom にしたこと → 妥当
4. tests.mjs の壊れた記録の書き出しテストを `mock.store` で用意したこと → 妥当

**VERDICT（このチャンク C について）: PASS — high は 0 件**（medium 5 件、low 9 件）

ただし条件が 2 つあります。slug を作る処理が手書きの名前を使っているなら、`pluginName` の指摘は high に上がり、判定は FAIL です。もう 1 つは、DESIGN と針の集合のずれを本文の改訂で確かめることです。
