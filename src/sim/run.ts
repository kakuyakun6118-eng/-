import { writeFileSync } from 'node:fs';

import dynastyData from '../data/dynasty.json';
import factionsData from '../data/factions.json';
import provincesData from '../data/provinces.json';
import { TOTAL_TURNS } from '../core/constants';
import { adjustRulerAbilities } from '../core/dynasty';
import { createInitialState } from '../core/economy';
import { evaluateScore, tick } from '../core/tick';
import type {
  BarbarianFaction,
  Dynasty,
  GameState,
  Province,
  RulerAbilities,
} from '../core/types';
import { strategies } from './strategies';

const CSV_HEADER = [
  'turn',
  'year',
  'treasury',
  'taxBase',
  'fieldArmy',
  'legitimacy',
  'senateSupport',
  'eastRelations',
  'foederatiLoyalty',
  'provincesHeld',
  'settledFactions',
  'status',
].join(',');

function provincesHeld(state: GameState): number {
  return Object.values(state.provinces).filter((p) => p.control > 0).length;
}

function settledFactions(state: GameState): number {
  return Object.values(state.factions).filter((f) => f.stance === 'settled').length;
}

function toCsvRow(state: GameState): string {
  return [
    state.turn,
    state.year,
    state.treasury.toFixed(2),
    state.taxBase.toFixed(2),
    state.fieldArmy.toFixed(2),
    state.legitimacy.toFixed(2),
    state.senateSupport.toFixed(2),
    state.eastRelations.toFixed(2),
    state.foederatiLoyalty.toFixed(2),
    provincesHeld(state),
    settledFactions(state),
    state.status,
  ].join(',');
}

interface Options {
  turns: number;
  out: string | null;
  strategy: string;
  trials: number;
  seed: number;
  /** --adjust 軍事,統治,交渉 で君主能力を上書きする（スコアは調整済みになる） */
  adjust: Partial<RulerAbilities> | null;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    turns: TOTAL_TURNS,
    out: null,
    strategy: 'passive',
    trials: 1,
    seed: 0,
    adjust: null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--turns') options.turns = Number(argv[++i]);
    else if (argv[i] === '--out') options.out = argv[++i];
    else if (argv[i] === '--strategy') options.strategy = argv[++i];
    else if (argv[i] === '--trials') options.trials = Number(argv[++i]);
    else if (argv[i] === '--seed') options.seed = Number(argv[++i]);
    else if (argv[i] === '--adjust') {
      const [military, governance, diplomacy] = argv[++i].split(',').map(Number);
      options.adjust = { military, governance, diplomacy };
    }
  }
  return options;
}

function freshState(options: Options): GameState {
  const state = createInitialState(
    provincesData as Province[],
    factionsData as BarbarianFaction[],
    dynastyData as Dynasty,
  );
  return options.adjust ? adjustRulerAbilities(state, options.adjust) : state;
}

interface TrialOutcome {
  state: GameState;
  rows: string[];
  /** 崩壊が確定した年。存続した場合は null */
  collapseYear: number | null;
  nonFinite: boolean;
}

function runTrial(options: Options, seedBase: number): TrialOutcome {
  const strategy = strategies[options.strategy];
  let state = freshState(options);
  const rows = [CSV_HEADER, toCsvRow(state)];
  let collapseYear: number | null = null;
  let nonFinite = false;

  for (let i = 0; i < options.turns; i++) {
    state = tick(state, strategy(state), seedBase + i);
    rows.push(toCsvRow(state));

    if (!isStateFinite(state)) {
      nonFinite = true;
      break;
    }
    if (state.status === 'collapsed' && collapseYear === null) {
      collapseYear = state.year;
    }
  }

  return { state, rows, collapseYear, nonFinite };
}

function isStateFinite(state: GameState): boolean {
  return (
    Number.isFinite(state.treasury) &&
    Number.isFinite(state.taxBase) &&
    Number.isFinite(state.fieldArmy) &&
    Number.isFinite(state.legitimacy) &&
    Number.isFinite(state.senateSupport) &&
    Number.isFinite(state.eastRelations) &&
    Number.isFinite(state.foederatiLoyalty) &&
    Object.values(state.provinces).every(
      (p) => Number.isFinite(p.control) && Number.isFinite(p.baseTax) && Number.isFinite(p.garrison),
    ) &&
    Object.values(state.factions).every((f) => Number.isFinite(f.strength))
  );
}

const average = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

function reportAggregate(options: Options): void {
  const survived: number[] = [];
  const collapseYears: number[] = [];
  const scores: number[] = [];
  const taxBases: number[] = [];
  let nonFiniteTrials = 0;

  for (let trial = 0; trial < options.trials; trial++) {
    const outcome = runTrial(options, options.seed + trial * 1000);
    if (outcome.nonFinite) nonFiniteTrials++;
    survived.push(outcome.state.status === 'survived' ? 1 : 0);
    if (outcome.collapseYear !== null) collapseYears.push(outcome.collapseYear);
    const score = evaluateScore(outcome.state);
    scores.push(score.score);
    taxBases.push(score.taxBase);
  }

  const survivalRate = (average(survived) * 100).toFixed(0);
  console.log(
    `strategy=${options.strategy} trials=${options.trials}` +
      (options.adjust ? ' [調整済み: スコアは他と比較できない]' : ''),
  );
  console.log(`  survival rate      : ${survivalRate}%`);
  console.log(`  non-finite trials  : ${nonFiniteTrials}`);
  console.log(`  avg score          : ${average(scores).toFixed(0)}`);
  console.log(`  avg final taxBase  : ${average(taxBases).toFixed(1)}`);
  if (collapseYears.length > 0) {
    console.log(
      `  collapse year      : avg ${average(collapseYears).toFixed(1)} ` +
        `(${Math.min(...collapseYears)}–${Math.max(...collapseYears)}, n=${collapseYears.length})`,
    );
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));

  if (!strategies[options.strategy]) {
    console.error(
      `unknown strategy: ${options.strategy} (available: ${Object.keys(strategies).join(', ')})`,
    );
    process.exit(1);
  }

  if (options.trials > 1) {
    reportAggregate(options);
    return;
  }

  const outcome = runTrial(options, options.seed);
  if (options.out) {
    writeFileSync(options.out, outcome.rows.join('\n') + '\n');
    console.log(`Wrote ${options.turns} turns to ${options.out}`);
  }
  const score = evaluateScore(outcome.state);
  console.log(
    `status=${score.status} year=${score.finalYear} provinces=${score.provincesHeld} ` +
      `taxBase=${score.taxBase.toFixed(1)} legitimacy=${score.legitimacy.toFixed(1)} ` +
      `score=${score.score.toFixed(0)} rulers=${score.rulerCount} ` +
      `crises=${score.successionCrises}` +
      (score.abilitiesAdjusted ? ' [調整済み]' : ''),
  );
}

main();
