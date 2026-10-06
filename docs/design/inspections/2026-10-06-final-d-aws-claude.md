# kokoro-mods Chunk D（match / diff / cli / report / metrics）独立検品

**判定: FAIL（high 1件）。** 安全レシピ `publish-guard` が、自然な否定表現の多くを「確認不要」と取り違えます。その結果、確認を求めている本人に安全 mod が提案されません。

前提です。添付の範囲だけで判断し、ファイルを探しに行ったりコードを実行したりはしていません。抜粋に行番号が無いため、場所は「ファイル名・関数名」で示します。この chunk には tests と README が含まれないため、観点5・6はほぼ判断できません（末尾に記載）。

---

## High

### H1. publish-guard の否定判定が列挙式で、取りこぼすと安全レシピが黙って消える
- **場所**: `src/match.mjs` の `NEGATED_WAIVER_BEFORE` / `NEGATED_WAIVER_AFTER` / `publishPolarity`
- **問題**: 「否定されていない確認不要（waiver）」かどうかを、否定表現の許可リストで判定しています。リストに無い否定は waiver と見なされます。行に別の確認語が無ければ `asking=false` → `override=false` となり、unless で除外されます。§5.4a の「waiver が数えられるのは、それ自体が否定されていない時だけ」に反しています。机上で追うと、次の行はすべて hit しません。
  - 「確認なしのpushはNG」（after の `のpushはNG` がどの選択肢にも合わない）
  - 「確認せずにpushするのはやめて」
  - 「確認せずにpushしちゃダメ」
  - 「確認不要でpushするのはダメ」（`のはダメ` が `は(?:ダメ)` に届かない）
  - "Pushing without asking is not OK"（`not okay` が `not allowed` に合わない）
  - "Without asking, never push"（waiver が文頭にあり、否定が読点の後ろの節にある）
- **修正**: 判定の向きを逆にします。waiver を数えるのは、同じ節に**明示的な許可語**がある時だけにします（例: いい|OK|構わない|大丈夫|自由に|fine|ok|go ahead|feel free|you can|you may）。それ以外は「否定された waiver」とみなして hit にします。安全側に倒すのが fail-closed です。上の6例を固定テストに入れてください。

## Medium

### M1. export の未知キーが stderr にそのまま出る
- **場所**: `src/metrics.mjs` の `at()`、`src/cli.mjs` の `publicFailure`
- **問題**: `E_EXPORT_SHAPE` は safe code 扱いなので、message がそのまま出力されます。その message には、export JSON の**入力キー**が `JSON.stringify(key)` か生のまま入ります。例: `$.options["山田のADHDメモ"]: unknown key`。§9 の「入力値は出さない」と、A6 の「自由記述フィールドを拒否する」の両方の意図に反します。
- **修正**: 未知キーは `$.options: unknown key (#3)` のように順番だけで示します。キー名を出すのは、許可リストにあるキーだけにします。

### M2. `plugin` 欄が自由記述のまま通る
- **場所**: `src/metrics.mjs` の `assertMetricsExport`、`src/report.mjs` の `formatReport`
- **問題**: 確認しているのは `typeof === 'string'` だけです。§5.6 の「すべての文字列は許可集合のどれか」を満たしません。値は `formatReport` で標準出力に出ます。`JSON.stringify` は C1 制御文字や bidi 文字をエスケープしません。
- **修正**: `^kokoro-mods-[a-z0-9]+(?:-[a-z0-9]+)*$` かつ 52 文字以内に絞ります。A6 の拒否ケースにも追加します。

### M3. 却下された `--name` が黙ってタイトル由来の名前に置き換わる
- **場所**: `src/match.mjs` の `slugChoice`、`src/cli.mjs` の `propose`
- **問題**: `--name` が禁止語に当たった場合や、正規化で空になった場合（日本語だけの名前など）、frontmatter かタイトルの候補へ黙って進みます。hint が出るのは `fallback` の時だけです。本人はタイトルを避けるために `--name` を渡したのに、タイトル由来の slug（実名の可能性あり）が `plugin.json` の name に入ります。
- **修正**: `--name` を渡したのに却下された時は、`E_USAGE`（exit 2、`name: rejected after normalisation`）で止めます。

### M4. `parseProfile` に filename を渡していない
- **場所**: `src/cli.mjs` の `main`
- **問題**: §4 の署名は `parseProfile(text, {filename})` ですが、CLI は text しか渡していません。形式判定（kokoro / torisetsu / generic）がファイル名を使う場合、confidence・順位・`enabledByDefault` が変わります。
- **修正**: `parseProfile(text, { filename: basename(profilePath) })`。

### M5. `diff` が別ファイルの recipeId を検証せずに表示する
- **場所**: `src/cli.mjs` の `bundleFrom`、`src/diff.mjs` の `formatDiff`
- **問題**: 確認しているのは `proposals` が配列であることだけです。手で編集された PROPOSALS.json や別ツールの JSON にある任意の `recipeId` が、そのまま stdout に出ます。`evidence` が欠けていると TypeError になり、汎用の exit 1 で終わります。
- **修正**: `recipeId ∈ RECIPE_IDS`、`evidence` が quote 文字列の配列であること、`enabledByDefault` が boolean であることを検証します。違反は `E_PROPOSALS_SHAPE`（キー名のみ）で返します。

### M6. 別の mod の export 同士でも差分を出してしまう
- **場所**: `src/report.mjs` の `compareExports` / `formatReport`
- **問題**: `before.plugin !== after.plugin` や profileSha256 の違いを確認していません。別の mod や、手引き書を改訂した後の export との差が、同じ mod の増減として表示されます。
- **修正**: plugin が違う時は exit 1（`E_EXPORT_MISMATCH`）にします。sha の違いは警告行で示します。

## Low

- **L1** `src/match.mjs` の `paramsFor`: 出所の行が4つ以上あると素の `Error` を投げます。妥当な手引き書でも propose 全体が exit 1 になります。§5.4a はこの場合を定めていないため、設計で決めるか、confidenceHit と最初の出所を優先して切ってください。
- **L2** `quote: line.quote ?? line.raw`: raw への代替は行内コメントを引用に混ぜます。代替をやめて例外にしてください。また契約自体に矛盾があります。§5.4 は「quote = raw から行内コメントを除いたもの」、A3 は「ディスク上の行と一致」です。設計側で正してください。
- **L3** publish の衝突判定がセル単位です。設計は「the line」と書いています。表の左セルで確認を求め、右セルで確認不要と書いた時の扱いが仕様と違います。
- **L4** `derivedParamsFor`: min/max を持たない数値 param は、導出値ごと捨てられます（安全側ですが仕様は「clamp」）。逆転範囲の検査は、param 名が文字どおり `min`/`max` の時しか働きません。
- **L5** `src/metrics.mjs`: `'suppressed'` を直書きで許可しています（catalog の EVENT_NAMES の外で閉じた schema が広がる）。event をレシピ別に絞っていません。options の型をキー別に照合していません（真偽値のキーに数値が入っても通る）。count に上限がありません。
- **L6** `--help` が exit 2 で終わります。`--debug` で出るのは無害化後の stack だけなので、安全ですがデバッグには使えません。
- **L7** 途中で SIGINT されると、quote を含む `.kokoro-mods-tmp-*` が `<out>` の兄弟に残ります。`<out>` に `.gitignore`（PROPOSALS.*）を書いていません。`--json` は quote を含む bundle 全体を stdout に出します（opt-in なので README に明記を）。
- **L8** `readExport` のエラーが、export と before のどちらのファイルか区別しません。
- **L9** `FORBIDDEN_SLUG_TERM` は大文字小文字を区別しません。`dan`・`add`・`od` など、よくある名前や単語も弾きます。Appendix A が略語の大文字を要件にしているかは、ここでは確認できません。

---

## 観点別の短評

1. **プライバシー**: 漏れの経路は M1・M2・M5（stderr / stdout）と、M3（タイトルが plugin 名に入る）です。`E_LEAK`、`E_PARAM_FREE_TEXT`、JSON 構文エラー、パターンエラーは固定文に置き換えられていて良好です。derived params は「範囲付きの数値」と「options に含まれる文字列」だけを通すので、自由記述は入りません。
2. **fail-closed**: FAIL の時は書き込み前に exit 3 を返します。`maxEnabled` の検証、オプション解析、`files` のパス検査、symlink 拒否、ロールバックは妥当です。
4. **契約との照合**: 順位・evidence 規則・diff の形・exit 0/4 は §5.4a / §5.7 と一致しています。publish-guard の例として挙がっている4文は、机上で4文とも hit しました。
5. **テスト**: この chunk には含まれていません。H1 の6例が固定テストに無いなら、それ自体が欠落です。

## 添付からは判断できなかったこと
- `check.mjs` の `f.message` が入力の抜粋を含むか。`findingsText` がそのまま stdout / stderr に出すので、プライバシーはここ次第です。
- `profile.mjs`: filename を使うか、`quote` 欄、`language` が取りうる値。
- catalog: unless パターンと `PUBLISH_WAIVER` の対応、`deriveParams`、範囲付き param の名前。
- `emit.mjs` / `writePluginFolder`: leakCheck、自由記述の拒否、private ファイルの権限、`outDirName` の意味。
- 生成されるモジュール（観点3）、テスト全体、README、Appendix A の原文。
- Claude Code の `pluginConfigs` のキーが `name` か `name@marketplace` か。後者なら、`readSettingsToggles` は常に「none」を返します。
- `/plugin marketplace add "<JSON 引用符付きのパス>"` を Claude Code が受け付けるか。

## 確認した integrator 修正（印付き）
- `src/cli.mjs` の `propose` で、`emitPlugin` に catalog を id キーの map として渡す修正（round 1 で全 propose が "unknown recipe id" になっていた件）を確認しました。matcher と `buildBundle` は配列のままで、呼び分けに矛盾はありません。ただし、コメントの「DESIGN §5.5 が map を定める」は添付の抜粋からは確認できません。この退行を propose の結合テスト（A2 / A8）が捕まえるかは、テストが無いため未確認です。

**VERDICT: FAIL — high 1件（H1）**
