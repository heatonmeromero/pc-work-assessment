// 数値入力課題の問題生成（レベル1〜10、シード付き乱数でランダム生成）

import type { RNG } from '../../engine/rng';
import { pick, randInt } from '../../engine/rng';

export type FieldKind = 'plain' | 'code' | 'codeh' | 'qty' | 'amount' | 'price';

export interface NumericField {
  label: string;
  value: string;
  kind: FieldKind;
}

export interface NumericProblem {
  level: number;
  /** 行 × 項目。レベル9以下は1行、レベル10は2行の表転記 */
  rows: NumericField[][];
}

interface LvCfg {
  kinds: FieldKind[];
  rows: number;
  /** 類似数字（1/7・0/8・3/8 等）の出現バイアス */
  sim: number;
  dmin: number;
  dmax: number;
}

const LV: LvCfg[] = [
  { kinds: ['plain'], rows: 1, sim: 0.15, dmin: 3, dmax: 3 }, // L1
  { kinds: ['plain'], rows: 1, sim: 0.2, dmin: 4, dmax: 5 }, // L2
  { kinds: ['code', 'qty'], rows: 1, sim: 0.25, dmin: 4, dmax: 6 }, // L3
  { kinds: ['code', 'amount'], rows: 1, sim: 0.3, dmin: 5, dmax: 7 }, // L4
  { kinds: ['code', 'qty', 'amount'], rows: 1, sim: 0.35, dmin: 6, dmax: 8 }, // L5
  { kinds: ['codeh', 'qty', 'amount'], rows: 1, sim: 0.4, dmin: 7, dmax: 9 }, // L6
  { kinds: ['codeh', 'amount', 'price', 'qty'], rows: 1, sim: 0.45, dmin: 8, dmax: 10 }, // L7
  { kinds: ['code', 'codeh', 'amount', 'price'], rows: 1, sim: 0.55, dmin: 9, dmax: 11 }, // L8
  { kinds: ['code', 'codeh', 'qty', 'amount', 'price'], rows: 1, sim: 0.6, dmin: 10, dmax: 12 }, // L9
  { kinds: ['code', 'codeh', 'qty', 'amount', 'price'], rows: 2, sim: 0.65, dmin: 10, dmax: 12 }, // L10
];

export const NUMERIC_LEVEL_SUMMARIES = [
  '3けたの数字 1項目',
  '4〜5けたの数字 1項目',
  '4〜6けた 2項目（コード・数量）',
  '5〜7けた 2項目（カンマ付き金額）',
  '6〜8けた 3項目',
  '7〜9けた 3項目（ハイフン付きコード）',
  '8〜10けた 4項目（小数点を含む）',
  '9〜11けた 4項目（記号の混在が多い）',
  '10〜12けた 5項目',
  '10〜12けた 5項目 × 2行の表転記',
];

const LABELS: Record<FieldKind, string[]> = {
  plain: ['管理番号', '受付番号'],
  code: ['商品コード', '会員番号', '伝票番号'],
  codeh: ['注文番号', '管理コード'],
  qty: ['数量', '個数'],
  amount: ['金額', '合計金額'],
  price: ['単価'],
};

/** 見まちがいやすい数字（1/7・0/8・3/8・6/9） */
const CONFUSABLE = ['0', '1', '3', '6', '7', '8', '9'];
const ALL = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function digit(rng: RNG, sim: number, nonzero = false): string {
  const pool = rng() < sim ? CONFUSABLE : ALL;
  let c = pick(rng, pool);
  if (nonzero) {
    while (c === '0') c = pick(rng, pool);
  }
  return c;
}

function digits(rng: RNG, len: number, sim: number, leadingZeroOK: boolean): string {
  let s = digit(rng, sim, !leadingZeroOK);
  for (let i = 1; i < len; i++) s += digit(rng, sim, false);
  return s;
}

function addCommas(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function makeValue(kind: FieldKind, cfg: LvCfg, rng: RNG): string {
  switch (kind) {
    case 'plain': {
      return digits(rng, randInt(rng, cfg.dmin, cfg.dmax), cfg.sim, false);
    }
    case 'code': {
      // 先頭ゼロもあり得るコード
      return digits(rng, randInt(rng, cfg.dmin, cfg.dmax), cfg.sim, true);
    }
    case 'codeh': {
      const len = randInt(rng, cfg.dmin, cfg.dmax);
      const groups: number[] = [];
      let rest = len;
      const parts = len <= 7 ? 2 : 3;
      for (let i = 0; i < parts - 1; i++) {
        const g = randInt(rng, 2, Math.max(2, Math.floor(rest / (parts - i)) ));
        groups.push(g);
        rest -= g;
      }
      groups.push(Math.max(2, rest));
      return groups.map((g) => digits(rng, g, cfg.sim, true)).join('-');
    }
    case 'qty': {
      const len = randInt(rng, 2, cfg.dmax >= 10 ? 4 : 3);
      return digits(rng, len, cfg.sim, false);
    }
    case 'amount': {
      const len = randInt(rng, Math.max(3, cfg.dmin - 2), Math.max(4, cfg.dmax - 1));
      return addCommas(digits(rng, len, cfg.sim, false));
    }
    case 'price': {
      const intLen = randInt(rng, 3, Math.max(4, cfg.dmax - 5));
      const intPart = addCommas(digits(rng, intLen, cfg.sim, false));
      const dec = digit(rng, cfg.sim) + digit(rng, cfg.sim);
      return `${intPart}.${dec}`;
    }
  }
}

export function generateNumeric(level: number, rng: RNG): NumericProblem {
  const lv = Math.max(1, Math.min(10, Math.round(level)));
  const cfg = LV[lv - 1];
  const usedValues = new Set<string>();
  const rows: NumericField[][] = [];

  for (let r = 0; r < cfg.rows; r++) {
    const usedLabels = new Set<string>();
    const row: NumericField[] = [];
    for (const kind of cfg.kinds) {
      const labelPool = LABELS[kind].filter((l) => !usedLabels.has(l));
      const label = labelPool.length > 0 ? pick(rng, labelPool) : LABELS[kind][0];
      usedLabels.add(label);
      let value = makeValue(kind, cfg, rng);
      // 項目取りちがえ検出のため、伝票内で同一値は避ける
      for (let attempt = 0; attempt < 20 && usedValues.has(value); attempt++) {
        value = makeValue(kind, cfg, rng);
      }
      usedValues.add(value);
      row.push({ label, value, kind });
    }
    rows.push(row);
  }
  return { level: lv, rows };
}

/** 1問あたりの標準所要時間の目安（秒）。アセスメントモードの時間配分に使用予定 */
export function numericStdSeconds(level: number): number {
  return Math.round(4 + level * 2.2);
}
