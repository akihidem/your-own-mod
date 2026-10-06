# kokoro-mods 第8回再検品・チャンク2(catalog)

添付のみで判定しました。テストは実行していません。

## 処置表の各行

| 行 | 実装の有無 |
|---|---|
| H-1 | **実装済み**。"Never push unless confirmed"、"until I've confirmed"、"until I've signed off" は第2正規表現の bare `confirm\w*`、主語＋`'ve`、`sign(?:ed)?[- ]?off` でそれぞれ当たる。 |
| H-2 | **一部のみ**。`省く`/`控える`/`やめる`＋`のは/ことは`＋`やめ/しないで/禁止` は打ち消せる。ただし unless の動詞表に `減らす`(辞書形)と `省略する` が無い(下の H1)。 |
| M-a | **実装済み**。ただし `が` を外した副作用がある(下の M1)。 |
| M-b | **実装済み**(`the user` に `\w+ly` を挟む形、`hear(?:s|d)? from me`)。 |
| L-a | **実装済み**(`(?<=[くぐすつぬぶむる])な`)。 |
| L-b | **実装済み**。without 形にも同じ CI 除外が入っている。 |
| L-c | **実装済み。ただし締めすぎ**。設計文は "ok being bound to a person" だが、人に結び付いた OK まで落ちる(下の H2)。 |

## 残る指摘

**H1(high)**
- 場所：`src/catalog/index.mjs`、quiet-confirmations の ja unless
- 問題：普通の文「確認の質問を減らすのはやめてください」「念のため確認を省略するのはやめて」は、確認を続けてほしいという依頼なのにレシピが出る。トリガーは末尾の `やめ(て)` で当たり、直後に否定が無い。一方 unless の動詞群は `減らし|減らさ|省[きかいく]|…` だけなので、`減らす`・`省略する` に続く `のはやめ` に届かない。「…減らすことはしないで」も同じ経路。
- 修正：unless の動詞群に `減らす|省略(?:する|し)|なくす` を加え、`${JA_VERB_NEGATED}` に繋ぐ。上の3文を負例テストに加える。

**H2(high、L-c による回帰)**
- 場所：publish-guard の en、第2正規表現(unless/until/before 形)
- 問題：bare の `ok(?:ay)?` を消した結果、"Don't push until you get my OK." と "Never push unless I'm OK with it." でゲートが失われる。理由は二つ。`my ok` は without 形にしか無く、主語の後ろに付けられるのは `'ve/have/has` だけで `'m`/` am` が無い。添付からは、行内の ask 語だけで当たる別の正規表現に OK が含まれないことまでは言えるが、確定はできない。
- 修正：`my (?:ok|okay)` と `(?:I|we)(?:['’]m| am| are)? (?:ok|okay|fine) with` を加える。上の2文を正例テストに加える。

**M1(medium、M-a の副作用)**
- 場所：quiet-confirmations の ja unless、譲歩節の部分
- 問題：`が` を外したため、「念のため確認は不要と言われるが、省かないでください」がレシピを出す。トリガーは `不要` で当たる。ただし設計文が列挙する語は `ても|けど|けれど|のに` だけなので、medium とした。
- 修正：`が、` だけを戻す(読点の付いた形に限る)。後ろの話題の制限は今のまま残す。

**L1(low、回帰)**
- 場所：publish-guard の en、第2正規表現
- 問題：`confirm\w* (?:with|by) (?:me|the user)` が削られた。そのため "until the build is confirmed by me" は CI 除外に掛かり、ゲートが失われる。まれな文。
- 修正：CI 除外の否定先読みを `(?! (?:with|by) (?:me|the user))` で解除する。

**L2(low)**
- 場所：test/match.test.mjs
- 問題：`was/were confirmed`(CI 主語)の正例と負例が無い。今はゲートが付く側に倒れるだけ。
- 修正：テストを1組加える。

**外部への流出経路**：差分は正規表現とテストだけ。plugin/**、metrics、stdout/stderr に触れる変更は無く、新しい流出経路は見当たらない。

## 添付からは判定できないこと

- quiet-confirmations のトリガー本体。「4文字以内」の先読みが `省` と `く` の間をどう扱うか。
- 行内の ask 語で当たる別の正規表現の語彙(H2 が他の経路で救われるかどうか)。
- publishPolarity の中身。
- テストの合否。

**VERDICT: FAIL(high 2件)**
