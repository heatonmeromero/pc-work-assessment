// 検索修正課題の問題生成（レベル1〜10）
// ・「原本（正しいデータ）」と「修正対象（誤りを含むデータ）」の表を生成する。
// ・レベルが上がると：行数増加（5→50）、誤りの密度低下（探す負荷増）、
//   誤りの種類が巧妙化（数字違い→入れかわり→似た漢字→全角/半角）。

import type { RNG } from '../../engine/rng';
import { pick, randInt } from '../../engine/rng';

export type SfErrorType = 'digit_diff' | 'digit_swap' | 'kana_diff' | 'similar_kanji' | 'width_error';
export type SfColKind = 'code' | 'name' | 'qty' | 'amount';

export interface SfColumn {
  key: string;
  label: string;
  kind: SfColKind;
}

export interface SfCellError {
  r: number;
  c: number;
  type: SfErrorType;
}

export interface SearchFixProblem {
  level: number;
  columns: SfColumn[];
  original: string[][];
  presented: string[][];
  errors: SfCellError[];
}

// ---- 似た文字テーブル ----

const KANJI_GROUPS = [
  ['大', '太', '犬'],
  ['末', '未'],
  ['土', '士'],
  ['木', '本'],
  ['名', '各'],
  ['客', '容'],
  ['待', '持'],
  ['千', '干'],
  ['力', '刀'],
  ['万', '方'],
  ['田', '由', '申'],
  ['録', '緑'],
  ['検', '険', '験'],
  ['帳', '張'],
];
const KANA_GROUPS = [
  ['シ', 'ツ'],
  ['ソ', 'ン'],
  ['ク', 'ワ'],
  ['ス', 'ヌ'],
  ['チ', 'テ'],
  ['マ', 'ム'],
  ['レ', 'ル'],
];

function buildSimilarMap(groups: string[][]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const g of groups) {
    for (const ch of g) {
      m.set(ch, g.filter((x) => x !== ch));
    }
  }
  return m;
}
const KANJI_MAP = buildSimilarMap(KANJI_GROUPS);
const KANA_MAP = buildSimilarMap(KANA_GROUPS);

// ---- データ生成 ----

const NAME_POOL = [
  '大型クリップ',
  '木製トレー',
  '名刺ホルダー',
  '万年筆',
  '検品シート',
  '緑色ファイル',
  '容量ケース',
  '帳簿ノート',
  '太字マーカー',
  '持ち手カゴ',
  '両面テープ',
  '油性ペン',
  '卓上ライト',
  '包装テープ',
  '保存ボックス',
];

const CODE_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ'; // 紛らわしいI/O/Qを除く

function genCode(rng: RNG): string {
  const a = pick(rng, [...CODE_LETTERS]);
  const b = pick(rng, [...CODE_LETTERS]);
  return `${a}${b}-${String(randInt(rng, 1000, 9999))}`;
}

function addCommas(n: number): string {
  return n.toLocaleString('en-US');
}

function genCell(kind: SfColKind, rng: RNG): string {
  switch (kind) {
    case 'code':
      return genCode(rng);
    case 'name':
      return pick(rng, NAME_POOL);
    case 'qty':
      return String(randInt(rng, 1, 999));
    case 'amount':
      return addCommas(randInt(rng, 100, 999999));
  }
}

// ---- 誤りの埋め込み ----

const DIGIT = /[0-9]/;
const HALFWIDTH = /[0-9A-Za-z,\-]/;

function toFull(c: string): string {
  if (c === ',') return '，';
  if (c === '-') return '－';
  return String.fromCharCode(c.charCodeAt(0) + 0xfee0);
}

function corruptDigitDiff(v: string, rng: RNG): string | null {
  const idxs = [...v].map((c, i) => (DIGIT.test(c) ? i : -1)).filter((i) => i >= 0);
  if (idxs.length === 0) return null;
  const i = pick(rng, idxs);
  let d = String(randInt(rng, 0, 9));
  for (let t = 0; t < 10 && d === v[i]; t++) d = String(randInt(rng, 0, 9));
  if (d === v[i]) return null;
  return v.slice(0, i) + d + v.slice(i + 1);
}

function corruptDigitSwap(v: string, rng: RNG): string | null {
  const pairs: number[] = [];
  for (let i = 0; i < v.length - 1; i++) {
    if (DIGIT.test(v[i]) && DIGIT.test(v[i + 1]) && v[i] !== v[i + 1]) pairs.push(i);
  }
  if (pairs.length === 0) return null;
  const i = pick(rng, pairs);
  return v.slice(0, i) + v[i + 1] + v[i] + v.slice(i + 2);
}

function corruptWidth(v: string, rng: RNG): string | null {
  const idxs = [...v].map((c, i) => (HALFWIDTH.test(c) ? i : -1)).filter((i) => i >= 0);
  if (idxs.length === 0) return null;
  const i = pick(rng, idxs);
  return v.slice(0, i) + toFull(v[i]) + v.slice(i + 1);
}

function corruptBySimilar(v: string, map: Map<string, string[]>, rng: RNG): string | null {
  const idxs = [...v].map((c, i) => (map.has(c) ? i : -1)).filter((i) => i >= 0);
  if (idxs.length === 0) return null;
  const i = pick(rng, idxs);
  const alt = pick(rng, map.get(v[i])!);
  return v.slice(0, i) + alt + v.slice(i + 1);
}

function applyError(value: string, type: SfErrorType, rng: RNG): string | null {
  switch (type) {
    case 'digit_diff':
      return corruptDigitDiff(value, rng);
    case 'digit_swap':
      return corruptDigitSwap(value, rng);
    case 'width_error':
      return corruptWidth(value, rng);
    case 'kana_diff':
      return corruptBySimilar(value, KANA_MAP, rng);
    case 'similar_kanji':
      return corruptBySimilar(value, KANJI_MAP, rng);
  }
}

// ---- レベル設定 ----

interface SfLvCfg {
  rows: number;
  cols: SfColKind[];
  errors: number;
  types: SfErrorType[];
}

const ALL_COLS: Record<SfColKind, SfColumn> = {
  code: { key: 'code', label: 'コード', kind: 'code' },
  name: { key: 'name', label: '品名', kind: 'name' },
  qty: { key: 'qty', label: '数量', kind: 'qty' },
  amount: { key: 'amount', label: '金額', kind: 'amount' },
};

const LV: SfLvCfg[] = [
  { rows: 5, cols: ['name', 'qty'], errors: 3, types: ['digit_diff', 'kana_diff'] }, // L1
  { rows: 7, cols: ['name', 'qty'], errors: 3, types: ['digit_diff', 'kana_diff'] }, // L2
  { rows: 9, cols: ['code', 'name', 'qty'], errors: 4, types: ['digit_diff', 'kana_diff', 'digit_swap'] }, // L3
  { rows: 12, cols: ['code', 'name', 'qty'], errors: 4, types: ['digit_diff', 'kana_diff', 'digit_swap'] }, // L4
  { rows: 16, cols: ['code', 'name', 'qty'], errors: 5, types: ['digit_diff', 'kana_diff', 'digit_swap', 'similar_kanji'] }, // L5
  { rows: 20, cols: ['code', 'name', 'qty', 'amount'], errors: 5, types: ['digit_diff', 'kana_diff', 'digit_swap', 'similar_kanji'] }, // L6
  { rows: 26, cols: ['code', 'name', 'qty', 'amount'], errors: 6, types: ['digit_swap', 'kana_diff', 'similar_kanji', 'width_error'] }, // L7
  { rows: 32, cols: ['code', 'name', 'qty', 'amount'], errors: 6, types: ['digit_swap', 'kana_diff', 'similar_kanji', 'width_error'] }, // L8
  { rows: 40, cols: ['code', 'name', 'qty', 'amount'], errors: 7, types: ['digit_swap', 'similar_kanji', 'width_error', 'digit_diff'] }, // L9
  { rows: 50, cols: ['code', 'name', 'qty', 'amount'], errors: 7, types: ['digit_swap', 'similar_kanji', 'width_error', 'digit_diff'] }, // L10
];

export const SEARCHFIX_LEVEL_SUMMARIES = [
  '5行・2項目／誤り3つ（数字・カナのちがい）',
  '7行・2項目／誤り3つ',
  '9行・3項目／誤り4つ（数字の入れかわりを追加）',
  '12行・3項目／誤り4つ',
  '16行・3項目／誤り5つ（似た漢字を追加）',
  '20行・4項目／誤り5つ',
  '26行・4項目／誤り6つ（全角/半角を追加）',
  '32行・4項目／誤り6つ',
  '40行・4項目／誤り7つ（探す負荷が高い）',
  '50行・4項目／誤り7つ（巧妙な誤り・記憶保持の負荷）',
];

/** どのセル種別にどの誤り種別が適用できるか */
function applicableTypes(kind: SfColKind): SfErrorType[] {
  switch (kind) {
    case 'code':
      return ['digit_diff', 'digit_swap', 'width_error'];
    case 'name':
      return ['kana_diff', 'similar_kanji'];
    case 'qty':
      return ['digit_diff', 'digit_swap', 'width_error'];
    case 'amount':
      return ['digit_diff', 'digit_swap', 'width_error'];
  }
}

export function generateSearchFix(level: number, rng: RNG): SearchFixProblem {
  const lv = Math.max(1, Math.min(10, Math.round(level)));
  const cfg = LV[lv - 1];
  const columns = cfg.cols.map((k) => ALL_COLS[k]);

  // 原本
  const original: string[][] = [];
  for (let r = 0; r < cfg.rows; r++) {
    original.push(columns.map((col) => genCell(col.kind, rng)));
  }

  // 修正対象（最初は原本のコピー）と誤りの埋め込み
  const presented = original.map((row) => [...row]);
  const errors: SfCellError[] = [];
  const usedCells = new Set<string>();
  const totalCells = cfg.rows * columns.length;
  let attempts = 0;
  while (errors.length < cfg.errors && attempts < totalCells * 6) {
    attempts++;
    const r = randInt(rng, 0, cfg.rows - 1);
    const c = randInt(rng, 0, columns.length - 1);
    const key = `${r},${c}`;
    if (usedCells.has(key)) continue;
    const kind = columns[c].kind;
    // レベルで許可された型 ∩ セル種別で適用可能な型
    const candidates = cfg.types.filter((t) => applicableTypes(kind).includes(t));
    if (candidates.length === 0) continue;
    // 適用できる型を順に試す
    let placed = false;
    for (const type of shuffle(candidates, rng)) {
      const corrupted = applyError(original[r][c], type, rng);
      if (corrupted != null && corrupted !== original[r][c]) {
        presented[r][c] = corrupted;
        errors.push({ r, c, type });
        usedCells.add(key);
        placed = true;
        break;
      }
    }
    if (!placed) usedCells.add(key); // このセルは諦める
  }

  return { level: lv, columns, original, presented, errors };
}

function shuffle<T>(arr: T[], rng: RNG): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 1問あたりの標準所要時間の目安（秒） */
export function searchfixStdSeconds(level: number): number {
  const cfg = LV[Math.max(1, Math.min(10, level)) - 1];
  // 1セルの走査をおよそ0.9秒、誤り修正に1件8秒と見積もる
  return Math.round(cfg.rows * cfg.cols.length * 0.9 + cfg.errors * 8);
}
