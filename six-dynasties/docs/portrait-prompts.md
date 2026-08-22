# 顔グラフィックの発注書（画像生成AI向け）

いま画面に出ている顔は SVG で組み立てたもので、`public/portraits/` に
下記の名前で画像を置くと**そちらが優先して使われる**（無い分は SVG のまま）。
一枚ずつ足していける。

## 0. 画質の基準

**濃密な半写実のデジタル絵画。** 肌の質感、髪の一本一本、絹の織り、金線細工の粒、
革と鉄の擦れまで描き込む。宮殿の内部を大きくぼかした暖色の背景に、
蝋燭のような温かい光を前から当てる。**平坦な塗りにも、線画にも、アニメ絵にもしない。**

- 一枚に**一人だけ。** 並べた見本（シート）ではなく、一人ずつ別のファイルにする
- 背景は**入れたまま**でよい（切り抜き不要）。宮殿の奥行きごと画の一部として使う
- 文字・落款・透かしを**一切入れない**

## 1. 納品の形式

| 項目 | 指定 |
|---|---|
| 形式 | PNG または JPEG。原寸のままでよい（表示用の縮小はこちらでやる） |
| 寸法 | 縦長 3:4、1024×1365 以上。**全カット同じ比率・同じ切り取り** |
| 構図 | 胸から上。正面向き。頭頂の冠が上端のすぐ内側に収まる |
| 枚数 | 1ファイル1人。複数人を並べた画像は使えない |
| 置き場 | `six-dynasties/public/portraits/<ファイル名>` |

**渡し方は二つ。** リポジトリへコミットするか、**チャットに貼る**か。
貼られた画はこちらで取り込んで所定の名前で置ける（最初の二枚のシートもそうした）。
ただし**一枚に一人**のほうが確実で、並べたシートは切り出しの当て込みが要る。

## 2. 揃った画風にするための手順

画像生成は一枚ごとに絵柄が振れる。**次の順で作ると揃う。**

1. まず **`emperor_mid_1.png` を一枚作る**（下の共通スタイル＋帝の指定）。
   気に入るまでこれだけを引き直す。これが**基準画**になる
2. 二枚目以降は、**基準画を添付した上で**次を添える

```
Use the attached image as the reference for style, rendering quality, lighting,
colour grading, background treatment and camera framing. Keep all of them
identical. Change ONLY the person and the costume described below.
This must be a clearly different individual: different face shape, different
eyes, different nose, different brow, different build and age.
```

3. 同じ会話の中で続けて生成する（会話を変えると絵柄が飛ぶ）

## 3. 共通スタイル（毎回そのまま貼る）

```
You are generating one portrait in a matching set of character portraits for a
historical strategy game set in China, 291-589 AD (Western Jin, the Sixteen
Kingdoms, the Northern and Southern dynasties).

STYLE — identical in every image of the set:
- Ultra-detailed semi-realistic digital painting: the look of a key visual for a
  Chinese historical drama, or a high-end strategy-game character portrait.
  Real skin texture, individual hair strands, woven silk, gold filigree, worn
  leather and oxidised iron. NOT flat illustration, NOT anime, NOT line art,
  NOT a cartoon, NOT a 3D game screenshot.
- Rendering: extremely high detail, sharp focus on the eyes, subsurface
  scattering in the skin, physically based materials — silk sheen, brushed gold,
  polished pearl, soft fur, scratched steel.
- Lighting: warm cinematic candlelight from the front left, a soft golden rim
  light along the hair and shoulders, gentle shadow on the far cheek.
  Rich golds, deep reds, dark browns. No flash, no cold blue light, no neon.
- Background: the interior of an ancient Chinese palace hall — carved wooden
  pillars, gilded screens, hanging lanterns, distant candle flames — thrown far
  out of focus with a shallow depth of field and creamy bokeh. The background is
  always present, always blurred, and never competes with the face.
- Framing, identical in every image: head-and-shoulders bust, the subject facing
  the viewer, head centred, the top of the headdress just inside the top edge,
  the crop ending at mid-chest. Eye line about 40% down from the top.
- Expression: composed and dignified, mouth closed, eyes to the camera.
  No smile, no shouting, no action pose, no raised hands, no weapon held up.
- ONE person only. No collage, no grid, no side-by-side variants, no panels.
- No text, no letters, no numbers, no signature, no seal, no watermark, no frame.
- Output: PNG, portrait 3:4, at least 1024x1365.

SUBJECT:
<ここに「一枚ごとの指定」を貼る>
```

**除外指定（negative prompt が使える場合）**

```
flat vector art, anime, manga, cel shading, line art, cartoon, chibi, 3d render,
plastic skin, doll face, collage, grid of portraits, multiple people, split panels,
text, watermark, signature, logo, border, frame, modern clothing, plain background,
white background, studio backdrop, harsh flash, oversaturated colours, smiling,
open mouth, extra fingers, extra arms
```

## 3.5 いま作るぶん（残り6枚）

藩王・都督・文官・胡族の首長は入った。**残っているのは6枚。**

| ファイル名 | 何 |
|---|---|
| `emperor_boy_1` `emperor_boy_2` | 幼帝2枚。**小さな大人にしないこと**（§4 の帝の欄を見よ） |
| `empress_mid_3` `empress_mid_4` `empress_old_3` `empress_old_4` | 皇后の壮年・老年4枚（若年は8枚あるが壮老が各2枚） |

### 一便目でいちばん外れたところ（覚え書き）

**最初の48枚は、武人も胡族の首長も全員が冕冠（旒の垂れた冠）をかぶっていた。**
旒は天子の印なので、藩王・都督・文官・首長にかぶせると身分が読めなくなる。
下の各指定には「旒を垂らすな」を書いてある。**この一行を落とさないこと。**
二便目はこれを入れたところ、藩王は遠遊冠、都督は兜、文官は進賢冠、
首長は貂の帽で揃った。

```
IMPORTANT: NO beaded curtain, NO hanging strings of beads in front of the face.
That crown (the mianguan) belongs to the emperor alone and must not appear here.
```

## 4. 冠と衣（時代を外さないための指定）

見本にした画の冠は明代のもの。**画質・照明・質感はあの基準のまま、冠と衣だけを
この時代のものに置き換える。** 冠は身分そのものなので、ここは崩さない。

### 帝（emperor）— 8枚

```
A Chinese emperor of the Six Dynasties period. He wears the mianguan crown: a
flat black lacquered board tilted forward above his head, its gold fittings
catching the candlelight, and twelve strands of white jade and red coral beads
hanging in a curtain in front of his face, swaying slightly. Beneath it a black
silk cap and a red cord tied under the chin. His robe is deep indigo silk woven
with gold-thread roundels, closed right over left, with a broad cinnabar-red
collar band and a jade-and-gold belt plaque just visible at the bottom edge.
<年齢の一行>
```

| ファイル名 | 年齢の一行 |
|---|---|
| `emperor_boy_1.png` `emperor_boy_2.png` | **The face of a real child of about twelve**: large eyes, round cheeks, no jaw definition, no facial hair, narrow shoulders — NOT a miniature adult. The heavy crown is slightly too large for him and his eyes are uneasy. |
| `emperor_young_1.png` `emperor_young_2.png` | A young man of about twenty-two, clean-shaven or with a thin moustache, smooth skin, watchful. |
| `emperor_mid_1.png` `emperor_mid_2.png` | A man of about forty. Full black beard, heavy brow, lines at the corners of the eyes. |
| `emperor_old_1.png` `emperor_old_2.png` | An old man of about sixty-five. Long white beard falling to his chest, deeply lined face, hooded eyes, age spots. |

### 皇后（empress）— 6枚

**見本の画にいちばん近いのはここ。** 金の花冠と真珠、朱の房をそのまま使う。

```
A Chinese empress of the Six Dynasties period. Her hair is drawn up into a high
coiled bun and covered by an elaborate gold filigree crown built from hundreds of
tiny gold flowers, pearls and kingfisher-blue enamel, dense and glittering, with
strings of small pearls hanging at both temples and long crimson silk tassels
falling beside her ears. Her robe is crimson and violet brocade embroidered with
gold thread, over a cream inner collar, closed right over left. Fine ink-drawn
eyebrows, pale powdered complexion, a small vermilion mark between the brows.
<年齢の一行>
```

| ファイル名 | 年齢の一行 |
|---|---|
| `empress_young_1.png` `empress_young_2.png` | A woman of about eighteen. Smooth skin, calm and guarded. |
| `empress_mid_1.png` `empress_mid_2.png` | A woman of about thirty-five. Composed, faint lines, a harder gaze. |
| `empress_old_1.png` `empress_old_2.png` | A woman of about sixty. Grey hair beneath the crown, lined face, upright and severe. |

### 藩王（prince）— 6枚

```
A Chinese imperial prince of the Six Dynasties period. He wears the yuanyou
guan: a black lacquered cap with a rounded ridge over the crown and a chased
gold band across the front — and NO hanging beads, because the beaded curtain
belongs to the emperor alone. His robe is deep purple or dark red silk with a
woven pattern and a cream inner collar, a gold-mounted sword hilt just visible
at the bottom edge. Proud, watchful, faintly impatient.
IMPORTANT: NO beaded curtain, NO hanging strings of beads in front of the face,
NO flat board above the head. He is a prince, not the emperor.
<年齢の一行>
```

| ファイル名 | 年齢の一行 |
|---|---|
| `prince_young_1.png` `prince_young_2.png` | A young man of about twenty, clean-shaven. |
| `prince_mid_1.png` `prince_mid_2.png` | A man of about thirty-eight, short trimmed beard. |
| `prince_old_1.png` `prince_old_2.png` | A man of about fifty-five, greying beard, heavy eyelids. |

### 文官（official・録尚書事と刺史）— 4枚

```
A Chinese civil official of the Six Dynasties period. He wears the jinxian guan:
a black cloth cap, low at the front and rising at the back, with a single narrow
ridge running over the crown, tied with a dark cord. His robe is dark green or
deep indigo silk with a cream inner collar and a jade pendant at the sash.
Scholarly and self-possessed, narrow eyes, a slight stoop of the shoulders.
IMPORTANT: NO crown, NO beads, NO armour, NO fur. A cloth cap and a silk robe only.
<年齢の一行>
```

| ファイル名 | 年齢の一行 |
|---|---|
| `official_young_1.png` | A man of about twenty-eight, clean-shaven, sharp and newly appointed. |
| `official_mid_1.png` `official_mid_2.png` `official_mid_3.png` | A man of about forty-five, thin beard. |
| `official_old_1.png` `official_old_2.png` | A man of about sixty-five, long thin white beard, wispy eyebrows. |

### 都督（marshal・武将）— 6枚

```
A Chinese general of the Six Dynasties period in armour. An iron helmet with a
short cinnabar-red plume on the crown and hinged cheek guards hanging at both
sides; beneath it, lamellar armour of hundreds of small iron plates laced with
red cord, a heavy leather shoulder strap with bronze studs, and a red silk sash
knotted at the collar. The metal is scratched and dulled by use, not polished.
Weathered skin, a direct and unhurried gaze.
IMPORTANT: an iron HELMET, not a crown. NO beaded curtain, NO gold filigree crown,
NO flat board above the head. He is a general, not a ruler.
<年齢の一行>
```

| ファイル名 | 年齢の一行 |
|---|---|
| `marshal_young_1.png` `marshal_young_2.png` | A man of about twenty-eight, clean-shaven, a fresh scar on one cheekbone. |
| `marshal_mid_1.png` `marshal_mid_2.png` | A man of about forty, thick black beard, broken nose. |
| `marshal_old_1.png` `marshal_old_2.png` | A man of about sixty, grey beard, one eye permanently narrowed. |

### 胡族の首長（chieftain）— 6枚

```
A chieftain of an inner-frontier steppe people of northern China in the fourth
century (Xiongnu, Jie, Di, Qiang, Xianbei). He wears a tall fur hat trimmed with
sable, a fur tail hanging down behind his shoulder, and his hair falls in tight
braids in front of both ears. His riding coat is fastened on the LEFT side
(zuoren, the barbarian fashion), with a thick fur collar, coarse wool and worn
leather, bronze plaques on the chest strap and a plain heavy gold torque at the
throat. Sun-darkened skin, broad cheekbones, wind-cracked lips.
IMPORTANT: a FUR HAT only. NO Chinese crown, NO beaded curtain, NO flat board
above the head. He is a tribal chieftain, not an enthroned emperor.
<年齢の一行> Vary the fur colour as well (dark sable brown / grey brown / reddish fox).
```

| ファイル名 | 年齢の一行 |
|---|---|
| `chieftain_young_1.png` `chieftain_young_2.png` | A man of about twenty-six, thin moustache, restless eyes. |
| `chieftain_mid_1.png` `chieftain_mid_2.png` | A man of about forty, full beard, a scar through one eyebrow. |
| `chieftain_old_1.png` `chieftain_old_2.png` | A man of about sixty, white beard and white braids, still hard. |

### 北朝の主（north）— 4枚

```
The ruler of a northern Chinese dynasty founded by a Xianbei house (Northern
Wei). The two costumes are deliberately mixed: he wears the Chinese mianguan
crown — the flat black board tilted forward, strands of jade beads hanging
before his face — but over a fur-collared riding coat, and his hair is braided
at the temples in the steppe manner. Gold and sable together, candlelight on
both. A cold, appraising expression.
<年齢の一行>
```

| ファイル名 | 年齢の一行 |
|---|---|
| `north_mid_1.png` `north_mid_2.png` | A man of about thirty-five, strong black beard. |
| `north_old_1.png` `north_old_2.png` | A man of about fifty-five, greying beard, deep-set eyes. |

## 5. 第三便（仕組みごと未実装のもの・10枚）

| ファイル名 | SUBJECT に足す一行 |
|---|---|
| `heir_boy_1.png` `heir_boy_2.png` | A boy of about fourteen, the crown prince: a plain dark silk robe and a small black cap with no beads, no crown, a jade pendant at the collar. |
| `heir_girl_1.png` `heir_girl_2.png` | A girl of about fifteen of the imperial house: hair in two coiled loops with a single gold pin, plain pale silk robe, no crown. |
| `dowager_old_1.png` `dowager_old_2.png` | An empress dowager of about seventy: grey hair under a heavy gold flower crown, dark purple brocade, a Buddhist rosary at the wrist, a severe unblinking gaze. |
| `chieftain_female_1.png` `chieftain_female_2.png` | A woman chieftain of a steppe people, about thirty: fur hat and braids, a fur-collared coat fastened on the left, a heavy gold torque, a hunting falcon's jesses visible at her shoulder. |
| `rebel_mid_1.png` `rebel_mid_2.png` | A rebel general of about forty-five: no crown, hair bound up in a plain cloth wrap, battered leather armour over a coarse robe, a hard stare. |

## 6. 第四便（史実の人物・個別の顔）

`data/leaders.json` に名前のある78人。**無くても遊べる**ので最後でよい。
ファイル名は `leader_<よみ>.png`。

| 人物 | SUBJECT に足す一行 | ファイル名 |
|---|---|---|
| 石勒 | Shi Le, the Jie slave who rose to be emperor of Later Zhao. About fifty, heavy-set, deep-set eyes, braided temples, a fur collar under a Chinese crown — a man who never learned to read. | `leader_shile.png` |
| 苻堅 | Fu Jian of Former Qin, about forty-five. Refined and generous-looking, Chinese court robes rather than furs, a light beard — a barbarian ruler who governed as a Confucian sovereign. | `leader_fujian.png` |
| 拓跋燾 | Emperor Taiwu of Northern Wei, about thirty-five. Hard and narrow-eyed, braided temples, sable collar beneath a beaded crown, a hunter's weathered skin. | `leader_tuobatao.png` |
| 慕容垂 | Murong Chui of Later Yan, about sixty. Tall, white-bearded, upright, still every inch a cavalry commander. | `leader_murongchui.png` |
| 桓温 | Huan Wen, general of Jin, about fifty. Long face, sparse beard, iron helmet, the eyes of a man measuring the throne. | `leader_huanwen.png` |
| 謝玄 | Xie Xuan, victor of the Fei River, about forty. Aristocratic and slender, light lamellar armour over a silk robe. | `leader_xiexuan.png` |
| 劉裕 | Liu Yu, founder of the Song, about fifty-five. A low-born soldier's face: broad jaw, scarred cheek, plain unornamented armour, no jade. | `leader_liuyu.png` |
| 檀道済 | Tan Daoji, about fifty. A grizzled veteran in full armour, grey at the temples. | `leader_tandaoji.png` |
| 韋叡 | Wei Rui, about sixty-five. A frail scholar-general in a plain robe instead of armour, a bamboo staff, thin white beard. | `leader_weirui.png` |
| 陳慶之 | Chen Qingzhi, about forty-five. Pale, slight, dressed in white — the general who could not draw a strong bow and never lost a battle. | `leader_chenqingzhi.png` |
| 陳霸先 | Chen Baxian, founder of the Chen, about fifty. A southern soldier, dark-skinned, heavy brow, plain armour. | `leader_chenbaxian.png` |
| 劉淵 | Liu Yuan of Han-Zhao, about forty-five. A Xiongnu chieftain educated in the Chinese classics: Chinese robes, braided hair, a scholar's calm over a rider's frame. | `leader_liuyuan.png` |

残りの人物も同じ書き方で足せる。**顔の無い人物は種から作った SVG のままでよい。**

## 7. いま揃っているもの／足りないもの

六枚の一覧から129枚を切り出して入れてある。

| 役 | 画の数 | 状態 |
|---|---|---|
| `emperor`（帝） | 若5・壮3・老4 | 入っている |
| `empress`（皇后） | 若8・壮2・老2 | 入っているが**壮年と老年が各2枚**と薄い |
| `prince`（藩王） | 若7・壮14・老3 | **入っている** |
| `official`（文官） | 壮15・老5 | **入っている**（若年は0だが壮年に落ちる） |
| `marshal`（都督） | 若4・壮11・老4 | **入っている** |
| `chieftain`（胡族の首長） | 若3・壮14・老6 | **入っている**（14の民に行き渡る） |
| `north`（北朝の主） | 壮5・老2 | 入っている |
| `emperor_boy`（幼帝） | 0 | **足りない。** 若年の帝の画で代用している |
| `heir` `dowager` `rebel` | 0 | 仕組みごと未実装 |

`chieftain_female_*`（12枚）は女性の首長のための予備で、いまの仕組みでは使われない。

**残っているのは幼帝2枚と、皇后の壮年・老年の増補4枚だけ。**
そのあとは §6 の史実の人物（78人）に進める。

## 8. 足したあとの手順

```
npm run portraits   # public/portraits/ を数えて src/data/portraits.json を作り直す
npm run build
```

表示側は `data/portraits.json` を見て、**有る顔は画、無い顔は SVG** に振り分ける。
画には金の枠を回してあるので、絹地の画面から浮かない。
