# kokoro-mods 第16回 再検品 — chunk 1 matcher（`src/match.mjs`）

## 処置表の各行の判定

| 行 | 判定 | 根拠 |
|---|---|---|
| High-1 けど・けれど・ですが・だが で節を切る | **実装済み** | `JA_BUT` が `CLAUSE_PARTS`・`CLAUSE_SPLIT_TIGHT`・`CLAUSE_SPLIT` の3つに入った。「レビューは後でいいけど公開は私がチェックしてから」で追うと、tight 節が「レビューは後でいい」になる。この節に公開の対象語が無く、`bareWaiver` 経由の借用も起きないので、免除にならず hit する。陽性テスト2本と陰性テスト1本も、追った結果と合う。 |
| Medium-1 "and" の先の命令から対象語を借りる | **実装済み** | "Don't ask me and just push." では、`bareWaiver` が真になり、`AND_PUSH_CLAUSE` が "just push" を拾い、`EXPLICIT_WAIVER` も一致する。結果は waiver=true、asking=false。"No confirmation needed and push freely." も同じ結果になる。"Feel free to run the linter…" は `bareWaiver` が偽なので、借用しない。 |
| Low-1 習慣は tight 節で読む | **設計文に反映済み** | 「the first-person habit is read in the tight clause」と書かれている。コードも `FIRST_PERSON.test(tight)` で一致する。 |
| Low-2 英語の明示免除は節末に固定しない | **設計文に反映済み** | 日本語の明示免除は先読みで節末に固定し、英語は `\b` だけ。設計文の書き分けとコードが一致する。 |

## 残る指摘（high 0件・medium 1件・low 3件）

### medium-1（条件付き）
- **場所**: `src/match.mjs`、`publishPolarity` / `CLAUSE_SPLIT_TIGHT`
- **問題（この fold で入った退行）**: 例文は「pushの確認は不要だけど、mainへのpushは私が見てから」。
  - fold 前は、tight 節が「…不要だけど」だった。「不要」の後ろの先読みが「だ」＋「け」で外れるので、否定された免除として扱われ、asking になっていた。
  - fold 後は、「けど」で節が切れて tight 節が「…不要だ」になる。`EXPLICIT_WAIVER` が成立して waiver が立つ。
  - このとき安全側のゲートを守るのは、残りの「mainへのpushは私が見てから」に catalog の trigger が一致するかどうかだけになる。
  - 一致しなければ、普通の文でゲートを失う（その場合は high 相当）。
  - 「確認は不要だが、…」「確認は不要ですが、…」も同じ形になる。
- **修正案**: 次のどちらか。
  - 文の中で waiver の節の後ろに `JA_BUT` で区切られた節が続き、そこに公開の対象語（`PUBLISH_OBJECT`）があり、免除でも禁止でもない場合は `asking` に倒す。
  - 上の文をそのまま陽性テストに加えて、catalog 側に「私が見てから」型の trigger があることを固定する。

### low-1
- **場所**: §5.4a
- **問題**: 対象語を借りる条件の書き方が、コードより広い。
  - 設計文は「the order that an "and" opens right after the waiver」としか書いていない。
  - コードには3つの条件がある。waiver が tight 節のほぼ全体であること（許す前置きは please/just/simply/then/ok/okay だけ）、"and" の直前に読点が無いこと、命令の動詞が push/publish であること。
- **修正案**: 設計文に `bareWaiver` の条件と、読点が入ると借用しないことを明記する。

### low-2
- **場所**: `src/match.mjs`、`AND_PUSH_CLAUSE`
- **問題**: `(?:push|publish)\w*` が "publishing notes" のような名詞句も拾う。
  - "No approval needed and publishing notes is up to you" は、公開ゲートの免除として読まれる。
  - 普通の文とは言いにくく、hit には trigger の一致も別に要る。
- **修正案**: 動詞の後ろの名詞句を除外する。例えば "notes"/"docs" のような目的語が続く場合や、"publishing" で始まり is/are が続く場合は外す。

### low-3
- **場所**: `test/match.test.mjs`
- **問題**:
  - 「けれど(も)・ですが・だが」の固定テストが無い。テストはどれも「けど」だけ。
  - 陰性リストに足された「pushは確認なしでいいけどテストは回して」には「and の先の命令が対象語を貸す」というコメントが付いているが、この行は and 借用を試していない。
  - しかもこの行は fold 前でも通るので、fold の変更を固定していない。
- **修正案**:
  - 「確認は後でいいけれど公開は私がチェックしてから」「…いいですが…」「…いいだが…」を陽性テストに加える。
  - コメントを、実際に試している内容に合わせて直す。

## 手引きの文が外に出る経路

新しい経路は見つからなかった。

- fold で増えた `objectScope`・`andPush` は、真偽の判定にだけ使われる。戻り値・例外メッセージ・bundle には入らない。
- 例外メッセージは今まで通り行番号と位置だけで、値を含まない。

## 添付からは判断できなかったこと

- **catalog の publish-guard の trigger の実際の内容**: medium-1 が実害（high）になるかは、これで決まる。
- **手引きの引用が届く先**: `evidence.quote` が plugin/**・metrics の書き出し・stdout にどう流れるか。emitter/CLI 側のコードが添付に無い。
- **テストの実行結果**: 実行ログが添付に無いので、緑かどうかは確認していない。

**VERDICT: PASS（high 0件）** — ただし medium-1 の重さは catalog の trigger 次第。
