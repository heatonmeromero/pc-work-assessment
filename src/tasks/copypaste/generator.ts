// コピー＆ペースト課題の問題生成（レベル1〜10）
// ・左に元データ（リスト or 表）、右に貼り付け先フォーム。
// ・レベルが上がると：対象が長く・複数になる／表から該当セルを探す必要が出る／
//   貼り付け先の順序が元と異なる（並べ替え）／コピペの段取りが増える。
// ・全セルの値は問題内で一意にする（「取り違え」検出と指示の一意性のため）。

import type { RNG } from '../../engine/rng';
import { pick, randInt } from '../../engine/rng';

export interface CpTarget {
  label: string;
  expected: string;
}

export interface CpProblem {
  level: number;
  mode: 'list' | 'table';
  listItems?: { label: string; value: string }[];
  columns?: string[];
  rows?: string[][];
  targets: CpTarget[];
}

const NAME_POOL = [
  '木製トレー',
  '大型クリップ',
  '名刺ホルダー',
  '万年筆',
  '検品シート',
  '緑色ファイル',
  '帳簿ノート',
  '太字マーカー',
  '両面テープ',
  '油性ペン',
  '卓上ライト',
  '包装テープ',
  '保存ボックス',
  '付せんセット',
  '蛍光ペン',
  'クリアファイル',
];

const NOTE_POOL = [
  '金曜日までに納品予定です',
  '在庫を確認してから発送します',
  '午前中の配達を希望します',
  '数量に変更の可能性があります',
  '取り扱いに注意してください',
  '次回の発注分と同梱します',
  '検品後に倉庫へ移します',
  '担当者の確認待ちです',
  '箱のサイズを確認してください',
  '先方からの連絡待ちです',
  '月末にまとめて請求します',
  '予備を2つ追加してください',
  '古い在庫から先に使います',
  '納品書を同封してください',
  'ラベルの貼りなおしが必要です',
  '集荷は午後3時の予定です',
];

const DEPT_POOL = ['総務課', '経理課', '営業課', '製造課'];
const CODE_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

function shuffle<T>(arr: readonly T[], rng: RNG): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function addCommas(n: number): string {
  return n.toLocaleString('en-US');
}

// ---- レベル設定 ----

interface CpLvCfg {
  mode: 'list' | 'table';
  items?: number;
  rows?: number;
  cols?: string[];
  targets: number;
  scramble: boolean;
  similarCodes?: boolean;
}

const LV: CpLvCfg[] = [
  { mode: 'list', items: 3, targets: 1, scramble: false }, // L1
  { mode: 'list', items: 4, targets: 2, scramble: false }, // L2
  { mode: 'list', items: 6, targets: 3, scramble: false }, // L3
  { mode: 'table', rows: 4, cols: ['品名', 'コード', '数量'], targets: 3, scramble: false }, // L4
  { mode: 'table', rows: 6, cols: ['品名', 'コード', '数量'], targets: 4, scramble: false }, // L5
  { mode: 'table', rows: 6, cols: ['品名', 'コード', '数量', '金額'], targets: 4, scramble: true }, // L6
  { mode: 'table', rows: 8, cols: ['品名', 'コード', '数量', '金額'], targets: 5, scramble: true }, // L7
  { mode: 'table', rows: 10, cols: ['品名', 'コード', '金額', '備考'], targets: 5, scramble: true }, // L8
  { mode: 'table', rows: 12, cols: ['品名', 'コード', '数量', '金額', '備考'], targets: 6, scramble: true }, // L9
  { mode: 'table', rows: 14, cols: ['品名', 'コード', '数量', '金額', '備考'], targets: 7, scramble: true, similarCodes: true }, // L10
];

export const COPYPASTE_LEVEL_SUMMARIES = [
  'リストから1項目をコピー',
  'リストから2項目をコピー',
  'リストから3項目をコピー',
  '表（4行）から3か所を探してコピー',
  '表（6行）から4か所をコピー',
  '表（6行）・貼り付け先の順序が元と異なる',
  '表（8行）から5か所・順序ちがい',
  '表（10行）・長い備考文のコピーが混ざる',
  '表（12行・5列）から6か所・順序ちがい',
  '表（14行）・似たコードが多く探す負荷が高い',
];

const LIST_LABELS = ['注文番号', '商品コード', '数量', '金額', '受付日', '担当部署'] as const;

function listValue(label: string, rng: RNG): string {
  switch (label) {
    case '注文番号':
      return String(randInt(rng, 10000000, 99999999));
    case '商品コード':
      return `${pick(rng, [...CODE_LETTERS])}${pick(rng, [...CODE_LETTERS])}-${randInt(rng, 1000, 9999)}`;
    case '数量':
      return String(randInt(rng, 1, 999));
    case '金額':
      return addCommas(randInt(rng, 100, 999999));
    case '受付日':
      return `${randInt(rng, 1, 12)}月${randInt(rng, 1, 28)}日`;
    case '担当部署':
      return pick(rng, DEPT_POOL);
    default:
      return String(randInt(rng, 100, 999));
  }
}

function uniqueValue(gen: () => string, used: Set<string>): string {
  let v = gen();
  for (let i = 0; i < 40 && used.has(v); i++) v = gen();
  used.add(v);
  return v;
}

export function generateCopyPaste(level: number, rng: RNG): CpProblem {
  const lv = Math.max(1, Math.min(10, Math.round(level)));
  const cfg = LV[lv - 1];
  const used = new Set<string>();

  if (cfg.mode === 'list') {
    const labels = LIST_LABELS.slice(0, cfg.items!);
    const listItems = labels.map((label) => ({
      label,
      value: uniqueValue(() => listValue(label, rng), used),
    }));
    // 出題対象をランダムに選ぶ（表示順は維持）
    const idxs = shuffle(listItems.map((_, i) => i), rng).slice(0, cfg.targets).sort((a, b) => a - b);
    const targets = idxs.map((i) => ({ label: listItems[i].label, expected: listItems[i].value }));
    return { level: lv, mode: 'list', listItems, targets };
  }

  // 表モード
  const columns = cfg.cols!;
  const names = shuffle(NAME_POOL, rng).slice(0, cfg.rows!);
  const notes = shuffle(NOTE_POOL, rng);
  // L10は似たコードで探す負荷を上げる（同じ英字プレフィックス＋近い数字）
  const codePrefix = `${pick(rng, [...CODE_LETTERS])}${pick(rng, [...CODE_LETTERS])}`;

  const cellValue = (col: string, r: number): string => {
    switch (col) {
      case '品名':
        return names[r];
      case 'コード':
        return cfg.similarCodes
          ? `${codePrefix}-${randInt(rng, 1000, 9999)}`
          : `${pick(rng, [...CODE_LETTERS])}${pick(rng, [...CODE_LETTERS])}-${randInt(rng, 1000, 9999)}`;
      case '数量':
        return String(randInt(rng, 1, 999));
      case '金額':
        return addCommas(randInt(rng, 100, 999999));
      case '備考':
        return notes[r % notes.length];
      default:
        return String(randInt(rng, 100, 999));
    }
  };

  const rows: string[][] = [];
  for (let r = 0; r < cfg.rows!; r++) {
    rows.push(
      columns.map((col) =>
        col === '品名' || col === '備考' ? cellValue(col, r) : uniqueValue(() => cellValue(col, r), used)
      )
    );
  }

  // 出題セル：品名以外の列から、行の重複を避けて選ぶ
  const candidates: { r: number; c: number }[] = [];
  for (let r = 0; r < cfg.rows!; r++) {
    for (let c = 0; c < columns.length; c++) {
      if (columns[c] !== '品名') candidates.push({ r, c });
    }
  }
  const chosen: { r: number; c: number }[] = [];
  const usedRows = new Set<number>();
  for (const cell of shuffle(candidates, rng)) {
    if (chosen.length >= cfg.targets) break;
    if (usedRows.has(cell.r) && cfg.rows! >= cfg.targets) continue;
    usedRows.add(cell.r);
    chosen.push(cell);
  }
  chosen.sort((a, b) => a.r - b.r || a.c - b.c); // 元の順

  let order = chosen;
  if (cfg.scramble && chosen.length > 1) {
    order = shuffle(chosen, rng);
    // 偶然元の順になったら1つずらす
    if (order.every((v, i) => v === chosen[i])) order = [...order.slice(1), order[0]];
  }

  const targets = order.map(({ r, c }) => ({
    label: `「${rows[r][0]}」の${columns[c]}`,
    expected: rows[r][c],
  }));

  return { level: lv, mode: 'table', columns, rows, targets };
}

/** 問題内の全データ値（取り違え検出用） */
export function allSourceValues(problem: CpProblem): string[] {
  if (problem.mode === 'list') return (problem.listItems ?? []).map((i) => i.value);
  return (problem.rows ?? []).flat();
}

/** 1問あたりの標準所要時間の目安（秒） */
export function copypasteStdSeconds(level: number): number {
  const cfg = LV[Math.max(1, Math.min(10, level)) - 1];
  return Math.round(cfg.targets * (9 + level * 1.2) + 5);
}
