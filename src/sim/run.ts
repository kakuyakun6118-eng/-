import { writeFileSync } from 'node:fs';

import factionsData from '../data/factions.json';
import provincesData from '../data/provinces.json';
import { TOTAL_TURNS } from '../core/constants';
import { createInitialState } from '../core/economy';
import { tick } from '../core/tick';
import type { BarbarianFaction, GameState, Province } from '../core/types';

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
].join(',');

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
  ].join(',');
}

function parseArgs(argv: string[]): { turns: number; out: string } {
  let turns = TOTAL_TURNS;
  let out = 'result.csv';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--turns') turns = Number(argv[++i]);
    else if (argv[i] === '--out') out = argv[++i];
  }
  return { turns, out };
}

function run(): void {
  const { turns, out } = parseArgs(process.argv.slice(2));
  let state = createInitialState(provincesData as Province[], factionsData as BarbarianFaction[]);

  const rows = [CSV_HEADER, toCsvRow(state)];
  for (let i = 0; i < turns; i++) {
    state = tick(state, [], i);
    rows.push(toCsvRow(state));
  }

  writeFileSync(out, rows.join('\n') + '\n');
  console.log(`Wrote ${turns} turns to ${out}`);
}

run();
