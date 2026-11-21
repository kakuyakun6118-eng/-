// 歴史の事件の結果を、戦略マップに示すための「変化の一覧」(Version 41)。
// 事件の前と後の状態を写し取り、国・都市・君主・人物・軍団・兵糧と士気・外交・財政・治安の変わった所を並べる。
// あわせて、瞬間移動(軍団が一瞬で遠くへ動いた)や、存在しない人物(生まれる前・死んだ人)の登場がないかを調べる。
import { persons, scenario, totalTroops } from "../data";
import type { Campaign } from "./Campaign";
import { distanceKm } from "./pathfinding";

export type ChangeKind = "state" | "city" | "ruler" | "person" | "army" | "supply" | "diplomacy" | "finance" | "order" | "capital";
export const CHANGE_LABEL: Record<ChangeKind, string> = {
  state: "国家", city: "都市", ruler: "君主", person: "人物", army: "軍団", supply: "兵力・兵糧・士気", diplomacy: "外交", finance: "財政", order: "治安・安定", capital: "首都",
};

export interface EventChange {
  kind: ChangeKind;
  text: string;
  /** 地図で光らせる場所 */
  lon?: number;
  lat?: number;
  /** 光の色(戦い・損失は朱、得たものは金) */
  tone?: "gain" | "loss" | "neutral";
}

export interface EventDiff {
  changes: EventChange[];
  /** 守るべき決まりに反した所(瞬間移動・存在しない人物)。空なら問題なし */
  violations: string[];
}

interface ArmySnap { f: string; lon: number; lat: number; men: number; food: number; morale: number; cmd: string; name: string; status: string; dest?: { lon: number; lat: number } }
export interface Snapshot {
  day: number;
  year: number;
  owners: Record<string, string | undefined>;
  factions: Record<string, { name: string; fallen: boolean; ruler?: string }>;
  status: Record<string, string>;
  pfac: Record<string, string>;
  role: Record<string, string>;
  loyalty: Record<string, number>;
  fame: Record<string, number>;
  amity: Record<string, number>;
  regents: Record<string, string>;
  armies: Record<string, ArmySnap>;
  rel: Record<string, string>;
  purse: Record<string, { gold: number; grain: number }>;
  garrison: Record<string, number>;
  order: Record<string, number>;
  stab: Record<string, number>;
  capitals: Record<string, string>;
}

export function snapshot(c: Campaign): Snapshot {
  const armies: Record<string, ArmySnap> = {};
  for (const s of c.armies) {
    const end = s.route?.points[s.route.points.length - 1];
    armies[s.army.id] = { f: s.army.factionId, lon: s.army.lon, lat: s.army.lat, men: totalTroops(s.army), food: s.army.food, morale: s.army.morale, cmd: s.army.commanderId, name: s.army.name, status: s.status, dest: end ? { lon: end.lon, lat: end.lat } : undefined };
  }
  const garrison: Record<string, number> = {};
  const order: Record<string, number> = {};
  for (const city of c.cities) {
    const st = c.cityState(city);
    garrison[city.id] = st.garrison;
    order[city.id] = st.order ?? 70;
  }
  const capitals: Record<string, string> = {};
  for (const [f, v] of Object.entries(c.capitals)) capitals[f] = v.cityId;
  return {
    day: Math.floor(c.day),
    year: c.calendar().year,
    owners: { ...scenario.cityOwners },
    factions: Object.fromEntries(scenario.factions.map((f) => [f.id, { name: f.name, fallen: !!f.fallen, ruler: c.rulerOf(f.id)?.id }])),
    status: Object.fromEntries(persons.map((p) => [p.id, c.personStatus(p.id)])),
    pfac: Object.fromEntries(persons.map((p) => [p.id, p.factionId])),
    role: Object.fromEntries(persons.map((p) => [p.id, p.role])),
    loyalty: { ...c.loyalty.loyalty },
    fame: { ...c.loyalty.fame },
    amity: { ...c.diplo.amity },
    regents: { ...c.court.regents },
    armies,
    rel: { ...c.relations } as Record<string, string>,
    purse: JSON.parse(JSON.stringify(c.factionStates)) as Snapshot["purse"],
    garrison,
    order,
    stab: { ...c.court.stability },
    capitals,
  };
}

const REL: Record<string, string> = { war: "戦争", hostile: "敵対", neutral: "中立", friendly: "友好", nonaggression: "不可侵", alliance: "同盟", vassal: "従属", peace: "和平" };

/** 前後の写しから、変わった所を並べる */
export function diffSnapshots(c: Campaign, a: Snapshot, b: Snapshot): EventDiff {
  const changes: EventChange[] = [];
  const violations: string[] = [];
  const fname = (id: string | undefined): string => (id ? b.factions[id]?.name ?? a.factions[id]?.name ?? id : "所属なし");
  const city = (id: string) => c.cities.find((x) => x.id === id);
  const pname = (id: string | undefined): string => (id ? persons.find((p) => p.id === id)?.name ?? id : "—");
  // 国家:建国・滅亡
  for (const [id, f] of Object.entries(b.factions)) {
    if (!a.factions[id]) {
      const cap = city(b.capitals[id] ?? "");
      changes.push({ kind: "state", text: `${f.name}が建国(君主 ${pname(f.ruler)})`, lon: cap?.lon, lat: cap?.lat, tone: "gain" });
    } else if (f.fallen && !a.factions[id].fallen) {
      const cap = city(a.capitals[id] ?? "");
      changes.push({ kind: "state", text: `${f.name}が滅亡`, lon: cap?.lon, lat: cap?.lat, tone: "loss" });
    }
  }
  // 都市
  for (const [id, o] of Object.entries(b.owners)) {
    if (a.owners[id] === o) continue;
    const k = city(id);
    if (!k) continue;
    changes.push({ kind: "city", text: `${k.name}:${fname(a.owners[id])} → ${fname(o)}`, lon: k.lon, lat: k.lat, tone: "neutral" });
  }
  // 首都
  for (const [f, cid] of Object.entries(b.capitals)) {
    if (!a.capitals[f] || a.capitals[f] === cid || !a.factions[f]) continue;
    const k = city(cid);
    changes.push({ kind: "capital", text: `${fname(f)}の首都:${city(a.capitals[f])?.name ?? "—"} → ${k?.name ?? "—"}`, lon: k?.lon, lat: k?.lat, tone: "neutral" });
  }
  // 君主
  for (const [id, f] of Object.entries(b.factions)) {
    const before = a.factions[id];
    if (!before || before.ruler === f.ruler || f.fallen) continue;
    const cap = city(b.capitals[id] ?? "");
    changes.push({ kind: "ruler", text: `${f.name}の君主:${pname(before.ruler)} → ${pname(f.ruler)}`, lon: cap?.lon, lat: cap?.lat, tone: "neutral" });
  }
  // 人物:死亡・捕縛・解放・所属の変更。存在しない人物の登場がないか
  const STATUS: Record<string, string> = { active: "健在", wounded: "負傷", dead: "死去", captured: "捕虜", protected: "保護下" };
  for (const p of persons) {
    const s0 = a.status[p.id], s1 = b.status[p.id];
    const f0 = a.pfac[p.id], f1 = b.pfac[p.id];
    if (s0 !== s1) {
      const loc = c.placement.locationOf(p.id);
      const k = loc.cityId ? city(loc.cityId) : undefined;
      changes.push({ kind: "person", text: `${p.name}:${STATUS[s0] ?? s0} → ${STATUS[s1] ?? s1}`, lon: k?.lon, lat: k?.lat, tone: s1 === "dead" || s1 === "captured" ? "loss" : "neutral" });
      if (s1 === "active" && s0 === "dead") violations.push(`死んだ人物が健在に戻った:${p.name}`);
    } else if (f0 !== f1 && s1 !== "dead") changes.push({ kind: "person", text: `${p.name}:${fname(f0)} → ${fname(f1)}`, tone: "neutral" });
    // 生まれる前の人物が、事件で軍団の指揮官や君主になっていないか
    const actsNow = Object.values(b.armies).some((x) => x.cmd === p.id) || Object.values(b.factions).some((f) => f.ruler === p.id);
    const actedBefore = Object.values(a.armies).some((x) => x.cmd === p.id) || Object.values(a.factions).some((f) => f.ruler === p.id);
    if (actsNow && !actedBefore && p.born !== null && p.born > b.year) violations.push(`生まれる前の人物が登場:${p.name}(${p.born}年生まれ)`);
    if (actsNow && !actedBefore && s1 === "dead") violations.push(`死んだ人物が登場:${p.name}`);
  }
  // 役職と忠誠(大きな変化)
  const ROLE: Record<string, string> = { ruler: "君主", general: "将軍", strategist: "軍師", minister: "大臣", heir: "世子", consort: "后妃", royal: "皇族" };
  const loyal: Record<string, number> = {};
  for (const p of persons) {
    if (a.role[p.id] !== b.role[p.id] && b.status[p.id] !== "dead" && b.role[p.id] !== "ruler" && a.role[p.id] !== "ruler") changes.push({ kind: "person", text: `${p.name}の役目:${ROLE[a.role[p.id]] ?? a.role[p.id]} → ${ROLE[b.role[p.id]] ?? b.role[p.id]}`, tone: "neutral" });
    const d = (b.loyalty[p.id] ?? 0) - (a.loyalty[p.id] ?? 0);
    if (Math.abs(d) >= 4 && a.loyalty[p.id] !== undefined) loyal[b.pfac[p.id]] = (loyal[b.pfac[p.id]] ?? 0) + Math.sign(d);
  }
  // 1人の大きな変化(Version 42):忠誠・名声が8以上動いた人
  for (const p of persons) {
    const dl = (b.loyalty[p.id] ?? 0) - (a.loyalty[p.id] ?? 0);
    const df = (b.fame[p.id] ?? 0) - (a.fame[p.id] ?? 0);
    if (b.status[p.id] === "dead") continue;
    if (Math.abs(dl) >= 8 && a.loyalty[p.id] !== undefined) changes.push({ kind: "person", text: `${p.name}の忠誠 ${dl > 0 ? "+" : ""}${Math.round(dl)}`, tone: dl > 0 ? "gain" : "loss" });
    if (Math.abs(df) >= 8 && a.fame[p.id] !== undefined) changes.push({ kind: "person", text: `${p.name}の名声 ${df > 0 ? "+" : ""}${Math.round(df)}`, tone: "gain" });
  }
  // 摂政(朝政を握る人)
  for (const [f, id] of Object.entries(b.regents)) if (a.regents[f] !== id) changes.push({ kind: "ruler", text: `${fname(f)}の朝政:${pname(id)}が握る`, tone: "neutral" });
  // 国どうしの友好度(10以上の変化)
  for (const k of new Set([...Object.keys(a.amity), ...Object.keys(b.amity)])) {
    const d = (b.amity[k] ?? 0) - (a.amity[k] ?? 0);
    if (Math.abs(d) < 10) continue;
    const [x, y] = k.split("|");
    changes.push({ kind: "diplomacy", text: `${fname(x)}と${fname(y)}の友好度 ${d > 0 ? "+" : ""}${Math.round(d)}`, tone: d > 0 ? "gain" : "loss" });
  }
  for (const [f, n] of Object.entries(loyal)) if (Math.abs(n) >= 2) changes.push({ kind: "order", text: `${fname(f)}の臣下${Math.abs(n)}人の忠誠が${n > 0 ? "上がった" : "下がった"}`, tone: n > 0 ? "gain" : "loss" });
  // 軍団:新しい・消えた・動いた(瞬間移動の確かめ)・兵と兵糧と士気
  for (const [id, x] of Object.entries(b.armies)) {
    const y = a.armies[id];
    if (!y) {
      // 新しい軍団は、自国の都市のそば(80km以内)にしか現れない
      const near = c.cities.filter((k) => b.owners[k.id] === x.f).some((k) => distanceKm(k, x) < 80);
      changes.push({ kind: "army", text: `${x.name}(${fname(x.f)}・${Math.round(x.men).toLocaleString("ja-JP")}人)が編成`, lon: x.lon, lat: x.lat, tone: "gain" });
      if (!near) violations.push(`自国の都市から遠い所に軍団が現れた:${x.name}`);
      continue;
    }
    const moved = distanceKm(x, y);
    if (moved > 60) violations.push(`瞬間移動:${x.name}が一瞬で${Math.round(moved)}km動いた`);
    else if (moved > 5) changes.push({ kind: "army", text: `${x.name}が布陣(${Math.round(moved)}km)`, lon: x.lon, lat: x.lat, tone: "neutral" });
    if (x.f !== y.f) changes.push({ kind: "army", text: `${x.name}:${fname(y.f)} → ${fname(x.f)}`, lon: x.lon, lat: x.lat, tone: "neutral" });
    // 進軍の開始・行き先の変更(事件で、戦場や都市へ向かう)
    if (x.dest && (!y.dest || distanceKm(x.dest, y.dest) > 10)) {
      const near = c.cities.filter((k) => k.kind !== "pass").sort((p1, p2) => distanceKm(p1, x.dest!) - distanceKm(p2, x.dest!))[0];
      changes.push({ kind: "army", text: `${x.name}が${near && distanceKm(near, x.dest) < 60 ? `${near.name}の方面` : "戦場"}へ進軍を開始`, lon: x.lon, lat: x.lat, tone: "neutral" });
    } else if (x.status !== y.status && (x.status === "fighting" || y.status === "fighting")) changes.push({ kind: "army", text: `${x.name}:${x.status === "fighting" ? "交戦に入る" : "交戦を終える"}`, lon: x.lon, lat: x.lat, tone: "neutral" });
    const dm = x.men - y.men, df = x.food - y.food, dmo = x.morale - y.morale;
    if (Math.abs(dm) >= 100 || Math.abs(df) >= 3 || Math.abs(dmo) >= 3) {
      const parts = [Math.abs(dm) >= 100 ? `兵 ${dm > 0 ? "+" : ""}${Math.round(dm).toLocaleString("ja-JP")}` : "", Math.abs(df) >= 3 ? `兵糧 ${df > 0 ? "+" : ""}${Math.round(df)}日分` : "", Math.abs(dmo) >= 3 ? `士気 ${dmo > 0 ? "+" : ""}${Math.round(dmo)}` : ""].filter(Boolean);
      changes.push({ kind: "supply", text: `${x.name}:${parts.join("・")}`, lon: x.lon, lat: x.lat, tone: dm < 0 || dmo < 0 ? "loss" : "gain" });
    }
  }
  for (const [id, y] of Object.entries(a.armies)) {
    if (!b.armies[id]) changes.push({ kind: "army", text: `${y.name}(${fname(y.f)})が解散・消滅`, lon: y.lon, lat: y.lat, tone: "loss" });
  }
  // 守備兵(大きな変化だけ)
  for (const [id, g] of Object.entries(b.garrison)) {
    const d = g - (a.garrison[id] ?? g);
    if (Math.abs(d) < 1000) continue;
    const k = city(id);
    if (k) changes.push({ kind: "supply", text: `${k.name}の守備兵 ${d > 0 ? "+" : ""}${Math.round(d).toLocaleString("ja-JP")}`, lon: k.lon, lat: k.lat, tone: d > 0 ? "gain" : "loss" });
  }
  // 外交
  for (const k of new Set([...Object.keys(a.rel), ...Object.keys(b.rel)])) {
    const r0 = a.rel[k] ?? "neutral", r1 = b.rel[k] ?? "neutral";
    if (r0 === r1) continue;
    const [x, y] = k.split("|");
    if (!a.factions[x] || !a.factions[y]) continue; // 新しい国の関係は、建国の行にまとめる
    if (b.factions[x]?.fallen || b.factions[y]?.fallen) continue;
    changes.push({ kind: "diplomacy", text: `${fname(x)}と${fname(y)}:${REL[r0] ?? r0} → ${REL[r1] ?? r1}`, tone: r1 === "war" ? "loss" : "gain" });
  }
  // 財政
  for (const [f, p] of Object.entries(b.purse)) {
    const q = a.purse[f];
    if (!q || b.factions[f]?.fallen) continue;
    const dg = p.gold - q.gold, dr = p.grain - q.grain;
    if (Math.abs(dg) >= 50 || Math.abs(dr) >= 50) changes.push({ kind: "finance", text: `${fname(f)}:${Math.abs(dg) >= 50 ? `金 ${dg > 0 ? "+" : ""}${Math.round(dg)}` : ""}${Math.abs(dg) >= 50 && Math.abs(dr) >= 50 ? "・" : ""}${Math.abs(dr) >= 50 ? `兵糧 ${dr > 0 ? "+" : ""}${Math.round(dr)}` : ""}`, tone: dg + dr >= 0 ? "gain" : "loss" });
  }
  // 治安・安定
  for (const [id, o] of Object.entries(b.order)) {
    const d = o - (a.order[id] ?? o);
    if (Math.abs(d) < 5) continue;
    const k = city(id);
    if (k) changes.push({ kind: "order", text: `${k.name}の治安 ${d > 0 ? "+" : ""}${Math.round(d)}`, lon: k.lon, lat: k.lat, tone: d > 0 ? "gain" : "loss" });
  }
  for (const [f, s] of Object.entries(b.stab)) {
    const d = s - (a.stab[f] ?? s);
    if (Math.abs(d) >= 3 && !b.factions[f]?.fallen) changes.push({ kind: "order", text: `${fname(f)}の安定 ${d > 0 ? "+" : ""}${Math.round(d)}`, tone: d > 0 ? "gain" : "loss" });
  }
  return { changes, violations };
}
