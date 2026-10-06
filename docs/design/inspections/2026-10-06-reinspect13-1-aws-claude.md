# kokoro-mods 第13回再検品 — チャンク1（マッチャー）

## 処置表の各行

| 行 | 実装されているか |
|---|---|
| H-1 | **実装されている**。`CLAUSE_PARTS` と `CLAUSE_SPLIT` の両方に `and` が加わった。"Wait for my go-ahead before pushing and feel free to open new issues without asking." をたどると次のとおり。<br>• 確認を省いてよいとする節は " feel free to open new issues without asking" になり、許可語があるので waiver=true。<br>• 確認を省く節を空白にした残りは "Wait for my go-ahead before pushing and" で、ただの時の節（bare time clause）ではない。<br>• この残りにトリガーが当たるので、ゲートは残る。<br>テストでも false として固定されている。ただし「許可を読む範囲」を `and` で区切った変更が、下の H-a の後退を起こしている。 |
| M-1 | **実装されている**。`PUBLISH_ASK` から `レビュー` が外れた。「確認せずにpushして。PRのレビューは後で私がする。」では、1文目は命令の形なので waiver になる。2文目には確認を省く語句がないので、トリガーに当たるかどうかで決まる。テストでは確認を省いた文として固定されている。ただし diff を見ると、`査読` も同時に外れている。処置表にもコメントにも書かれていない（L-b）。 |
| L-1 | **実装されている**。節は「pushは確認なしでしていい」で、許可語は「いい」。禁止語はない。残りの「CIが通ってから」は時の節ではないが、トリガーに当たらない前提で、テストでは確認を省いた文として固定されている。 |

## 残っている指摘

**H-a（high・後退）** `src/match.mjs` `publishPolarity`（許可を読む範囲 = `CLAUSE_SPLIT`）

- **問題**: `and` で節を切るようにしたため、文の頭にある許可語が、確認を省く語句のある節から切り離された。
  - 例: "You can open issues and PRs without asking." や "Feel free to push and open PRs without asking." では、節が " PRs without asking" や " open PRs without asking" になる。
  - この節には許可語も命令の形もない（`IMPERATIVE_WAIVER` は行頭が push/publish でないと当たらない）。
  - そのため negatedWaiver（確認を求める側）になり、publish-guard が当たる。
- 前回の版では、節全体に "You can" が含まれていたので、確認を省く文として扱われていた。
- どれも作業の好みを書く手引きにありふれた文で、確認を省くよう頼んだのにゲートが提案される。設計文にも「受け入れる言い回し」として挙がっていない。
- **修正案**:
  - `CLAUSE_SPLIT`（許可・疑問・伝聞を読む範囲）は `but|however` までに戻す。`and` は `CLAUSE_PARTS`（空白にする側）だけに残す。
  - H-1 は `asksBeyondWaivers` で残りの "…before pushing and" にトリガーが当たるので、conflict（確認を求める側と省く側の両方がある状態）として扱われ、ゲートは保たれる。
  - "You can open issues and PRs without asking." と "Feel free to push and open PRs without asking." を、確認を省く文としてテストに固定する。

**M-a（medium）** `src/match.mjs` `PUBLISH_ASK`／カタログのトリガー

- **問題**: `査読` も、確認を求める語から黙って外れた。たとえば「公開前に査読を通して。イシューは確認なしで立てていい。」でゲートが残るかどうかは、トリガーに `査読` があるかどうかだけで決まる。添付のトリガーのテストに 査読 はない。
- **修正案**: 査読 を含む正例をトリガーに加えて固定する。外すなら、理由を処置表とコメントに書く。

**L-b（low）** `BARE_TIME_CLAUSE`

- **問題**: `でから` が処置表にない形で追加されている。いまの影響は小さいが、何のための追加かを追えない。
- **修正案**: 由来をコメントに書き、それを固定するテストを加える。

## 新たな流出経路

なし。今回の差分は正規表現と定数の変更だけで、新しい出力はない。

- 例外メッセージに出るのは行番号と位置だけ。
- `evidence.quote` は前からある設計上の経路で、今回は変わっていない。

## 添付だけでは判断できなかったこと

- publish-guard のトリガー本体。`asksBeyondWaivers` の結果と、L-1・M-1・H-1 のテストが通るかどうかは、トリガーに当たるかで決まる。
- テストが実際に緑かどうか。
- テスト表の3列目が何を意味するか（文脈から「抑止される」と読んだ）。
- bundle と evidence が plugin/**、メトリクスの出力、stdout/stderr のどこへ流れるか（他のチャンクの担当）。

**VERDICT: FAIL（high 1件）**
