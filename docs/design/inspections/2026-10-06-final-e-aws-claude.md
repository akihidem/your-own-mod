# kokoro-mods 最終検品 — Chunk E（README 英日・package.json・CI・`test/cli.test.mjs`・w4-facts）

添付には行番号がないため、位置は見出し・テスト名・引用文で示します。DESIGN.md 本文、`src/**`、`bin/`、生成される `register.ts` と `register.test.ts` は、この chunk に含まれていません。

## 指摘

### H1（high）— 説明書の名前が配布用の `plugin/` とエクスポートに入る。README の約束と食い違い、テストでも検出できない
- **場所**: README.md の原則6 "The distributable contains catalog text and bounded parameters" と "Share only the reviewed `plugin/` folder"。同じく "the slug comes from the manual's **name**, alias, or title"。`test/cli.test.mjs` の A5c ループ `if (['comment', 'heading'].includes(line.kind) || line.text.length < 12) continue`。
- **問題**: slug は説明書の name・alias・title から作られます。それが `pluginName = kokoro-mods-<slug>` になり、`plugin/.claude-plugin/{plugin,marketplace}.json` と、エクスポートの `plugin` 欄に入ります。たとえば `name: Hanako Yamada` という説明書なら、共有してよいと README が言う `plugin/` に本人の氏名が入ります。原則6の記述は偽で、§2 の「誰に何が渡るか」の説明にも漏れがあります。さらに A5c は見出しと12文字未満の行を除外しています。title 由来の slug は構造上一度も検査されず、日本語では11文字以下でも一文になります。
- **修正**: 次の3点です。
  - 既定の slug 元から `name` と `alias` を外し、title が使えなければ `profile` にする。
  - README の原則6とプライバシー節に「`--name` を省くと、title から作った slug がプラグイン名とエクスポートに入る」と明記し、氏名を含む説明書には `--name` を推奨する。
  - A5c に「slug の元になった語と frontmatter の name・alias が `plugin/**` に出ない」ことの検査を足す。あわせて、日本語行の除外を文字数でなく正規化後の長さ（例: 4文字以上）にする。

### M1（medium）— 説明書の sha256 は、README が非公開扱いにした情報なのに `plugin/` 側にも入る
- **場所**: README の "Keep the two proposal reports private: they include source quotes and the manual's basename and hash" と、エクスポート欄の "it includes … profile hash"。
- **問題**: プラグインは説明書を読みません。それでもエクスポートに `profileSha256` を出せる以上、ハッシュは `plugin/` に埋め込まれているはずです（推論。register.ts は添付外）。ハッシュは「この説明書か」を確かめられる指紋です。レポートでは非公開の理由に数えているのに、`plugin/` は「共有してよい」としていて、説明が矛盾しています。
- **修正**: README に「`plugin/` とエクスポートにも説明書の sha256 が入る」と書く。または、生成時に乱数の profile ID を作り、ハッシュとの対応は非公開レポートにだけ置く。

### M2（medium）— 端末出力に説明書の本文が出ないことを、どのテストも確かめていない
- **場所**: `proposed()` は常に `--json` で、stdout の JSON しか読みません。INVALID テストは `[f.level, f.rule, f.line]` だけを比べています。
- **問題**: 次の3つの出力は、説明書の本文を含まないことが一度も確認されていません。
  - `--json` なしの propose の stdout（要約・差分・インストール手順）
  - `--json` 付き propose の stderr
  - 不合格の説明書に対する `check --json` の出力。検査結果に `matched` や抜粋の欄があれば、診断名や自傷手段がそのまま画面とログに出ます。

  README の "Errors name codes and keys, without input excerpts" も、検査結果側では裏付けがありません。
- **修正**: valid の各サンプルで `--json` なしの propose を実行し、`stdout + stderr` に `profile.lines` の本文が含まれないことを確かめる。INVALID の各サンプルでは、該当行（`expected[4]`）の本文と、正規化後の禁止語が stdout と stderr に出ないことを確かめる。

### M3（medium）— 「オフライン」テストが、import を書かずに使える `fetch` を見ていない
- **場所**: テスト「A9: offline imports…」は禁止 import を `['http','https','net','dns','child_process']` に限っています。
- **問題**: Node 20 以上では、グローバルの `fetch`・`WebSocket`、`node:tls`・`node:http2`・`node:dgram`、`worker_threads` 経由の通信が import の照合をすり抜けます。テスト名は、実際に確かめている範囲より強い主張をしています。
- **修正**: 静的検査に `\bfetch\s*\(`、`WebSocket`、`tls|http2|dgram|undici|worker_threads` を加える。さらに、テスト中に `globalThis.fetch` を例外を投げる関数に差し替えてから全コマンドを `main()` で通す。

### M4（medium）— Claude Code の導入に失敗しても CI が緑のまま。版も固定していない
- **場所**: `.github/workflows/ci.yml` の `continue-on-error: true` と `npm install -g @anthropic-ai/claude-code`（最新版を入れる）。
- **問題**: 導入に失敗すると skip 変数が `1` になり、A2 は未検証のままジョブが成功します。README はこれを開示していますが、公開前の判定としては「確かめていない」を緑と表示する作りです。また README は「2.1.290 で確認」と書くのに、CI は別の版を入れます。
- **修正**: 版を `@anthropic-ai/claude-code@2.1.290` に固定し、`claude --version` を記録する。skip になった時は `::warning::A2 unverified` を出し、tag・release・main ではジョブを失敗させる。

### M5（medium）— `claude plugin test` は終了コード0しか見ていない
- **場所**: `claude()` ヘルパーの判定は `assert.equal(result.status, 0, …)` だけです。
- **問題**: 生成された `register.test.ts` のテストが0件でも、「テストなし」で0を返す版なら通ります。ガードの振る舞い（許可の読み取りを `next` より前に行う、読み取りに失敗したら拒否する、入力欄からの命令に限る、発言全体での一致、共通の通知間隔、subagent は無視）は、この chunk では一切確かめられていません。
- **修正**: 出力から合格件数を読み、1件以上であることと、主要なテスト名（publish guard の拒否・失敗時の拒否・入力欄以外からの許可を拒否する、など）があることを確認する。

### M6（medium）— 「golden export」は手書きで、プラグインが実際に出す形との照合がない
- **場所**: テスト A6 の `goldenExport()`。
- **問題**: テスト名は「fixture-based golden export」ですが、中身は bundle から手で組み立てた値です。プラグインの `/kokoro-mods export` が文字列パラメーターや別の形を出しても、CLI 側の検証と食い違うことはこのテストでは見つかりません。また `|| event === 'suppressed'` により、どのレシピにも `suppressed` を許しています（publish-guard を含む）。
- **修正**: 生成されたプラグインのテストで実際にエクスポートを書き出し、それを `readExport` に通す。`suppressed` は、通知を出すレシピの一覧に限って許す。

### M7（medium）— Node 20 はすでにサポート終了。Node 24 を試していない
- **場所**: package.json の `"node": ">=20"`、CI の `[20, 22]`、README の「Node.js 20 or newer」。
- **問題**: Node 20 は 2026-04-30 にサポートが終わっています。現行 LTS の 24 が CI の対象外です。
- **修正**: CI の対象に 24 を加える。最低版を 22 に上げるかどうかを決め、README と package.json を合わせる。

### L1（low）— 終了コード1の説明が実態と合わない
README は「1 unexpected failure」と書いていますが、テストでは `E_EXPORT_SHAPE`・`E_EXPORT_JSON`・`E_OUT_FILES`・`E_OUT_PATH`・`E_PATTERN`・ファイルが存在しない場合も1です。どれも想定済みの入力エラーです。「1 = 入力ファイルの不正・読み取り失敗・予期しない失敗」と書き直してください。

### L2（low）— 原則4の「At most three recipes start enabled」が、`--all` と `--max-enabled` と矛盾する
「By default, at most three…」に直してください。

### L3（low）— README の主張にテストがないものがある
- 再生成時に「差分を表示する」こと。
- 「現在の場所から使えるパスを表示する」こと。
- `recipes --lang` が high-confidence の節と型付きパラメーターも表示すること（テストは title と template だけ）。
- `--max-enabled 1 --all` の逆順。
- `--max-enabled abc` や値の欠落。
- `propose --lang xx`。

それぞれ1件ずつ確認を足してください。

### L4（low）— 決定性テストは「同じ時刻・同じプロセスでの2回」だけ
`TZ` やロケールを変え、別の出力先に作った結果とバイト単位で比べてください。

### L5（low）— 英語版と日本語版で `focus` の意味が違う
英語は "`focus` restarts the reminder interval"（時計を戻す）、日本語は「間隔を設定し直します」（値を変える）です。`focus 50` の実際の動作に合わせ、両方をそろえてください。

### L6（low）— 再開記録の「作業ディレクトリごと」の鍵が、パスそのものかもしれない
パスには利用者名や案件名が入り得ますが、README はそれを書いていません。保存形式（パスかハッシュか）を明記してください。

### L7（low）— w4-facts.md のパターン表記が壊れている
表の中の `|` が `/` に置き換わり、`(pr/issue)` になっています。テストは正しい `|` で固定し、コメントで断っています。正典にする文書の側を `\|` で直してください。

### L8（low）— package.json に `repository` がない
`files` には docs も fixtures も含まれません。npm のページでは README から `docs/design/*`・`README.ja.md`・`LICENSE` への相対リンクが切れます。`repository`・`homepage`・`bugs` を加えてください。

### L9（low）— 統合テストの `claude` が本物の HOME で動く
spawn する `claude` は実際の HOME を引き継ぐため、開発者自身の `~/.claude` を読み書きし得ます。`env: { ...process.env, HOME: h.home }` を渡してください（認証の要否は添付からは分かりません）。

### L10（low）— その他
- CI の actions がコミット SHA で固定されていない。
- `node --test test/` を「ディレクトリ指定の代替」とする README の主張が、Node 22 で動くか確かめていない。CI で一度実行して確認してください。

## 確かめられたこと（この chunk の範囲）
- 終了コード2・3・4・5の対応。
- 不合格の説明書では、出力先にも隣の一時フォルダーにも何も作られない。
- 出力先の外を指す所有ファイル一覧と symlink は、どちらも拒否される。
- 壊れた JSON と不正なパターンは、`--debug` を付けても値を表示しない。
- 設定ファイルは読むだけで、バイト単位で変わらない。
- 依存パッケージがない。
- README の要約例（引用元の4・12・13・21行目と既定値）は w4-facts と一致する。
- A2 のスキップ文言とスキップ条件は README の記述どおり。
- 非公開のリポジトリへのリンクはない（kokoro-mcp が公開されているかは未確認）。

## 判断できなかったこと
- DESIGN §2・§5・§6 と Appendix A の本文。slug を `plugin/` に入れることが設計上許されているか、否定表現の扱い、文字の正規化を含みます。
- 生成される `register.ts` と `register.test.ts` のガードの中身（項目3のすべて）。
- emitter の漏れ検査、自由入力パラメーターでの例外、`maxEnabled` の境界の実装。
- `bin/kokoro-mods.mjs` の shebang と実行ビット。
- npm 上で `kokoro-mods` という名前が空いているか、公開済みか。他人が使っている名前なら、README の `npx` 案内が別人のパッケージを取得させます。
- 現行の Claude Code に `plugin test` があるか、認証なしで動くか。
- 60秒の通知間隔、`/config` での切り替え、絶対パス以外のエクスポート先の扱い。

## 確認した integrator の修正
この chunk には、「integrator」と明示した印がありませんでした。修正にあたると思われるコメントは次の2つで、どちらも妥当と判断します。
1. `// Fixture expectations are frozen from w4-facts.md; DESIGN §6 governs regex alternation.` — facts の `/` を `|` に読み替えています（妥当。ただし L7 のとおり facts 側の修正が必要）。
2. `// w4-facts.md: only focus-timer cites line 21.` — A7 で21行目を空にする根拠です（妥当）。

**VERDICT: FAIL（high 1件: H1）**
