import type { TrialLog } from '../../types';
import type { TaskModule } from '../taskModule';
import { generateNumeric, numericStdSeconds, NUMERIC_LEVEL_SUMMARIES } from './generator';
import type { NumericProblem } from './generator';
import { scoreNumeric } from './score';
import type { NumericFieldResult } from './score';
import { NumericTask } from './NumericTask';

export const NumericModule: TaskModule<NumericProblem, string[]> = {
  type: 'numeric',
  name: '数値入力',
  shortDesc: '画面の伝票に書かれた数値を、そのとおりに入力する課題です。',
  maxLevel: 10,
  levelSummaries: NUMERIC_LEVEL_SUMMARIES,
  stdSeconds: numericStdSeconds,
  instructions: [
    '上の「伝票」に書かれている数字を、下の入力欄にそのまま入力します。',
    'カンマ（,）やハイフン（-）、小数点（.）も、表示のとおりに入力してください。',
    '日本語入力（IME）はオフにして、半角で入力してください。',
    '入力できたら Enter キーを押すと、次の欄に進みます。最後の欄で Enter を押すと確定します。',
    'まちがえても大丈夫です。あせらず、自分のペースで進めてください。',
  ],
  generate: generateNumeric,
  score: scoreNumeric,
  renderTrialDetail: (trial: TrialLog) => {
    const d = trial.detail as { fields?: NumericFieldResult[] } | undefined;
    if (!d?.fields) return '';
    return d.fields
      .filter((f) => !f.correct)
      .map((f) => `${f.label}: 正「${f.expected}」→ 入力「${f.actual || '（空欄）'}」`)
      .join(' ／ ');
  },
  Component: NumericTask,
};
