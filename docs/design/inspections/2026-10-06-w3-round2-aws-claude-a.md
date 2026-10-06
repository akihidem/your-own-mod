# Inspection of W3 round 2, part A (emitter, manifest, module, reports)

Reviewer: Claude (Opus) on AWS Bedrock via `ask-aws.sh` (files attached by path, not the running code) on 2026-10-06. Items the reviewer marked as unverifiable were checked by the integrator; dispositions are in `../REVIEW-LOG.md`.

# kokoro-mods emitter 独立検品レポート

検品の範囲は、添付された5ファイル（契約抜粋、`src/emit.mjs`、`src/templates/manifest.mjs`、`register.mjs`、`proposals.mjs`）と golden のテストファイルです。行番号は添付テキストから数えた概算で、「付近」と書いた箇所は ±3 行程度ずれることがあります。

---

## 1. プライバシー（最重要）

**経路の追跡結果**
- `evidence[].quote` と `matched` は `plugin/` に届きません。
  - `emitPlugin` は `stripEvidence(bundle)` を通した `input` だけを `renderManifest`、`renderRegister`、`renderTests` に渡しています（`emit.mjs:50-55`）。
  - `buildUserConfig` は evidence を持つ proposal を拒否します（`manifest.mjs:18`）。`renderRegister` もこれを呼ぶので、同じ門を通ります。
  - レシピ側の `evidence`（出典の参照で、本人の文章ではありません）も `pluginRecipes` から外されています。
- export の `options` に文字列は入りません。`optionSnapshot` は `OPTION_KEYS` に入っている number と boolean のキーだけを、さらに実行時の型も確認してから出しています。
- module（register.ts）の本文には、param の値が埋め込まれません。参照は `o.<key>` だけです。

**指摘**

**[high] `manifest.mjs:45-58`（buildUserConfig の param default）。param の文字列が無検査のまま `plugin.json` に入ります**
- 問題: `proposal.params` の値が `userConfig.<key>.default` にそのまま書かれます。検査は型だけです。
  - `options` を持たない単一の string と、`multiple` の string 配列は、どんな文字列でも通ります。
  - 契約では「phrases/patterns は never derived」「deriveParams は自由文字列を返さない」と決めていますが、emitter 側はそれを強制していません。
  - そのため、deriveParams の不具合や、手で編集された bundle があると、取扱説明書の文章が配布物の `plugin.json` に載ります。
  - しかも `leakCheck` は `emitPlugin` の中で呼ばれていません（`emit.mjs:37-59`）。A5 の最後の防壁が配線されていない状態です。
- 修正案:
  - (a) `options` を持たない string と multiple string は、`recipe.params[name].default` と完全に一致する時だけ受け付け、一致しなければ throw する。
  - (b) `emitPlugin` の最後で、全 proposal の `quote` と `matched` を needle にして `leakCheck` を呼び、1件でも見つかれば throw する（fail-closed）。

**[medium] `manifest.mjs:76`。`bundle.profile.file`（取扱説明書のファイル名）が `plugin.json` と `marketplace.json` の description に入ります**
- 問題: ファイル名に本人の氏名や病名が入ることは十分あり得ます（例: `hanako-うつ-取説.md`）。配布物にファイル名を載せる必要はありません。
- 修正案: description は `Mods proposed by kokoro-mods (profile <sha8>)` に固定し、ファイル名は PROPOSALS.* だけに残す。

**[low] `emit.mjs:85-88`（leakCheck）。空文字の needle が全ファイルに一致します**
- 問題: 空文字は全ファイルに一致するので、1文字の `matched` も誤検知の元になります。
- 修正案: 長さ 0 の needle を除外する。

---

## 2. 生成される TS module

| 項目 | 判定 |
|---|---|
| `$` の使い方 | `$.noun.method()` の形か、module 冒頭で宣言した関数（readMetrics/bump/toast/startRunning/startFocus/writeExport/resetMetrics）への受け渡しだけで、ルールに違反していません。closure 内の `toast($, …)` も、宣言済み関数への受け渡しです |
| gating hook の `.catch` | prompt.submit、tool.call（Bash）、tool.call（any）の3つとも付いています |
| guard の順序 | grant を読んでから `next` を呼んでいます。store の読み込みが throw すると `.catch` で deny されます。正しい作りです |
| submit | note は1つだけで、stop-signals が先に判定されます。例外時も `next(e)` に流すので、プロンプトは落ちません |
| allow-publish | `origin.kind === 'composer'` を要求し、値は `/^\d+$/` で、さらに整数かつ 1..720 であることを確かめています |
| metrics | 1本の chain で直列化しています。export と status は `await chain` してから読みます |
| toast の共有間隔 | `await` の後で判定と予約を同期的に行うので、並行する呼び出しでも共有されます |
| subagent の除外 | turn.start、tool.call、turn.complete のすべてで `agentId` を確認しています |
| 保存する内容 | resume-brief が保存するのは `{at, turns}` だけで、`e.answer` は行数を数えるのに使うだけです |

**指摘**

**[medium] `register.mjs` command.run 付近（約 377-380 行、`export`）。composer 以外の起動元からでも、任意の絶対パスに書き込めます**
- 問題: `export <abs path>` には origin の検査がありません。モデルやスキルなど composer 以外の起動元が `/kokoro-mods export /home/u/.bashrc` を実行すると、そのファイルが JSON で上書きされます。`reset` と `focus` も同じく origin を見ていません。
- 修正案: path を指定する `export` と `reset` は `e.origin.kind === 'composer'` に限定する。`export --print` はそのままでよい。

**[low] guard 付近（約 247-250 行）。patterns の型を確認していません**
- 問題: `publish_guard_patterns` が配列でない時、`.some` が throw します。その結果 `.catch` で deny され、`ls` を含むすべての Bash 呼び出しが止まります。安全側には倒れますが、契約の「validate options」が実質的に行われておらず、原因も分からないまま全部止まります。
- 修正案: 配列でなければ、固定文の deny で「設定が不正」と明示する。

**[low] guard の `.catch`（`next.called ? next(e)`）。下流が throw すると Bash を2回実行する可能性があります**
- 問題: grant で通した後に下流が throw すると、もう一度 `next(e)` が呼ばれ、同じ Bash コマンドが2回走る可能性があります。この形は契約 §7 が指定したものなので、実装ではなく契約側の懸念として記録します。

**[low] `long_turn_seconds` と `interval_minutes` を検証していません**
- 問題: 値が欠けると、`after` と `every` が NaN ミリ秒で呼ばれます。

---

## 3. matchesPhrase

- **正規表現の特殊文字**: `===` と `startsWith` で比べているので、エスケープは不要で、安全です。
- **[medium] 普通の依頼が誤って一致します（`PHRASE_SUFFIX`、`register.mjs:41`）**
  - 問題: 後ろの文字を「助詞」ではなく「任意のひらがな・カタカナ」で受けています。stop が優先されるので、作業を頼んだのに「止めたい合図」の note が付きます。
    - `あとでテストして`: テスト（3文字）＋して（2文字）
    - `終わりました`（完了の報告）
    - `終わりにしないで`（意味が逆）
    - `疲れたけどやる`
    - `疲れたのでレビュー`（ちょうど6文字）
  - 契約の表は助詞を「ね・よ・な・わ・です・ます・だ」と書き、同時に「A phrase inside a longer request never matches」とも書いています。実装は、そのうち緩い方の読み方を採っています。**契約の中に矛盾があり、本人の判断が必要**です。
  - 修正案: 助詞を閉じた集合 `(?:ね|よ|な|わ|です|ます|だ|よね|かも)` の繰り返し（合計6文字まで）に限定し、上の例を回帰テストに入れる。
- **[medium] 英語の phrase がほとんど一致しません**
  - 問題: 大文字小文字を区別するので、文頭が大文字の `Stop for now`、`That's enough`、`Tired.` は一致しません。スマート引用符 `that’s` も一致しません。
  - 修正案: 両方を `toLowerCase()` し、NFKC と `’→'` で正規化してから比べる。
- **[low] 記号のある入力が一致しません**
  - 問題: `\p{P}` に記号（`\p{S}`）が入っていないので、`眠い~`、`疲れた😢`、`つらい♪` が一致しません。
  - 問題: phrase 側を trim していないので、設定に空白が混ざると一致しません。

---

## 4. 生成されるテスト

**`src/templates/tests.mjs` が添付されていないので、判定できません。** golden から分かる注意点だけ書きます。
- golden の `BASE` は、receive-only の options を渡さずに `眠い` の note を期待しています。test の `{ options }` が manifest の既定値と合成されない場合、この module では
  - receive-only が `undefined` で note が付かず、
  - patterns が `undefined` だと `ls` まで deny されます。
- したがって、生成されるテストは全キーを渡すことが前提になります（[medium、要確認]）。

---

## 5. 決定性と報告ファイル

- 出力ファイルに時刻と乱数は入っていません。`exportedAt` は実行時の値です。PATHS の並び順は正しいです。
- 引用はすべて fenced block に入っています。fence は、本文中の最長のバッククォート列より1つ長くしています。HTML は `inert` で無害化しています。fence の外の文字列は、`plain` が `[ ] ( ) ! : < >` をエスケープしています。
- **[low] `proposals.mjs:85-87`。相対パスがそのまま残ります**: 絶対パスは basename に縮めますが、相対の `outDirName`（例: `../../home/hanako/out`、`C:foo`）は残ります。これも basename にする。
- **[low] fence 内の `inert`**: code block の中では `&lt;` がそのまま表示されるので、引用の見た目が変わります。注記はありますが、fence の中では変換しないで済ませる方が忠実です。
- **[low] fence の外の `plain` は GFM の `www.` と email の自動リンクを止められません**: 対象はカタログ由来の文字列だけなので、影響は小さいです。`evidence.line` が数値かどうかも確認していません。
- **[low] `emit.mjs:73-77` writePluginFolder。その場で上書きします**: 契約の「一時的な兄弟フォルダに書いてから移す」になっておらず、途中で失敗すると半端な状態が残ります。symlink も辿ります。re-run の経路がここを使うかどうかは、添付からは判定できません。

---

## 6. Node 側のテスト

**`test/emit.test.mjs` が添付されていないので、すべて判定できません。** fs や child_process のスタブ化、`claude` が無い時の失敗、`KOKORO_MODS_SKIP_CLAUDE` の扱い、名前と中身の不一致は、どれも確認できていません。

---

## 判定できなかったもの

- `src/templates/tests.mjs`（第4節の全体）、`test/emit.test.mjs`（第6節の全体）、`src/constants.mjs`（STORE_KEYS に `metrics`、`publishAllowedUntil`、`lastTurnPrefix` があるか）
- pluginName の slug が何から作られるか（氏名や見出しから作るなら、プライバシーの問題になります）
- golden の `register.ts` と、実際の API の型。`$.session.cwd`、`$.fs.write`、`$.clock.after`、`e.origin`、`command.run` が gating 扱いで `.catch` を要求されるかどうか
- `leakCheck` を CLI のどこで呼んでいるか。re-run を一時フォルダ経由で入れ替えているか
- test の `{ options }` が manifest の既定値と合成されるかどうか
- 実際の `claude plugin validate --strict` と `plugin test` の結果（実行していません）

**VERDICT: FAIL（high 1件: param の文字列が無検査で `plugin.json` に入り、leakCheck も配線されていない）**
