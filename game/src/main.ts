// ゲームの起動。
import "./ui/style.css";
import { Game } from "./core/Game";
import { credits, scenario } from "./data";

const root = document.getElementById("app") as HTMLElement;
(root.querySelector(".scenario") as HTMLElement).textContent = `西暦${scenario.year}年 ${scenario.name}`;

const hint = root.querySelector("#hint") as HTMLElement;
hint.textContent = "地形を読み込んでいます…";

Game.create(root)
  .then(() => {
    hint.textContent = "ドラッグで移動・ピンチで拡大縮小・都市をタップ";
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
