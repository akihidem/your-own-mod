# Your Own Mod

[English](README.md)

Your Own Mod（コマンド名は `kokoro-mods`）は `kokoro.md`、`torisetsu.md`、`HUMAN.md` などのAI向け取扱説明書を読み、Claude Code の function-hook プラグインを提案します。各提案にはきっかけとなった説明書の行が付き、何を入れるかは本人が選びます。生成したプラグインは一部の動作を数え、何が動いたかを後から確かめたり、回数を比べたりできるようにします。

普段から Claude Code を使い、「結論から答えて」「誤字を指摘しないで」「push の前に聞いて」「まだ動いているか教えて」と繰り返し伝えている人向けです。心理士と一緒にまとめた `kokoro.md` も同じしくみで使えますが、心理士の手助けは必須ではありません。具体的な場面、してほしい応答、本人の許可が必要な操作を、自分で短い説明書にまとめることもできます。書き方を案内するキットは準備中で、公開したらここから案内します。

`kokoro.md` は **KOKORO specification（KOKORO仕様）** に沿った、本人のためのAI向け取扱説明書です。KOKORO との関係は[後述](#kokoro-との関係)します。診断名や検査得点ではなく、作業でどう対応してほしいかを書きます。内容チェックはそうしたラベルや、ほかの禁止内容を拒否します。

## 原則

1. すべての提案に、元の文面を変えない引用が1〜3行付きます。診断名ではなく、本人が書いた希望を照合します。
2. 読み取り・照合・生成はオフラインで行い、モデルやネットワークを呼びません。同じ入力とオプションなら、所有するファイルの内容はバイト単位で同じです。
3. 生成するのは提案のフォルダーです。本人が読んでインストールし、CLI が Claude Code の設定を変えることはありません。
4. 既定では、初めから有効になるレシピは最大3つです（`--max-enabled` と `--all` で変えられます）。ほかの一致したレシピも切り替え可能な状態で残り、通知は共通で60秒の間隔を空けます。
5. 数えるのは動作の回数です。プロンプト、回答、ツール出力、説明書の本文は記録しません。
6. 説明書の引用は `plugin/` の外にある非公開用レポートに置きます。配布用フォルダーに入るのは、カタログの文面、範囲を制限したパラメーター、本人が選んだプラグイン名（省略時は `profile`）、版の指紋としての説明書の SHA-256 です。

## インストールと実行

Node.js 22以上が必要です。CLI に追加の依存パッケージはありません。生成したプラグインには、Claude Code の早期アクセス版 function-hook API が必要です。

```sh
npx kokoro-mods --help
```

`npx kokoro-mods` は npm に公開された後に使えます。それまでの間、またはソースから使う場合は、このリポジトリを clone し、そのルートで `node bin/kokoro-mods.mjs --help` を実行します。その場合は同じ接頭部分で各コマンドを実行してください。パッケージのインストールにはダウンロードが伴うことがありますが、CLI の check・propose・diff・report・recipes はネットワークを使いません。ヘルプの終了コードは0です。

まず説明書をチェックし、提案を作ります。

```sh
kokoro-mods check   profile.md
kokoro-mods propose profile.md --out ./mods/me --name me
```

`./mods/me/PROPOSALS.md` を読んでから、`propose` が表示したインストールコマンドを **Claude Code の中で**実行します。プラグイン名が `kokoro-mods-me` の場合は次の2つです。

```text
/plugin marketplace add ./mods/me/plugin
/plugin install kokoro-mods-me
```

`PROPOSALS.md` の相対パスは出力フォルダーを基準にしています。CLI は現在の場所から使えるパスを表示します。フォルダー名でプラグイン名が決まるわけではありません。名前を選ぶには、初回と再生成の両方で `--name me` を付けます。指定しない場合のプラグイン名は `kokoro-mods-profile` で、CLI がその旨の案内を出します。名前は説明書からは作りません。タイトルや frontmatter の名前が配布物に入ることはありません。英数字を含まない `--name` や、診断名を含む `--name` は終了コード2で拒否します。`--out` を省くと、保存先は `./kokoro-mods-out/<slug>` です。各レシピのオン・オフは Claude Code の `/config` で切り替えます。

説明書を直したら、同じ提案コマンドをもう一度実行します。差分を表示した後で所有ファイルを交換し、承認待ちやインストールは行いません。自分で追加した別のファイルは残ります。プラグイン名が変わった場合は終了コード5になり、`--force` を付けたときだけ交換できます。一時ファイルは出力フォルダーと同じ親の下に作り、所有ファイルの一覧は `PROPOSALS.json` の `files` に記録します。手で編集した、あるいは別のツールが書いた `PROPOSALS.json` がカタログと合わない場合は、中身を読む前に拒否します。

```sh
kokoro-mods propose profile.md --out ./mods/me --name me
kokoro-mods diff old/PROPOSALS.json new/PROPOSALS.json
kokoro-mods report export.json export-before.json --settings ~/.claude/settings.json
kokoro-mods recipes
```

1つの集計だけを見る場合は `export-before.json` を省き、設定を読まず回数だけ見る場合は `--settings` を省きます。差は「1つ目の集計 − 2つ目の集計」で、リセット後は負になることもあります。2つの集計は同じプラグインのものでなければならず、説明書のハッシュが違う場合は警告を出します。設定ファイルは読むだけです。レポートは集計に記されたプラグインについて、設定で明示的にオンにした項目を示します。設定に項目がないだけでは、既定値は分かりません。

## Claude Code の中のコマンド

インストール後、Claude Code の中で次のコマンドを使えます。

```text
/kokoro-mods status
/kokoro-mods export /absolute/path/export.json
/kokoro-mods export --print
/kokoro-mods allow-publish 30
/kokoro-mods focus 50
/kokoro-mods reset
```

`allow-publish` は1〜720分の許可を設定し、分数を省いた場合は30分です。`focus N` は休憩通知の間隔をN分に設定し、計り直します。`reset` は回数を消し、集計開始時刻を更新します。ファイルへの書き出し、許可、focus の変更、reset は、本人が入力欄に打った場合だけ受け付けます。`status` と `export --print` はほかの呼び出し元にも応答します。

`check --json` は検査結果をJSONで出します。`propose --json` は提案一式を標準出力にJSONで出し、警告・差分・要約・インストール手順は標準エラー出力に出します。この JSON には説明書の引用行が含まれるため、非公開の出力として扱ってください。`--max-enabled N` は最初に有効にする数を変え、0も指定できます。`--all` は一致したすべてを有効にします。この2つは同時には使えません。`propose --lang ja|en` は表示言語を変え、`recipes --lang ja|en` は各レシピの名前、テンプレート、高い確信度になる節、型付きパラメーターを表示します。`--debug` は入力本文を含めないエラースタックを追加します。

`fixtures/valid/en-generic.md` の提案要約から一部を抜き出すと、次のようになります。

```text
on   publish-guard  medium  quotes=1
on   lead-with-answer  medium  quotes=1
on   one-next-step  medium  quotes=1
off  focus-timer  medium  quotes=1
```

引用元は順に4・12・13・21行目です。非公開用レポートでは、実際の言葉をコード用の囲みの中に表示します。公開許可は既定で30分、回答の上限は12行、初めは無効な休憩通知は50分です。`medium` はこの汎用形式の説明書で節が一致したことを表し、役に立つという証明ではありません。完全なレポートには、ほかの一致したレシピも載ります。

## レシピ

| レシピ | 何をするか | 何を数えるか |
|---|---|---|
| `lead-with-answer` | 結論から答え、説明を短くするよう求めます。 | `long_answers`：行数の上限を超えた回答 |
| `accept-typos-as-intent` | 表記の違いを指摘せず、意図を読み取ります。 | — |
| `response-language` | 選んだ言語での応答を求めます。 | — |
| `one-next-step` | 大きな仕事を分け、次の行動を1つ示します。 | — |
| `receive-only-fragments` | 設定した短い発言を、助言せず受け取ります。 | `detected` |
| `respect-stop-signals` | 終了の合図を受け取り、次の仕事を追加しません。 | `detected` |
| `no-psych-framing` | 本人を解釈せず、書かれた希望に従います。 | — |
| `publish-guard` | 許可の有効時間外は、一致するBashの公開コマンドを止めます。 | `denied`、`allowed` |
| `quiet-confirmations` | 必要な許可を残し、日常の確認を繰り返しません。 | — |
| `offer-options` | 複数案を比べてから1つを勧めます。 | — |
| `plain-language` | 平易な言葉を使い、必要な用語を説明します。 | — |
| `expert-role-with-evidence` | 専門的な主張に根拠と確かめ方を求めます。 | — |
| `trace-offers` | 決定や進み具合の記録先を提案します。 | — |
| `running-indicator` | 経過時間とツールの動きを示し、長い応答処理を通知します。 | `long_turns`、`suppressed` |
| `block-ahead-warning` | 認証や承認が必要な手順を、到達前に説明します。 | — |
| `session-resume-brief` | 前回からの日数と、そのときのターン数を示します。 | `resumed` |
| `focus-timer` | 前回の通知判定後に活動があった場合だけ、休憩を知らせます。 | `ticks`、`suppressed` |

`detected` は対象の発言を検出した回数、`suppressed` は共通の通知間隔を守るため見送った回数です。`—` のレシピには回数の記録がありません。

## プライバシーと限界

CLI が読むのは、指定された説明書、提案JSON、集計JSON、任意で指定する設定ファイルだけです。`--out` の下に `plugin/.claude-plugin/{plugin,marketplace}.json`、`plugin/hooks/{hooks.json,register.ts,register.test.ts}`、`PROPOSALS.md`、`PROPOSALS.json` を書き、その親に作業用の一時フォルダーを作ります。入力や設定ファイルは編集せず、ホームの設定を自動で書き換えません。2つの提案レポートには引用と説明書のファイル名が入るため、非公開で保管してください。共有するのは確認済みの `plugin/` だけです。このフォルダーと各集計には、プラグイン名と説明書の SHA-256 が入ります。このハッシュは、同じファイルを持っている人がどの版から作られたかを確かめられる指紋で、中身は分かりません。内容チェックのメッセージに入るのは規則名と一致した語（`forbidden term "…"`）だけで、行そのものは出しません。

プラグインのローカル保存領域に残る活動記録は、開始時刻付きの動作回数と、作業ディレクトリごと（鍵はそのディレクトリのパス）の再開用の時刻・ターン数の2種類です。公開ガードは、許可を管理するため有効期限も保存します。プロンプト、回答、ツール出力、説明書本文は保存しません。本人が export を実行すると、指定した絶対パスへ書き出すか、`--print` でJSONを表示します。中身はプラグイン名、説明書のハッシュ、書き出し時刻、回数、真偽値・数値の設定だけです。フレーズ、パターン、言語などの文字列パラメーターは含めません。

kokoro-mods は説明書もこれらの記録もネットワークサービスへ送りません。カタログに書かれたルールは Claude Code のモデル向け文脈に入ることがありますが、元の引用はプラグインに入りません。Claude Code 自体のデータ設定を変えるものではありません。

公開ガードが保護するのは **Bashだけ**です。ほかのツールや、内部で公開処理を行うスクリプトは対象外です。パターンの設定が空か、正規表現として読めない場合、ガードは `/config` で設定が直るまですべてのBashコマンドを止めます。ガードを切るにはレシピのトグルを使います。回数で分かるのは動作であり、本人の負担が減ったか、変化の原因がこの変更だったかは分かりません。プラグインAPIは早期アクセス版です。見本プラグイン（英語サンプルから生成器が出力したもの）と生成したプラグインは Claude Code 2.1.290 と 2.1.291 で確認されており、それ以降の版でも動くかは検証が必要です。

## KOKORO との関係

**KOKORO specification（KOKORO仕様）** は `kokoro.md` を定める仕様です。心理師が臨床的な見立てを、所見そのものは流通させずに、AI 向けの作業上の希望へ翻訳した、本人のための取扱説明書です。仕様のリポジトリは執筆時点で非公開です。プロジェクトの公開部分は [kokoro-mcp](https://github.com/akihidem/kokoro-mcp) で、`kokoro.md` の署名・検証・失効・モデルへの配信を行うローダー兼 MCP サーバです。どちらも本ツールと同じ作者によるものです。

Your Own Mod は別のツールで、仕様の一部ではありません。

- 読むのは `kokoro.md`（frontmatter の `format: kokoro/...`、仕様の呼び方では `format_version`）、本人が自分で書く `torisetsu.md`（`format: torisetsu/...`）、見出しのゆるい自由形式のプロファイルで、作業上の希望を見つけるためだけに読みます。診断名、心理師のレビュー、同意の項目は読まず、要求もしません。署名の検査もしません。
- 内容チェックは仕様の禁止内容の規則に沿っています。診断名、検査得点、自傷、安全規則の無効化の指示、ロールプレイの指示、壊れた構造を拒否します（[設計書](docs/design/DESIGN.md) の付録A）。このチェックを通っても、その文書が仕様に適合した `kokoro.md` になるわけではありません。適合・レビュー・署名は仕様と kokoro-mcp の側にあります。
- 説明書をモデルの文脈へ配信することはしません。それは kokoro-mcp の役割で、両者は並べて使えます。kokoro-mcp が説明書をモデルに渡し、Your Own Mod はその中のいくつかの希望を、ハーネスが強制して回数を数えるフックに変えます。
- このリポジトリには仕様の本文も本物の説明書も含まれていません。サンプルは架空の人物のもので、利用者が生成した提案は利用者の機械の中に留まります。

## 開発

Nodeの標準テストと、実際のプラグイン検証を使います。

```sh
node --test test/*.test.mjs
claude plugin validate --strict docs/design/golden/plugin
```

`npm test` も明示的なglobを使います。引数なしの `node --test` は見本プラグインのTypeScriptテストまで拾うことがあるため避けてください。統合テストは3つの正常なサンプルそれぞれからプラグインを生成し、空の一時 `HOME` で `claude plugin validate --strict` と `claude plugin test` を実行して、走った生成テストの本数と名前を確かめます。さらに生成したモジュールを Node の型除去で実行し、モジュール自身が書き出す集計を検証します。Claude がなければ `claude not on PATH; set KOKORO_MODS_SKIP_CLAUDE=1 to skip` と表示して失敗します。この環境変数を `1` にしたときだけ、対象テストを名前付きでスキップし、その環境ではA2は未検証となります。CIはNode 22・24で動き、Claude Code 2.1.290 をインストールし、そのインストールが失敗した場合だけスキップ変数を設定します。`main` とタグでは、インストールの失敗はジョブの失敗になります。

[設計](docs/design/DESIGN.md)、[公開インターフェース](docs/design/contracts/w4-interfaces.md)、[サンプルの固定データ](docs/design/contracts/w4-facts.md) に契約と合格条件があります。終了コードは、0が成功とヘルプ、1が失敗（読めない・不正な入力ファイル、拒否した所有記録、予期しない失敗）、2が使い方の誤り、3が内容チェック不合格、4が差分あり、5が出力先の競合です。エラーはコードとキーを示し、入力本文の抜粋は出しません。

MITライセンスです。[LICENSE](LICENSE).
