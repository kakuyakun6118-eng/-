// ゲームの起動。
import "./ui/style.css";
import { Game } from "./core/Game";
import { scenario } from "./data";

const root = document.getElementById("app") as HTMLElement;
(root.querySelector(".scenario") as HTMLElement).textContent = `西暦${scenario.year}年 ${scenario.name}`;

try {
  new Game(root);
} catch (err) {
  // 3D表示に対応していない端末などで失敗したとき、理由を画面に出す
  const hint = root.querySelector("#hint") as HTMLElement;
  hint.textContent = "3Dマップを表示できませんでした。Safariを最新版にして、もう一度開いてください。";
  console.error(err);
}
