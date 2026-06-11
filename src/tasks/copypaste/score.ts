// コピー＆ペーストの採点とエラー分類
//
// 欄ごとの判定:
//   一致 → 正解
//   空欄 → empty_field
//   別のセル値と一致 → copy_wrong_item（取り違え）
//   期待値の部分文字列／期待値を含む → copy_partial（選択範囲の過不足）
//   それ以外 → input_mismatch（手入力の誤りなど）
//
// 操作ログ（UI側で収集し answer.ops で受け取る）:
//   選択回数・コピー回数・貼り付け回数・ショートカット/メニューの別・
//   貼り間違い回数・手入力キー数 → 操作習熟の評価材料として detail に保存。

import type { TrialScore } from '../../types';
import { allSourceValues } from './generator';
import type { CpProblem } from './generator';

export interface CpOps {
  selections: number;
  copies: number;
  copyKeyboard: number;
  copyMenu: number;
  pastes: number;
  pasteKeyboard: number;
  pasteMenu: number;
  wrongPastes: number;
  manualKeystrokes: number;
}

export function emptyOps(): CpOps {
  return {
    selections: 0,
    copies: 0,
    copyKeyboard: 0,
    copyMenu: 0,
    pastes: 0,
    pasteKeyboard: 0,
    pasteMenu: 0,
    wrongPastes: 0,
    manualKeystrokes: 0,
  };
}

export interface CpAnswer {
  values: string[];
  ops: CpOps;
}

export interface CpFieldResult {
  label: string;
  expected: string;
  actual: string;
  correct: boolean;
  errors: string[];
}

export interface CpDetail {
  fields: CpFieldResult[];
  ops: CpOps;
}

export function normalizeCp(s: string): string {
  return (s ?? '').replace(/\u200b/g, '').replace(/^[\s　]+|[\s　]+$/g, '');
}

export function scoreCopyPaste(problem: CpProblem, answer: CpAnswer): TrialScore {
  const sourceValues = allSourceValues(problem);
  const values = answer?.values ?? [];
  const ops = answer?.ops ?? emptyOps();
  const fields: CpFieldResult[] = [];
  const codes = new Set<string>();

  problem.targets.forEach((target, i) => {
    const actual = normalizeCp(values[i] ?? '');
    const expected = target.expected;
    let errors: string[] = [];
    if (actual !== expected) {
      if (actual === '') errors = ['empty_field'];
      else if (sourceValues.includes(actual)) errors = ['copy_wrong_item'];
      else if (actual.includes(expected) || expected.includes(actual)) errors = ['copy_partial'];
      else errors = ['input_mismatch'];
      errors.forEach((e) => codes.add(e));
    }
    fields.push({ label: target.label, expected, actual, correct: errors.length === 0, errors });
  });

  return {
    correct: fields.every((f) => f.correct),
    errorTypes: [...codes],
    detail: { fields, ops } satisfies CpDetail,
  };
}
