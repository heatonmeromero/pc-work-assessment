// 文書入力の採点とエラー分類
// 分類コード: conversion_error（変換誤り：同じ読みの別語・未変換）/
//             substitution / omission / insertion / transposition /
//             punct_error（句読点・記号）/ width_error（全角半角）
//
// 変換誤りの検出方法：
//   見本と入力の両方を同じ手続きで「読み形」（生成辞書の語を読みに置換）にし、
//   表記は違うが読み形が一致する相違を変換誤りとみなす。
//   辞書にない同音異義語は substitution として数える（限界はREADMEに記載）。

import { editOps } from '../../engine/diff';
import type { EditOp } from '../../engine/diff';
import type { TrialScore } from '../../types';
import { toReadingForm } from './generator';
import type { TextProblem } from './generator';

const PUNCT = new Set([...'、。・（）「」『』！？：；～…,.()!?:;- 　']);

function isPunct(c: string): boolean {
  return PUNCT.has(c) || c === '\n';
}

function normWidth(c: string): string {
  const code = c.charCodeAt(0);
  if (code >= 0xff01 && code <= 0xff5e) return String.fromCharCode(code - 0xfee0);
  if (c === '　') return ' ';
  return c;
}

function classifyOps(ops: EditOp[], codes: Set<string>): void {
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    const next = ops[k + 1];
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
      if (normWidth(op.a) === normWidth(op.b)) codes.add('width_error');
      else if (isPunct(op.a) || isPunct(op.b)) codes.add('punct_error');
      else codes.add('substitution');
    } else if (op.op === 'del') {
      codes.add(isPunct(op.a) ? 'punct_error' : 'omission');
    } else {
      codes.add(isPunct(op.b) ? 'punct_error' : 'insertion');
    }
  }
}

export interface TextScoreDetail {
  expected: string;
  actual: string;
  /** 表記レベルの相違数（編集操作数） */
  diffCount: number;
  /** 読み形レベルの相違数（0なら全て変換誤り） */
  readingDiffCount: number;
}

export function scoreText(problem: TextProblem, answer: string): TrialScore {
  const expected = problem.text;
  const actual = (answer ?? '').replace(/^[\s　]+|[\s　]+$/g, '');

  if (actual === expected) {
    return {
      correct: true,
      errorTypes: [],
      detail: { expected, actual, diffCount: 0, readingDiffCount: 0 } satisfies TextScoreDetail,
    };
  }

  const surfOps = editOps(expected, actual);
  const er = toReadingForm(expected);
  const ar = toReadingForm(actual);
  const codes = new Set<string>();
  let readingDiffCount = 0;

  if (er === ar) {
    // 表記は違うが読みは一致 → 全て変換誤り（同音の別語 or 未変換）
    codes.add('conversion_error');
  } else {
    const readOps = editOps(er, ar);
    readingDiffCount = readOps.length;
    classifyOps(readOps, codes);
    // 表記の相違の一部が読み形では消える場合、変換誤りが混ざっている
    if (readOps.length < surfOps.length) codes.add('conversion_error');
  }

  return {
    correct: false,
    errorTypes: [...codes],
    detail: { expected, actual, diffCount: surfOps.length, readingDiffCount } satisfies TextScoreDetail,
  };
}
