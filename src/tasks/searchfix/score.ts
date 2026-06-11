// 検索修正の採点とエラー分類
//
// セルごとに 原本(original) / 提示値(presented) / 確定値(final) を比較する：
//   ・埋め込まれた誤り  = presented != original
//   ・正しく修正        = 誤りセルで final == original
//   ・修正したが不正確  = 誤りセルで final != presented かつ final != original
//   ・見逃し            = 誤りセルで final == presented（手をつけていない）
//   ・誤検出            = 正しいセルなのに final != original に変えてしまった
//
// 分類コード（見逃した誤りの種類＋誤検出）:
//   miss_digit / miss_kana / miss_kanji / miss_width / false_detect

import type { TrialScore } from '../../types';
import type { SearchFixProblem, SfErrorType } from './generator';

const MISS_CODE: Record<SfErrorType, string> = {
  digit_diff: 'miss_digit',
  digit_swap: 'miss_digit',
  width_error: 'miss_width',
  kana_diff: 'miss_kana',
  similar_kanji: 'miss_kanji',
};

export interface SfCellOutcome {
  r: number;
  c: number;
  side: 'left' | 'center' | 'right';
  vside: 'top' | 'middle' | 'bottom';
  kind: 'fixed' | 'fixedWrong' | 'missed' | 'falseDetect';
  type?: SfErrorType;
  original: string;
  presented: string;
  final: string;
}

export interface SearchFixDetail {
  embedded: number;
  fixedCorrect: number;
  fixedWrong: number;
  missed: number;
  falseDetect: number;
  outcomes: SfCellOutcome[];
}

function sideOf(c: number, cols: number): 'left' | 'center' | 'right' {
  if (cols <= 1) return 'center';
  if (c < cols / 3) return 'left';
  if (c >= (cols * 2) / 3) return 'right';
  return 'center';
}
function vsideOf(r: number, rows: number): 'top' | 'middle' | 'bottom' {
  if (rows <= 1) return 'middle';
  if (r < rows / 3) return 'top';
  if (r >= (rows * 2) / 3) return 'bottom';
  return 'middle';
}

export function scoreSearchFix(problem: SearchFixProblem, answer: string[][]): TrialScore {
  const { original, presented, columns } = problem;
  const rows = original.length;
  const cols = columns.length;
  const errorByCell = new Map<string, SfErrorType>();
  for (const e of problem.errors) errorByCell.set(`${e.r},${e.c}`, e.type);

  let fixedCorrect = 0;
  let fixedWrong = 0;
  let missed = 0;
  let falseDetect = 0;
  const outcomes: SfCellOutcome[] = [];
  const codes = new Set<string>();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const orig = original[r][c];
      const pres = presented[r][c];
      const fin = (answer[r]?.[c] ?? pres).replace(/^[\s　]+|[\s　]+$/g, '');
      const isError = errorByCell.has(`${r},${c}`);
      const base = { r, c, side: sideOf(c, cols), vside: vsideOf(r, rows), original: orig, presented: pres, final: fin };

      if (isError) {
        const type = errorByCell.get(`${r},${c}`)!;
        if (fin === orig) {
          fixedCorrect++;
          outcomes.push({ ...base, kind: 'fixed', type });
        } else if (fin === pres) {
          missed++;
          codes.add(MISS_CODE[type]);
          outcomes.push({ ...base, kind: 'missed', type });
        } else {
          fixedWrong++;
          codes.add(MISS_CODE[type]);
          outcomes.push({ ...base, kind: 'fixedWrong', type });
        }
      } else {
        // 正しいセル：変更されていたら誤検出
        if (fin !== orig) {
          falseDetect++;
          codes.add('false_detect');
          outcomes.push({ ...base, kind: 'falseDetect' });
        }
      }
    }
  }

  const embedded = problem.errors.length;
  const detail: SearchFixDetail = { embedded, fixedCorrect, fixedWrong, missed, falseDetect, outcomes };

  return {
    // 全ての誤りを正しく直し、かつ誤検出ゼロなら正解
    correct: fixedCorrect === embedded && falseDetect === 0,
    errorTypes: [...codes],
    detail,
  };
}
