あなたは製品リサーチャ兼システム設計者です。以下の OSS 構想について、「広い needs 調査 → target 候補の定義」までを行ってください。実装の話はまだ不要です。

# 構想
- 入力: ユーザ本人の「AI 向け取扱説明書」。心理師が心理検査の所見を「症状→機能影響→行動指示」に翻訳した kokoro.md（KOKORO 規格: 診断名・検査素点・所見原文は含まない。節 = 1 AIに伝える境界線 / 2 私について / 3 強み・関心 / 4 応答スタイルの希望 / 5 配慮(DO/DON'T) / 6 苦手なこと・反応しやすいこと / 7 現在のフォーカス / 8 意思決定の癖 / 9 改訂履歴）。または本人が自己記入で作る非臨床版 torisetsu.md（同じ節構成）。
- 出力: Claude Code（Anthropic の agentic coding CLI）の「mod」= function hooks plugin の作り替え提案。mod ができること: prompt.submit(入力の書き換え/文脈付加)、prompt.compose(system prompt の節の追加・差し替え)、tool.call(ツール呼び出しの拒否・書き換え・結果の後処理)、ui.render(入力欄の上の帯・ペイン・状態行)、toast、timer($.clock.every)、slash command 登録、セッション横断の store、turn.complete(応答完了の検知)、session.compact(要約の指示)、$.model.complete(モデル呼び出し)。
- 目的: 本人の認知負荷を下げ、生産性を維持する方向に harness を自動で合わせる。提案は本人が採用/却下する（勝手に適用しない）。
- 公開: OSS で GitHub に世界公開。英語圏も対象。
- 既存の自作資産（参照のみ）: claude-env-coach v3（transcript から人の介入回数と黙って効いていない hook を数え、同時 3 件まで処方、採用を設定変化で自動検知、7 日で効果測定、LLM 呼び出し無し。v2 は 814 提案 0 採用で失敗）、cogsync（凍結: AI の枠より「セッション切替のたびに人が読み直す量」が負荷だった。測るが誰も読まない計器になった）。

# 問い（番号ごとに答える。各主張に確度タグ [高/中/低] を付け、出典は名前で示す。知らないことは「不明」と書き、捏造しない）
1. needs の全体像: このツールを欲しがる人を 6〜10 セグメントに分け、各セグメントについて「困りごとの具体」「規模の手がかり（調査名と数字。例: 開発者調査の神経多様性の比率、ADHD の成人有病率、AI コーディング支援と認知負荷の研究）」「kokoro.md/torisetsu.md を持つ見込み」を表にする。
2. agentic coding tool（Claude Code / Cursor / Codex CLI 等）を使う時の具体的な痛点を 15 個以上列挙し、「どのセグメントに効くか」「mod のどの機構で軽くできるか」「効果を機械で測れるか（YES/NO とその指標）」を表にする。
3. 既存の競合・隣接: (a) ツール側の組み込み機能（Claude Code の CLAUDE.md / output styles / hooks / statusline、Cursor rules、ChatGPT custom instructions・memory 等）、(b) ADHD/集中向け生産性ツール、(c) 「AI に渡す自己プロファイル」系の OSS や研究（user manual / README for me / LLM personalization research）。それぞれ「何ができて、何が欠けているか」。
4. リスク: ステレオタイプ化・過剰適応（personalization が強すぎると応答が本人の想像の範囲に閉じる）、要配慮情報の流出、医療隣接の責任、提案スパム（採用 0 件）、測るだけで読まれない計器、Claude Code の plugin API が early access で変わる、の各リスクに対する設計上の対策を 1〜2 行ずつ。
5. target 候補を 4 つ（狭い→広い）定義し、各候補の「最初の 1 か月で検証できる仮説」「必要な機械判定の床（YES/NO で測れる受け入れ条件）」「公開時の訴求文（英語 1 行）」を書く。最後に、最初の公開リリースの target を 1 つ推薦し、理由を 3 行で。
6. 名前の候補を 5 つ（kokoro-mods を含む比較。検索性・既存商標の衝突可能性 [低/中/高] を添える）。

出力は日本語の Markdown、見出しは問いの番号、合計 3000 語以内。表は Markdown table。
