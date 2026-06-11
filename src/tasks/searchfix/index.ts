import type { TrialLog } from '../../types';
import type { TaskModule } from '../taskModule';
import { generateSearchFix, searchfixStdSeconds, SEARCHFIX_LEVEL_SUMMARIES } from './generator';
import type { SearchFixProblem } from './generator';
import { scoreSearchFix } from './score';
import type { SearchFixDetail } from './score';
import { SearchFixTask } from './SearchFixTask';

export const SearchFixModule: TaskModule<SearchFixProblem, string[][]> = {
  type: 'searchfix',
  name: '検索修正',
  shortDesc: '原本と見くらべて、誤りを含むデータの相違箇所を見つけて直す課題です。',
  maxLevel: 10,
  levelSummaries: SEARCHFIX_LEVEL_SUMMARIES,
  stdSeconds: searchfixStdSeconds,
  instructions: [
    '左の「原本」が正しいデータ、右の「修正対象」が誤りを含むデータです。',
    '同じ行どうしを見くらべて、ちがっている箇所を右側だけ直してください。',
    '直すと、そのマスに色がつきます。直しすぎ（正しい所を変える）にも気をつけてください。',
    'すべて直せたと思ったら「確認する」を押します。',
    'あせらず、左右をよく見くらべてください。',
  ],
  generate: generateSearchFix,
  score: scoreSearchFix,
  renderTrialDetail: (trial: TrialLog) => {
    const d = trial.detail as SearchFixDetail | undefined;
    if (!d) return '';
    const parts = [`誤り${d.embedded}件中 ${d.fixedCorrect}件を正しく修正`];
    if (d.missed > 0) parts.push(`見逃し${d.missed}`);
    if (d.fixedWrong > 0) parts.push(`直したが不正確${d.fixedWrong}`);
    if (d.falseDetect > 0) parts.push(`誤検出${d.falseDetect}`);
    return parts.join(' ／ ');
  },
  extraStats: (trials: TrialLog[]) => {
    let embedded = 0;
    let fixedCorrect = 0;
    let falseDetect = 0;
    let missed = 0;
    for (const t of trials) {
      const d = t.detail as SearchFixDetail | undefined;
      if (!d) continue;
      embedded += d.embedded;
      fixedCorrect += d.fixedCorrect;
      falseDetect += d.falseDetect;
      missed += d.missed;
    }
    const rate = embedded === 0 ? '-' : `${Math.round((fixedCorrect / embedded) * 100)}%`;
    return [
      { label: '誤りの発見・修正率', value: `${rate}（${fixedCorrect}/${embedded}件）`, accent: true },
      { label: '見逃し', value: `${missed}件` },
      { label: '誤検出（正しい所を変更）', value: `${falseDetect}件` },
    ];
  },
  Component: SearchFixTask,
};
