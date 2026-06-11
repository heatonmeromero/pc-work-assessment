// 数値入力の採点とエラー分類
// 分類コード: similar_confusion / substitution / omission / insertion /
//             transposition / symbol_error / field_swap

import { editOps } from '../../engine/diff';
import type { TrialScore } from '../../types';
import type { NumericProblem } from './generator';

const SIMILAR_PAIRS = [
  ['1', '7'],
  ['0', '8'],
  ['3', '8'],
  ['6', '9'],
];

function isSimilarPair(a: string, b: string): boolean {
  return SIMILAR_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

function isSymbol(c: string): boolean {
  return c === ',' || c === '.' || c === '-';
}

/** 全角数字・記号・空白を半角に正規化（IMEがオンでも値として判定できるように） */
export function normalizeInput(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/，/g, ',')
    .replace(/．/g, '.')
    .replace(/[ー－‐−–—]/g, '-')
    .replace(/[\s　]/g, '');
}

export interface NumericFieldResult {
  label: string;
  expected: string;
  actual: string;
  correct: boolean;
  errors: string[];
}

function classifyField(expected: string, actual: string): string[] {
  const ops = editOps(expected, actual);
  const codes = new Set<string>();
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    const next = ops[k + 1];
    // となり合う2文字の入れかわり（sub×2 で互いに交換）を1つの transposition に
    if (
      op.op === 'sub' &&
      next &&
      next.op === 'sub' &&
      next.i === op.i + 1 &&
      op.a === next.b &&
      op.b === next.a
    ) {
      codes.add('transposition');
      k++;
      continue;
    }
    if (op.op === 'sub') {
      if (isSymbol(op.a) || isSymbol(op.b)) codes.add('symbol_error');
      else if (isSimilarPair(op.a, op.b)) codes.add('similar_confusion');
      else codes.add('substitution');
    } else if (op.op === 'del') {
      codes.add(isSymbol(op.a) ? 'symbol_error' : 'omission');
    } else {
      codes.add(isSymbol(op.b) ? 'symbol_error' : 'insertion');
    }
  }
  return [...codes];
}

export function scoreNumeric(problem: NumericProblem, answer: string[]): TrialScore {
  const flat = problem.rows.flat();
  const multiRow = problem.rows.length > 1;
  const fields: NumericFieldResult[] = [];
  const allErrors = new Set<string>();

  for (let i = 0; i < flat.length; i++) {
    const f = flat[i];
    const rowIdx = Math.floor(i / problem.rows[0].length);
    const label = multiRow ? `${rowIdx + 1}行目 ${f.label}` : f.label;
    const actual = normalizeInput(answer[i] ?? '');
    if (actual === f.value) {
      fields.push({ label, expected: f.value, actual, correct: true, errors: [] });
      continue;
    }
    // 項目取りちがえ：別項目の値と完全一致
    const swapped = flat.some((other, j) => j !== i && other.value === actual);
    const errors = swapped ? ['field_swap'] : classifyField(f.value, actual);
    errors.forEach((e) => allErrors.add(e));
    fields.push({ label, expected: f.value, actual, correct: false, errors });
  }

  return {
    correct: fields.every((f) => f.correct),
    errorTypes: [...allErrors],
    detail: { fields },
  };
}
