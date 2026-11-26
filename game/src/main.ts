// ゲームの起動。
import { registerForTest, registered, portraitUrl } from "./palace2d/assets";
import { CAST } from "./palace2d/cast";
import { armyOpsRules } from "./sim/strategy";
import "./ui/style.css";
import { Game } from "./core/Game";
import { affinity } from "./sim/loyalty";
import { createBattleSetup } from "./sim/battle";
import { autoResolve, estimateWinRate } from "./sim/autoBattle";
import { setGameSeed } from "./sim/spoils";
import type { BattleEvent } from "./data/types";
import { credits, persons, scenario } from "./data";

const root = document.getElementById("app") as HTMLElement;
(root.querySelector(".scenario") as HTMLElement).textContent = `西暦${scenario.year}年 ${scenario.name}`;

const hint = root.querySelector("#hint") as HTMLElement;
hint.textContent = "地形を読み込んでいます…";

Game.create(root)
  .then((game) => {
    // 動作確認用:ブラウザの開発者ツールから __goko.focus(経度, 緯度, 距離) で移動できる
    (window as unknown as { __goko: Game }).__goko = game;
    // 点検用:データ(シナリオ・人物)
    (window as unknown as { __gokoData: unknown }).__gokoData = { scenario, persons };
    (window as unknown as { __gokoAffinity: unknown }).__gokoAffinity = affinity;
    (window as unknown as { __gokoSetup: unknown }).__gokoSetup = (ev: BattleEvent) => createBattleSetup(ev, (id) => game.campaign.stateOf(id)?.army, game["allCities"], (c) => game.campaign.cityState(c));
    (window as unknown as { __gokoAuto: unknown }).__gokoAuto = autoResolve;
    // 点検用(劉裕の北伐):勝率の見積もり(却月陣・特性の効き目を確かめる)
    (window as unknown as { __gokoEstimate: unknown }).__gokoEstimate = estimateWinRate;
    (window as unknown as { __gokoSeed: unknown }).__gokoSeed = setGameSeed;
    (window as unknown as { __gokoArmyOps: unknown }).__gokoArmyOps = armyOpsRules;
    (window as unknown as { __gokoPalace2D: unknown }).__gokoPalace2D = { registerForTest, registered, portraitUrl, CAST };
    hint.textContent = "ドラッグで移動・ピンチで拡大縮小・都市や軍団をタップ";
  })
  .catch((err) => {
    // 3D表示に対応していない端末などで失敗したとき、理由を画面に出す
    hint.textContent = "3Dマップを表示できませんでした。Safariを最新版にして、もう一度開いてください。";
    console.error(err);
  });

// 「出典」ボタン:使っているデータの出どころを表示する
const creditsPanel = root.querySelector("#credits") as HTMLElement;
const creditsList = creditsPanel.querySelector(".credits-list") as HTMLElement;
for (const c of credits) {
  const item = document.createElement("div");
  item.className = "credits-item";
  const title = document.createElement("h3");
  title.textContent = `${c.title}:${c.source}`;
  const text = document.createElement("p");
  text.textContent = c.text;
  item.append(title, text);
  creditsList.appendChild(item);
}
(root.querySelector("#credits-open") as HTMLElement).addEventListener("click", () => {
  creditsPanel.hidden = false;
});
(root.querySelector("#credits-close") as HTMLElement).addEventListener("click", () => {
  creditsPanel.hidden = true;
});
