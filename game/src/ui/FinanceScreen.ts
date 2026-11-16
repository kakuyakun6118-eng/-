// 国家財政の画面:蓄え・毎月の収入と支出・収支・軍団の維持費・官職と俸禄・都市別の収入・財政の警告
import { factionById, persons, scenario } from "../data";
import type { Campaign } from "../sim/Campaign";

export class FinanceScreen {
  constructor(private readonly root: HTMLElement, private readonly campaign: () => Campaign, private readonly player: () => string | null) {
    (root.querySelector(".finance-close") as HTMLElement).addEventListener("click", () => (this.root.hidden = true));
    (root.querySelector(".finance-faction") as HTMLSelectElement).addEventListener("change", () => this.render());
  }

  open(): void {
    const sel = this.root.querySelector(".finance-faction") as HTMLSelectElement;
    const keep = sel.value || this.player() || scenario.factions[0].id;
    sel.replaceChildren(...scenario.factions.filter((f) => !f.passive && !f.fallen).map((f) => new Option(f.name, f.id)));
    sel.value = keep;
    if (!sel.value && sel.options.length) sel.value = sel.options[0].value;
    this.root.hidden = false;
    this.render();
  }

  private render(): void {
    const c = this.campaign();
    const id = (this.root.querySelector(".finance-faction") as HTMLSelectElement).value;
    const r = c.economy.report(id);
    const st = c.factionStates[id] ?? { gold: 0, grain: 0 };
    const arrears = c.economy.arrearsOf(id);
    const n = (x: number): string => Math.round(x).toLocaleString("ja-JP");
    const sign = (x: number): string => (x >= 0 ? "+" : "") + n(x);
    const warn: string[] = [];
    if (arrears > 0) warn.push(`俸禄の未払いが${arrears}か月続いています(忠誠が下がり${arrears >= 2 ? "、兵の士気も下がって" : ""}${arrears >= 3 ? "、兵が逃げ始めて" : ""}います)`);
    else if (r.net < 0) warn.push(`毎月${n(-r.net)}の赤字です。蓄えはあと約${Math.max(0, Math.floor(st.gold / -r.net))}か月で尽きます`);
    if (r.netGrain < 0) warn.push(`兵糧が毎月${n(-r.netGrain)}足りません`);
    const offices = persons.filter((p) => p.factionId === id && c.economy.offices[p.id]).map((p) => ({ p, o: c.economy.officeOf(p.id)! })).sort((a, b) => a.o.rank - b.o.rank);
    const crisis = c.loyalty.crisisOf(id);
    const html = `
      <div class="finance-top">
        <div><span>金</span><b>${n(st.gold)}</b></div><div><span>兵糧</span><b>${n(st.grain)}</b></div>
        <div><span>毎月の収支(金)</span><b class="${r.net < 0 ? "bad" : ""}">${sign(r.net)}</b></div><div><span>毎月の収支(兵糧)</span><b class="${r.netGrain < 0 ? "bad" : ""}">${sign(r.netGrain)}</b></div>
        <div><span>官制</span><b class="small">${c.economy.systemOf(id).label}</b></div><div><span>政情</span><b class="small ${crisis.factor > 1 ? "bad" : ""}">${crisis.why.join("・") || "平穏"}</b></div>
      </div>
      ${warn.length ? `<p class="finance-warn">${warn.join("<br>")}</p>` : ""}
      <div class="finance-cols">
        <table><caption>毎月の収入</caption>
          <tr><td>商業</td><td>${n(r.income.commerce)}</td></tr><tr><td>人口の税</td><td>${n(r.income.tax)}</td></tr><tr><td>交易(街道の市)</td><td>${n(r.income.trade)}</td></tr><tr><td>シルクロード交易</td><td>${n(r.income.silk)}</td></tr>
          <tr class="sum"><td>計(金)</td><td>${n(r.income.total)}</td></tr><tr><td>農業(兵糧)</td><td>${n(r.income.grain)}</td></tr></table>
        <table><caption>毎月の支出</caption>
          <tr><td>軍団の維持費</td><td>${n(r.expense.army)}</td></tr><tr><td>守備兵</td><td>${n(r.expense.garrison)}</td></tr><tr><td>俸禄</td><td>${n(r.expense.salary)}</td></tr>
          <tr><td>官僚機構</td><td>${n(r.expense.bureaucracy)}</td></tr><tr><td>城郭・都市</td><td>${n(r.expense.cities)}</td></tr><tr><td>宮廷</td><td>${n(r.expense.court)}</td></tr><tr><td>遠征の補給</td><td>${n(r.expense.expedition)}</td></tr>
          <tr class="sum"><td>計(金)</td><td>${n(r.expense.total)}</td></tr><tr><td>兵糧</td><td>${n(r.expense.grain)}</td></tr></table>
        <table><caption>官職と俸禄</caption>${offices.map(({ p, o }) => `<tr><td>${o.name}</td><td>${p.name}</td><td>${o.salary}</td></tr>`).join("") || "<tr><td>官職についた人はいません</td></tr>"}</table>
        <table><caption>都市別の収入</caption>${r.cities.map((x) => `<tr><td>${x.name}</td><td>金${n(x.gold)}</td><td>糧${n(x.grain)}</td></tr>`).join("")}</table>
      </div>`;
    (this.root.querySelector(".finance-body") as HTMLElement).innerHTML = html;
    (this.root.querySelector(".finance-message") as HTMLElement).textContent = factionById(id)?.ruler ? `君主 ${factionById(id)!.ruler}` : "";
  }
}
