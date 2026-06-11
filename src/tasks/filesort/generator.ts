// ファイル整理課題の問題生成（レベル1〜10）
// ・疑似ファイル（アイコン＋ファイル名）をルールに従ってフォルダへ分類する。
// ・レベルが上がると：ファイル数増加（5→40）、ルールの複雑化
//   （拡張子 → 年 → ゴミ箱混在 → 2階層（年×種類） → 複合条件「ただし〜」）。
// ・各ファイルに正解フォルダと判定根拠（年/種類/例外/ゴミ箱）を持たせ、
//   誤分類の傾向分析（どの条件を取り違えたか）に使う。

import type { RNG } from '../../engine/rng';
import { pick, randInt } from '../../engine/rng';

export type FsExt = 'pdf' | 'xlsx' | 'docx' | 'jpg' | 'csv';

export interface FsFolder {
  id: string;
  name: string;
  parent?: string;
  year?: number;
  extGroup?: string;
  isTrash?: boolean;
  isException?: boolean;
}

export interface FsFile {
  id: string;
  name: string;
  ext: FsExt;
  year: number;
  /** このファイルが属する種類グループ名（フォルダの extGroup と対応） */
  group: string;
  trash: boolean;
  exception: boolean;
  correctFolder: string;
}

export interface FsProblem {
  level: number;
  ruleLines: string[];
  files: FsFile[];
  folders: FsFolder[];
}

// ---- 語彙 ----

const DOC_WORDS = ['報告書', '見積書', '納品書', '会議メモ', '予定表', 'マニュアル', '議事録', '案内文'];
const SHEET_WORDS = ['在庫一覧', '名簿', '売上データ', '集計表', '当番表'];
const IMG_WORDS = ['集合写真', '商品写真', '展示ちらし', '会場の写真', '掲示ポスター'];

const EXT_FLAT_NAME: Record<FsExt, string> = {
  pdf: 'PDF',
  xlsx: 'Excel',
  docx: 'Word',
  jpg: '画像',
  csv: 'CSV',
};

const EXT_HIER_GROUP: Record<FsExt, string> = {
  pdf: '書類',
  docx: '書類',
  xlsx: '表計算',
  csv: '表計算',
  jpg: '画像',
};

function wordsFor(ext: FsExt): string[] {
  if (ext === 'jpg') return IMG_WORDS;
  if (ext === 'xlsx' || ext === 'csv') return SHEET_WORDS;
  return DOC_WORDS;
}

// ---- レベル設定 ----

type FsKind = 'ext' | 'year' | 'year_trash' | 'hier' | 'hier_trash' | 'except' | 'hier_except_trash';

interface FsLvCfg {
  files: number;
  kind: FsKind;
  exts: FsExt[];
  years: number[];
}

const LV: FsLvCfg[] = [
  { files: 5, kind: 'ext', exts: ['pdf', 'jpg'], years: [2025] }, // L1
  { files: 7, kind: 'ext', exts: ['pdf', 'xlsx', 'jpg'], years: [2025] }, // L2
  { files: 9, kind: 'ext', exts: ['pdf', 'xlsx', 'docx', 'jpg'], years: [2025] }, // L3
  { files: 10, kind: 'year', exts: ['pdf', 'xlsx', 'docx'], years: [2023, 2024, 2025] }, // L4
  { files: 12, kind: 'year_trash', exts: ['pdf', 'xlsx', 'docx'], years: [2023, 2024, 2025] }, // L5
  { files: 14, kind: 'hier', exts: ['pdf', 'docx', 'xlsx', 'jpg'], years: [2024, 2025] }, // L6
  { files: 16, kind: 'hier_trash', exts: ['pdf', 'docx', 'xlsx', 'jpg'], years: [2024, 2025] }, // L7
  { files: 20, kind: 'except', exts: ['pdf', 'xlsx', 'jpg'], years: [2024, 2025] }, // L8
  { files: 28, kind: 'hier_except_trash', exts: ['pdf', 'docx', 'xlsx', 'jpg'], years: [2024, 2025] }, // L9
  { files: 40, kind: 'hier_except_trash', exts: ['pdf', 'docx', 'xlsx', 'jpg', 'csv'], years: [2023, 2024, 2025] }, // L10
];

export const FILESORT_LEVEL_SUMMARIES = [
  '5個・2種類のファイルを種類で分ける',
  '7個・3種類を種類で分ける',
  '9個・4種類を種類で分ける',
  '10個を名前の年（2023〜2025）で分ける',
  '12個・年で分ける＋不要ファイルはゴミ箱へ',
  '14個・2階層（年→種類）に分ける',
  '16個・2階層＋ゴミ箱',
  '20個・例外条件つき（「ただし請求を含むPDFは…」）',
  '28個・2階層＋例外＋ゴミ箱',
  '40個・2階層＋例外＋ゴミ箱（最大の分量）',
];

const hasTrash = (k: FsKind) => k === 'year_trash' || k === 'hier_trash' || k === 'hier_except_trash';
const hasExcept = (k: FsKind) => k === 'except' || k === 'hier_except_trash';
const isHier = (k: FsKind) => k === 'hier' || k === 'hier_trash' || k === 'hier_except_trash';

// ---- フォルダとルール文の構築 ----

function buildFolders(cfg: FsLvCfg): { folders: FsFolder[]; ruleLines: string[] } {
  const folders: FsFolder[] = [];
  const ruleLines: string[] = [];
  const kind = cfg.kind;

  if (kind === 'ext') {
    for (const ext of cfg.exts) {
      const name = EXT_FLAT_NAME[ext];
      folders.push({ id: `f-${ext}`, name, extGroup: name });
    }
    ruleLines.push(
      `ファイルの種類で分けます：${cfg.exts.map((e) => `${e} は「${EXT_FLAT_NAME[e]}」へ`).join('、')}。`
    );
  } else if (kind === 'year' || kind === 'year_trash') {
    for (const y of cfg.years) {
      folders.push({ id: `f-${y}`, name: `${y}年`, year: y });
    }
    ruleLines.push(`ファイル名にある年で分けます（${cfg.years.map((y) => `${y}年のものは「${y}年」へ`).join('、')}）。`);
  } else if (isHier(kind)) {
    const groups = [...new Set(cfg.exts.map((e) => EXT_HIER_GROUP[e]))];
    for (const y of cfg.years) {
      folders.push({ id: `p-${y}`, name: `${y}年`, year: y });
      for (const g of groups) {
        folders.push({ id: `f-${y}-${g}`, name: g, parent: `p-${y}`, year: y, extGroup: g });
      }
    }
    ruleLines.push(`まずファイル名の年のフォルダを選び、その中の種類のフォルダへ入れます。`);
    ruleLines.push(
      `種類の分けかた：${cfg.exts.map((e) => `${e} は「${EXT_HIER_GROUP[e]}」`).join('、')}。`
    );
  } else if (kind === 'except') {
    folders.push({ id: 'f-doc', name: '書類', extGroup: 'PDF' });
    folders.push({ id: 'f-keiri', name: '経理', isException: true });
    folders.push({ id: 'f-data', name: 'データ', extGroup: 'Excel' });
    folders.push({ id: 'f-img', name: '画像', extGroup: '画像' });
    ruleLines.push('pdf は「書類」、xlsx は「データ」、jpg は「画像」へ入れます。');
    ruleLines.push('ただし、名前に「請求」とつく pdf だけは「経理」へ入れます。');
  }

  if (hasExcept(kind) && isHier(kind)) {
    folders.push({ id: 'f-keiri', name: '経理', isException: true });
    ruleLines.push('ただし、名前に「請求」とつく pdf だけは、年に関係なく「経理」へ入れます。');
  }
  if (hasTrash(kind)) {
    folders.push({ id: 'f-trash', name: 'ゴミ箱', isTrash: true });
    ruleLines.push('名前に「コピー」または「不要」とつくファイルは「ゴミ箱」へ入れます。');
  }
  return { folders, ruleLines };
}

/** ファイルの正解フォルダを決める（生成と採点で同じ規則） */
function resolveFolder(file: { ext: FsExt; year: number; trash: boolean; exception: boolean }, cfg: FsLvCfg, folders: FsFolder[]): string {
  if (file.trash) return 'f-trash';
  if (file.exception) return 'f-keiri';
  if (isHier(cfg.kind)) {
    const g = EXT_HIER_GROUP[file.ext];
    return `f-${file.year}-${g}`;
  }
  if (cfg.kind === 'year' || cfg.kind === 'year_trash') return `f-${file.year}`;
  if (cfg.kind === 'except') {
    if (file.ext === 'pdf') return 'f-doc';
    if (file.ext === 'xlsx') return 'f-data';
    return 'f-img';
  }
  return `f-${file.ext}`; // ext
}

export function generateFileSort(level: number, rng: RNG): FsProblem {
  const lv = Math.max(1, Math.min(10, Math.round(level)));
  const cfg = LV[lv - 1];
  const { folders, ruleLines } = buildFolders(cfg);

  const trashCount = hasTrash(cfg.kind) ? Math.max(2, Math.round(cfg.files / 7)) : 0;
  const exceptCount = hasExcept(cfg.kind) ? Math.max(2, Math.round(cfg.files / 8)) : 0;
  // 例外ルールのひっかけ：「請求」とつくが pdf ではないファイル
  const decoyCount = hasExcept(cfg.kind) ? 1 : 0;

  const usedNames = new Set<string>();
  const files: FsFile[] = [];

  const makeName = (word: string, year: number, ext: FsExt, marker: '' | 'コピー' | '不要'): string => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const month = randInt(rng, 1, 12);
      let base = `${word}_${year}年${month}月`;
      if (marker === 'コピー') base += '_コピー';
      if (marker === '不要') base = `不要_${base}`;
      const name = `${base}.${ext}`;
      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
    }
    const name = `${word}_${year}年_${files.length + 1}.${ext}`;
    usedNames.add(name);
    return name;
  };

  for (let i = 0; i < cfg.files; i++) {
    const isTrashFile = i < trashCount;
    const isExceptFile = !isTrashFile && i < trashCount + exceptCount;
    const isDecoy = !isTrashFile && !isExceptFile && i < trashCount + exceptCount + decoyCount;

    let ext: FsExt;
    let word: string;
    if (isExceptFile) {
      ext = 'pdf';
      word = '請求書';
    } else if (isDecoy) {
      ext = cfg.exts.includes('xlsx') ? 'xlsx' : pick(rng, cfg.exts.filter((e) => e !== 'pdf'));
      word = '請求一覧';
    } else {
      ext = pick(rng, cfg.exts);
      word = pick(rng, wordsFor(ext));
    }
    const year = pick(rng, cfg.years);
    const marker = isTrashFile ? (rng() < 0.5 ? 'コピー' : '不要') : '';
    const file = {
      id: `file-${i}`,
      name: makeName(word, year, ext, marker as '' | 'コピー' | '不要'),
      ext,
      year,
      group: isHier(cfg.kind) ? EXT_HIER_GROUP[ext] : EXT_FLAT_NAME[ext],
      trash: isTrashFile,
      exception: isExceptFile,
      correctFolder: '',
    };
    file.correctFolder = resolveFolder(file, cfg, folders);
    files.push(file);
  }

  // 表示順をシャッフル（ゴミ箱・例外ファイルが先頭に固まらないように）
  for (let i = files.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [files[i], files[j]] = [files[j], files[i]];
  }

  return { level: lv, ruleLines, files, folders };
}

/** 1問あたりの標準所要時間の目安（秒） */
export function filesortStdSeconds(level: number): number {
  const cfg = LV[Math.max(1, Math.min(10, level)) - 1];
  return Math.round(15 + cfg.files * (3.5 + 0.25 * level));
}
