# 顔の画

ここに置いた画は、組み立ての SVG より**優先して使われる**。無い役は SVG のまま
描かれるので、一枚ずつ足していける。

## 名の付け方

```
<役>_<年の帯>_<番号>.webp     例) emperor_old_3.webp
```

| 役 | 誰 |
|---|---|
| `emperor` | 帝・歴代の帝・会戦で自ら率いる帝 |
| `empress` | 皇后・婚姻の申し出に出る娘 |
| `prince` | 藩王 |
| `official` | 録尚書事・刺史（同じ画で足りる） |
| `marshal` | 都督 |
| `chieftain` | 胡族の首長 |
| `north` | 北朝の主 |

年の帯は `young`（32歳未満）／`mid`（32〜51）／`old`（52以上）。
`chieftain_female_*` は女性の首長のための予備で、**いまの仕組みでは使われない。**

## 足したら

```
npm run portraits   # src/data/portraits.json を作り直す
```

## 揃っているもの

`emperor` `empress` `prince` `official` `marshal` `chieftain` `north` は画がある。
**足りないのは幼帝（`emperor_boy`）と、皇后の壮年・老年の増補だけ。**
発注の文面は `docs/portrait-prompts.md`。
