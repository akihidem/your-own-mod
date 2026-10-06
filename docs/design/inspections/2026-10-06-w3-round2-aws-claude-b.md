# Inspection of W3 round 2, part B (generated tests, Node tests)

Reviewer: Claude (Opus) on AWS Bedrock via `ask-aws.sh` (files attached by path, not the running code) on 2026-10-06. Items the reviewer marked as unverifiable were checked by the integrator; dispositions are in `../REVIEW-LOG.md`.

# 独立検品 Part B（tests.mjs と test/emit.test.mjs）

添付された5ファイルだけで判断しました。`emit.mjs`、`manifest.mjs`、`register.mjs` の本体と、`matchesPhrase` の中身はありません。そのため、それらの挙動はテストが何を主張しているかから推定しています。推定に頼った項目には（推定）と書きました。

---

## 1. Privacy（プライバシー）

**P-1 medium｜src/templates/tests.mjs:8-9、DEFAULTS の出力部分**
- **問題:** `DEFAULTS` は manifest の `field.default` をそのまま `register.test.ts` に書き出しています。`field.default` は `proposal.params[name]` から来ています（emit.test.mjs の manifest テストで `deepEqual(field.default, proposal.params[name])` と確認済み）。そのため、`phrases` や `patterns`（string かつ multiple）、`language` にマニュアル由来の文が入ると、`plugin.json` と `register.test.ts` の両方に入ります。
- **不明な点:** 「phrases は never derived」「deriveParams は自由文を返さない」を emitter 側で再確認しているかは、`emit.mjs` が無いので分かりません。`rule placeholders` テストでは、catalog の options に `'fr'` を足してから使っています。このことから、options による照合はあると推定します（推定）。ただし multiple の string には options が無いので、照合の手段がありません。
- **修正:** emitter に次の検査を入れ、そのテストも書く。
  - 非 multiple の string は `options` に含まれる値だけを受け付ける。
  - multiple の string は、catalog の default と完全に一致する場合だけ受け付ける（never derived なので）。
  - どれかの値が evidence の quote や matched の部分文字列になっていたら throw する。
  - テストでは、`phrases` に `QUOTES[0]` を入れた bundle が拒否されることを確かめる。

**P-2 medium｜emit.test.mjs:184、`manifest.description`**
- **問題:** `profile.file`（manual の basename）が配布物の `plugin.json` と `marketplace.json` に入ります。ファイル名は本人が付けた自由文です。例えば `山田-通院メモ.md` のように、病名や氏名を含みえます。これは A5「plugin/ には manual 由来のものを何も入れない」の精神に反します。
- **修正:** description は `pluginName` と sha256 の先頭8桁だけで作る。ファイル名は PROPOSALS.md と PROPOSALS.json にだけ置く。

**P-3 medium｜emit.test.mjs:12-21、`principle-6-no-leak`**
- **問題:** `CANARIES` に含まれる quote は7本中4本だけです。`Three ticks…`、`<script>CANARY-script…`、`Four ticks…` の3本は漏れても検出されません。また、params 経由の漏洩は fixture にそもそも含まれていません。
- **修正:** canary を bundle から導く。具体的には、すべての `evidence[].quote` と `matched`、さらに quote を空白で区切った8文字以上の断片にする。

**P-4 medium｜PROPOSALS.md の `matched`（reports テスト）**
- **問題:** `matched` が code block の外に出ていないかを確かめるテストがありません。fixture の matched は `CANARY-MATCH` だけで、markup を含んでいません。matched が見出しや説明文に生のまま埋め込まれると、HTML やリンクとして解釈されます。
- **修正:** matched を `<img src=x>[l](https://x)` にした fixture を追加する。そのうえで `outside` に `CANARY-MATCH` が含まれないことを assert する。

---

## 3. matchesPhrase

**M-1 high（CONFIRMED。挙動はテストの assert から推定）｜emit.test.mjs:303-304、tests.mjs の receive 側の正例**
- **問題:** 正例の `'眠いカタカナー'` と `'眠いねよなわです'` から、helper は**任意の**かな6文字までを受け付けていると分かります。この規則では、普通の依頼が停止合図と判定されます。そうなると stop note（「次の作業を足さずに止まれ」）が付きます。
  - `あとでやって`（やって＝3）
  - `あとでおしえて`（4）
  - `あとでメモして`（4）
  - `終わりましたか`（4）
  - `一旦やめるかどうか`（5）
- **契約との関係:** 契約の表は「particles (ね・よ・な・わ・です・ます・だ)」と書き、「A phrase inside a longer request never matches」とも明記しています。上の例はこの2文に違反します。一方、依頼文側の要約「at most 6 hiragana/katakana characters」には合っています。凍結文書の中で2つの記述が衝突しているので、**本人の裁定が要る仕様分岐**です。
- **修正案:** suffix を助詞の並びのホワイトリストに限る。例: `^[\p{P}\s]*(?:(?:ね|よ|な|わ|です|ます|だ|ー|ぁ|ぇ)[\p{P}\s]*){0,6}$`。そのうえで、上の5例を negative として両方のテストに追加する。

**M-2 low｜誤って一致しない例**
- 一致すべきなのに外れる入力: `眠い😴`、`眠いｗ`、`tired lol`、`眠い（笑）`。
- `Tired` を大文字で書いた場合の挙動は分かりません。テストがありません。
- **修正:** 絵文字（`\p{Extended_Pictographic}`）を suffix に許すか決める。大文字小文字の扱いをテストで固定する。

**M-3 medium（判定不能）｜正規表現の escape と空 phrase**
- **escape:** テストに、正規表現の特殊文字を含む phrase がありません。
  - **修正:** phrase `a.b` に対して `axb` が一致しない、`(笑)` が一致する、`え?` に対して `え` が一致しない、というケースを追加する。
- **空 phrase:** userConfig で空の phrase `''` を設定できる場合、`はい`（かな2文字）が停止合図になりえます。テストは `['','']` の1件だけです。
  - **修正:** 空 phrase は無視する。`['はい','']` と `['！','']` が false になることを assert する。

---

## 4. 生成テスト（tests.mjs）

**T-1 medium｜tests.mjs の submit チェック（`seen[seen.length - 1]` を使う全箇所）**
- **問題:** 毎回「最後の要素」だけを見ています。そのため、module が prompt を**落としても**（next を呼ばなくても）、直前の正例の結果が残って検査を通ってしまいます。正例が続く箇所（`眠い…` 以降）と、長い ordinary prompt の箇所が該当します。これでは「never drops a prompt」を証明できていません。
- **修正:** 各 submit の前後で `expect(seen).toHaveLength(before + 1)` を確かめる。さらに bottom で `e.text` も記録し、本文が変わっていないことを確かめる。

**T-2 medium｜tests.mjs の export テストの出力条件（`if (guard || detectors.length || …lead-with-answer)`）**
- **問題:** command は bundle の中身に関係なく登録されます。それなのに、running-indicator、resume-brief、focus-timer、response-language だけの bundle では export の closed schema テストが出力されません。「string params を export しない」はプライバシーに関わる性質なので、こうした bundle では検証されないことになります。
- **修正:** export テストは常に出力する。COUNTS は空でもよい。

**T-3 medium｜publish-guard の fail-closed を確かめていない**
- **問題:** 「store の読み取りが throw したら deny」と「`.catch` の deny」を確かめるテストがありません。期限切れの grant（過去の時刻）で deny されるかも確かめていません。
- **修正:** throw する store mock の書き方は golden に無いので、kit で書けるかを確認する。書けるならケースを追加する。期限切れのケースは、clock を進めるか過去の値を入れて足す。

**T-4 low｜export のイベント側フィルタ**
- **問題:** 既知の recipe の下に未知の event（`free_text: 1`）や、文字列のカウントを入れたケースがありません。
- **修正:** `COUNTS` に `{ ...COUNTS[id], free_text: 1 }` を混ぜて投入する。

**T-5 low｜compose テスト**
- **問題:** section の `scope: 'session'` と、健康状態の推定に使うなという見出し行を確かめていません。
- **修正:** `expect(last.scope).toBe('session')` と、見出し文の一致を足す。

**補足（契約外の欠けている観点）:**
- allow-publish が `origin.kind === 'composer'` の時だけ通ること、1〜720 の境界、トーストの 60 秒 cooldown、subagent の無視、resume-brief が時刻と回数しか保存しないこと、の生成テストがどこにもありません。
- §7.1 はこれらを要求していないので欠陥ではありません。ただし、安全性とプライバシーの要点が実機でまったく検証されていない状態です。

**golden との突き合わせ:**
- matcher（`toBe`、`toEqual`、`toHaveLength`、`toMatch`、`toBeUndefined`）と、`on`、`mock.store`、`mock.clock` の使い方は golden の範囲内です。
- 判定できない点は末尾にまとめました。

---

## 5. 決定性とレポート

**D-1 low-medium｜emit.test.mjs:204、`outDirName`**
- **問題:** 相対パスの `mods/example` しか試していません。CLI が絶対パスの out を渡すと、PROPOSALS.md に `/home/<user>/…` が入り、環境によって出力が変わります（CLI のコードが無いので推定）。
- **修正:** outDirName は相対化するか、入力として受け付けたものをそのまま使う。絶対パスを渡したケースのテストを追加する。

**D-2 low｜reports テストの `inert(evidence.quote)`**
- **問題:** fenced code の中で HTML escape しています。CommonMark では code block の中の文字実体参照は解決されないので、本人のレポートに `&lt;img` という文字列がそのまま表示されます。fence の中に置くだけで既に無害です。
- **修正:** fence の中は原文のままにする。HTML の検査は `outside` に対してだけ行う。

**D-3 low｜同じテストの markup 検査が狭い**
- **問題:** 外側の markup 検査は `img`、`script`、`iframe` と `](http`、`![` だけです。`<a>`、`<details>`、`<!--`、autolink（`<https://…>`、裸の `https://`、`www.`）、参照リンク（`[x]: url`）は素通りします。
- **修正:** 外側の文字列に `/<[a-z!\/]/i`、`/https?:\/\/|www\./`、`/^\s*\[[^\]]+\]:/m` が含まれないことを assert する。

tests.mjs 自体には、時刻、乱数、パスは入っていません。並び順も入力から決まります。

---

## 6. Node 側のテスト

**世界を stub しているか:** していません。fs は実際の tmpdir を使い、child_process は本物の `claude` を spawn しています。

**`claude` が無い時:** ENOENT になると `assert.fail` するので、`KOKORO_MODS_SKIP_CLAUDE=1` 以外の値では skip しません。正しく作られています。

**N-1 medium｜emit.test.mjs の claude テスト**
- **問題:** 終了コード0だけで合格にしています。`claude plugin test` が0件のテストを見つけて0で終わった場合（ファイル名や登録の不一致）にも通ってしまいます。CLI の版（2.1.290）も確認していません。
- **修正:** stdout の結果件数（full では実行時7件、focus-timer では1件）と、`claude --version` を assert する。

**名前が中身より多くを主張しているテスト:**
- **medium｜`compose parameters and stop precedence remain independent of proposal order`:** proposal の順序は1通りしか試していません。順列を回して、出力がバイト単位で同じことを比べるべきです。
- **low｜`A8: repeated emission is byte-identical`:** 同じプロセス内で2回出力するだけです。TZ や LANG を変えた子プロセスでの比較がありません。
- **low｜`module shape follows the loader`:** 正規表現と文字列の切り出しによる形の検査だけです。さらに、hook の並び順に依存した切り出しは、順序が変わると空になり、検査が成り立たなくなります。
- **low｜`principle-6-no-leak`:** P-3 のとおり、quote の一部しか canary にしていません。

**N-2 low｜テストの欠け**
- `writePluginFolder` について、絶対パス（`/etc/x`）を拒否するか、再実行で `files` に載っていないファイルを残すか、`pluginName` が違う時に exit 5 になるかのテストがありません。

---

## 判断できなかったこと

- **emitter の本体:** `emit.mjs`、`stripEvidence`、`leakCheck` の実装が無いため、string params の検査があるか、全経路で strip しているか、leakCheck がどう正規化しているかは分かりません。
- **`matchesPhrase` の本体:** 正規表現の escape、空 phrase の扱い、大文字小文字の扱い、`ー` の分類が分かりません。
- **testing kit の挙動:** golden に次の点が出ていないため、生成テストが実際に通るかは判断できません。
  - `mock.clock` の初期時刻（grant `60_000` と `exportedAt === new Date(0)` はどちらも時刻0が前提）
  - `mock.store` に初期値を渡す書き方
  - `$.command.run` の戻り値が `.text` を持つか
  - for ループ内で `test()` を動的に登録できるか
- **実行結果:** claude を使うテストの実行ログが無いため、上の kit の点が実機で通るかは確かめられません。
- **slug の作り方:** `pluginName` の slug を何から作っているか分からないため、manual 由来の文字が入りうるかを判断できません。
- **再実行の挙動:** CLI と、一時フォルダから移動する再実行の実装が添付にありません。

**VERDICT: FAIL（high 1件：M-1。suffix 規則の解釈は本人の裁定が必要）**
