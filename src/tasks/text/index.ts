import type { TrialLog } from '../../types';
import type { TaskModule } from '../taskModule';
import { generateText, textStdSeconds, TEXT_LEVEL_SUMMARIES } from './generator';
import type { TextProblem } from './generator';
import { scoreText } from './score';
import type { TextScoreDetail } from './score';
import { TextTask } from './TextTask';

function cut(s: string, n = 42): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export const TextModule: TaskModule<TextProblem, string> = {
  type: 'text',
  name: '文書入力',
  shortDesc: '表示された文章を、そのとおりに入力する課題です（日本語入力を使います）。',
  maxLevel: 10,
  levelSummaries: TEXT_LEVEL_SUMMARIES,
  stdSeconds: textStdSeconds,
  instructions: [
    '上に表示された文章を、下の入力欄にそのまま入力します。',
    '漢字・カタカナ・数字・記号も、表示のとおりに入力してください。',
    '日本語入力（IME）を使ってかまいません。',
    '入力できたら Enter キーか「次へ」ボタンで確定します（漢字変換中の Enter は確定になりません）。',
    'まちがえても大丈夫です。あせらず、自分のペースで進めてください。',
  ],
  generate: generateText,
  score: scoreText,
  renderTrialDetail: (trial: TrialLog) => {
    const d = trial.detail as TextScoreDetail | undefined;
    if (!d?.expected) return '';
    return `相違 約${d.diffCount}文字 ／ 正「${cut(d.expected)}」→ 入力「${cut(d.actual || '（空欄）')}」`;
  },
  Component: TextTask,
};
