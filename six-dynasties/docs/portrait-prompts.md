# 顔グラフィックの発注書（Gemini 向け）

いま画面に出ている顔は SVG で組み立てたもので、`public/portraits/` に
下記の名前で PNG を置くと**そちらが優先して使われる**（無い分は SVG のまま）。

## 1. 納品の形式

| 項目 | 指定 |
|---|---|
| 形式 | PNG（透過でなくてよい） |
| 寸法 | 正方形 1:1、1024×1024 以上 |
| 構図 | 胸から上の正面向き。**全カット同じ寸法・同じ切り取り** |
| 背景 | 完全な単色 `#E7DCC6`（模様・枠・影を入れない） |
| 文字 | 一切入れない（落款・署名・透かしも不可） |
| 置き場 | `six-dynasties/public/portraits/<ファイル名>` |

**渡し方はリポジトリへのコミット。** チャットに貼った画像はこちらで
ファイルとして保存できないので、アプリに組み込めない。GitHub の web 画面から
`six-dynasties/public/portraits/` に upload するのがいちばん早い。

## 2. 共通スタイル（毎回そのまま貼る）

```
You are generating one image in a matching set of character portraits for a
historical strategy game set in China, 291-589 AD (Western Jin, the Sixteen
Kingdoms, the Northern and Southern dynasties).

STYLE — identical for every image in the set:
- Traditional Chinese silk-scroll court portrait. Fine ink contour lines, flat
  mineral pigment, restrained shading. NOT photorealistic, NOT anime, NOT 3D.
- Head-and-shoulders bust, front view, calm and dignified, mouth closed,
  eyes toward the viewer. No action pose, no weapon raised, no hands visible.
- Composition, identical in every image: head centered; the top of the headwear
  sits about 6% below the top edge; the shoulders are cut off by the bottom edge.
- Background: one completely flat color #E7DCC6. No pattern, no gradient,
  no border, no frame, no cast shadow, no vignette.
- Palette: ink #241F1A, silk #E7DCC6, gold #D0A63F, cinnabar #9B2D20,
  indigo #1B2637, jade #4A6F5D, muted earth brown. No neon, no pastel.
- No text, no letters, no seal, no signature, no watermark.
- Output: PNG, square 1:1, 1024x1024.

SUBJECT:
<ここに下の「一枚ごとの指定」を貼る>
```

## 3. 一枚ごとの指定（第一便・40枚）

同じ役で複数枚要るのは、**人物ごとに顔を変えるため。** 「前の一枚とは別人。
顔の形・目鼻立ち・体格を変える」と添えて引き直す。

### 帝（emperor）— 8枚

冕冠。黒い板（延）を前へ傾け、**十二旒の玉が顔の前に垂れる。**
衣は玄衣纁裳（藍黒の袍に朱の襟）。

```
A Chinese emperor of the Six Dynasties period wearing the mianguan crown:
a flat black rectangular board tilted forward above the head, with twelve
strands of red-and-white jade beads hanging in front of his face, a gold band
around the black cap beneath. Deep indigo imperial robe with a cinnabar-red
collar. <年齢の一行> A different individual from the previous image: change the
face shape, the eyes, the brow and the build.
```

| ファイル名 | 年齢の一行 |
|---|---|
| `emperor_boy_1.png` `emperor_boy_2.png` | A boy of about twelve, round soft face, no facial hair, uneasy on the throne. |
| `emperor_young_1.png` `emperor_young_2.png` | A young man of about twenty-two, clean-shaven or with a thin moustache. |
| `emperor_mid_1.png` `emperor_mid_2.png` | A man of about forty, full black beard, heavy brow. |
| `emperor_old_1.png` `emperor_old_2.png` | An old man of about sixty-five, long white beard, deeply lined face. |

### 皇后（empress）— 6枚

花釵冠。**金の歩揺（花形の簪）を挿し、両脇に真珠を垂らす。**
高く結った髷、褘衣（深紅または深藍の袍）。

```
A Chinese empress of the Six Dynasties period. High coiled hair with a golden
huachai crown: gold flower-shaped hairpins standing above the head and strands
of pearls hanging beside both temples. Crimson-and-indigo court robe with a
cream collar. Fine ink eyebrows, pale complexion, composed expression.
<年齢の一行> A different individual from the previous image.
```

| ファイル名 | 年齢の一行 |
|---|---|
| `empress_young_1.png` `empress_young_2.png` | A woman of about eighteen. |
| `empress_mid_1.png` `empress_mid_2.png` | A woman of about thirty-five. |
| `empress_old_1.png` `empress_old_2.png` | A woman of about sixty, grey hair, still upright. |

### 藩王（prince）— 6枚

遠遊冠。**旒は無い**（旒は天子だけ）。黒い冠に金の帯、紫または朱の袍。

```
A Chinese imperial prince of the Six Dynasties period wearing the yuanyou guan:
a black cap with a rounded ridge and a gold band, NO hanging beads (the beaded
crown belongs to the emperor alone). Purple or dark red robe with a cream collar.
Proud, watchful expression. <年齢の一行> A different individual from the previous image.
```

| ファイル名 | 年齢の一行 |
|---|---|
| `prince_young_1.png` `prince_young_2.png` | A young man of about twenty. |
| `prince_mid_1.png` `prince_mid_2.png` | A man of about thirty-eight, short beard. |
| `prince_old_1.png` `prince_old_2.png` | A man of about fifty-five, greying beard. |

### 文官（official・録尚書事と刺史）— 4枚

進賢冠。**前が低く後ろが高い黒い冠**に梁が一本。絳紗袍（深緑または藍）。

```
A Chinese civil official of the Six Dynasties period wearing the jinxian guan:
a black cloth cap, low at the front and rising at the back, with a single ridge
over the crown. Dark green or indigo court robe, cream inner collar. Scholarly,
narrow-eyed, self-possessed. <年齢の一行> A different individual from the previous image.
```

| ファイル名 | 年齢の一行 |
|---|---|
| `official_mid_1.png` `official_mid_2.png` | A man of about forty-five, thin beard. |
| `official_old_1.png` `official_old_2.png` | A man of about sixty-five, long white beard. |

### 都督（marshal・武将）— 6枚

鉄の兜に**朱の纓**を立て、頬当てを垂らす。裲襠鎧（札を綴じた甲）。

```
A Chinese general of the Six Dynasties period in armour: an iron helmet with a
short cinnabar-red plume on the crown and cheek guards hanging at both sides,
over lamellar armour of small iron plates with a red sash at the collar.
Weathered, direct gaze. <年齢の一行> A different individual from the previous image.
```

| ファイル名 | 年齢の一行 |
|---|---|
| `marshal_young_1.png` `marshal_young_2.png` | A man of about twenty-eight, clean-shaven. |
| `marshal_mid_1.png` `marshal_mid_2.png` | A man of about forty, thick black beard, scarred cheek. |
| `marshal_old_1.png` `marshal_old_2.png` | A man of about sixty, grey beard, one eye narrowed. |

### 胡族の首長（chieftain）— 6枚

**貂の帽**（毛皮の縁と、後ろへ垂れる尾）、弁髪、**左衽**の胡服、毛皮の襟、金の頸環。

```
A steppe or inner-frontier tribal chieftain of northern China, 4th-5th century
(Xiongnu, Jie, Di, Qiang, Xianbei). A fur hat trimmed with sable and a fur tail
hanging behind, braided hair falling in front of both ears, a fur-collared
riding coat fastened on the LEFT side (zuoren), a plain gold torque at the neck.
Sunburnt skin, broad cheekbones. <年齢の一行> A different individual from the previous
image: change the fur colour (dark brown / grey brown / reddish brown) as well.
```

| ファイル名 | 年齢の一行 |
|---|---|
| `chieftain_young_1.png` `chieftain_young_2.png` | A man of about twenty-six, thin moustache. |
| `chieftain_mid_1.png` `chieftain_mid_2.png` | A man of about forty, full beard. |
| `chieftain_old_1.png` `chieftain_old_2.png` | A man of about sixty, white beard and braids. |

### 北朝の主（north）— 4枚

**冕冠と毛皮を同時に着ける** — 胡族が漢の天子の冠をかぶった姿。孝文帝の漢化以後は
毛皮を減らしてよい。

```
A ruler of a northern Chinese dynasty founded by a Xianbei house (Northern Wei).
He wears the Chinese mianguan crown — flat black board tilted forward with
strands of beads hanging before his face — but over a fur-collared robe, and his
hair is braided at the temples. The two costumes are deliberately mixed.
<年齢の一行> A different individual from the previous image.
```

| ファイル名 | 年齢の一行 |
|---|---|
| `north_mid_1.png` `north_mid_2.png` | A man of about thirty-five, strong black beard. |
| `north_old_1.png` `north_old_2.png` | A man of about fifty-five, greying beard. |

## 4. 第二便（いま顔の無いもの・10枚）

| ファイル名 | 指定に足す一行 |
|---|---|
| `heir_boy_1.png` `heir_boy_2.png` | A boy of about fourteen in a plain dark robe and a small black cap, the crown prince, not yet enthroned. |
| `heir_girl_1.png` `heir_girl_2.png` | A girl of about fifteen of the imperial house, hair in two coiled loops, plain silk robe, no crown. |
| `dowager_old_1.png` `dowager_old_2.png` | An empress dowager of about seventy, grey hair under a gold flower crown, dark purple robe, severe expression. |
| `chieftain_female_1.png` `chieftain_female_2.png` | A woman chieftain of a steppe people, about thirty, fur hat and braids, fur-collared coat fastened on the left, gold torque. |
| `rebel_mid_1.png` `rebel_mid_2.png` | A rebel general of about forty-five, no crown, hair bound in a plain cloth wrap, worn leather armour, hard stare. |

## 5. 第三便（史実の人物・個別の顔）

`data/leaders.json` に名前のある78人。**ここは有っても無くても遊べる**ので最後でよい。
ファイル名は `leader_<よみ>.png`（例 `leader_shile.png`）。

```
<共通スタイル>
SUBJECT: <人物の説明>. Head-and-shoulders portrait in the same set style.
```

| 人物 | 説明に足す一行 | ファイル名 |
|---|---|---|
| 石勒 | Shi Le, the Jie slave who became emperor of Later Zhao. About fifty, heavy build, deep-set eyes, fur-collared robe under a Chinese crown. | `leader_shile.png` |
| 苻堅 | Fu Jian of Former Qin, about forty-five. Refined and generous-looking, Chinese robes, light beard — a barbarian ruler who governed as a Confucian sovereign. | `leader_fujian.png` |
| 拓跋燾 | Emperor Taiwu of Northern Wei, about thirty-five. Hard, narrow-eyed, braided temples, fur collar under a beaded crown. | `leader_tuobatao.png` |
| 慕容垂 | Murong Chui of Later Yan, about sixty. Tall, white-bearded, still a soldier. | `leader_murongchui.png` |
| 桓温 | Huan Wen, Jin general, about fifty. Long face, sparse beard, iron helmet, ambitious eyes. | `leader_huanwen.png` |
| 謝玄 | Xie Xuan, victor of the Fei River, about forty. Aristocratic, slender, light armour. | `leader_xiexuan.png` |
| 劉裕 | Liu Yu, founder of the Song, about fifty-five. Low-born soldier's face, broad jaw, scarred, plain armour. | `leader_liuyu.png` |
| 檀道済 | Tan Daoji, about fifty. Grizzled veteran, full armour. | `leader_tandaoji.png` |
| 韋叡 | Wei Rui, about sixty-five. Frail scholar-general in a robe rather than armour, carried in a litter. | `leader_weirui.png` |
| 陳慶之 | Chen Qingzhi, about forty-five. Pale, slight, dressed in white — the general who could not draw a strong bow. | `leader_chenqingzhi.png` |
| 陳霸先 | Chen Baxian, founder of the Chen, about fifty. Southern soldier, dark-skinned, heavy brow. | `leader_chenbaxian.png` |
| 劉淵 | Liu Yuan of Han-Zhao, about forty-five. Xiongnu chieftain educated in the Chinese classics; Chinese robe, braided hair. | `leader_liuyuan.png` |

残りの人物も同じ書き方で足せる。**史実の顔が無い人物は種から作った顔のままでよい。**

## 6. 揃ったあと

`public/portraits/manifest.json` に置いたファイル名を並べ、
表示側はそれを読んで「有る顔は画像、無い顔は SVG」に振り分ける。
manifest が無ければ全部 SVG のまま動く。
