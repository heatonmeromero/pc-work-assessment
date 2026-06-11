import type { TrialLog } from '../../types';
import type { TaskModule } from '../taskModule';
import { generateFileSort, filesortStdSeconds, FILESORT_LEVEL_SUMMARIES } from './generator';
import type { FsProblem } from './generator';
import { scoreFileSort } from './score';
import type { FsAnswer, FsDetail } from './score';
import { FileSortTask } from './FileSortTask';

export const FileSortModule: TaskModule<FsProblem, FsAnswer> = {
  type: 'filesort',
  name: 'ファイル整理',
  shortDesc: '画面の中のファイルを、ルールに従ってフォルダへ分類する課題です（実際のパソコンのファイルは動きません）。',
  maxLevel: 10,
  levelSummaries: FILESORT_LEVEL_SUMMARIES,
  stdSeconds: filesortStdSeconds,
  instructions: [
    '画面の上に「分けかたのルール」が書いてあります。よく読んでから始めましょう。',
    '「未整理」のファイルを、フォルダへドラッグ＆ドロップで移します。',
    'ファイルをクリックで選んでから、フォルダをクリックして移すこともできます。',
    'まちがえても、フォルダから別のフォルダへ動かしなおせます。',
    '全部移したら「整理おわり」を押します。',
  ],
  generate: generateFileSort,
  score: scoreFileSort,
  renderTrialDetail: (trial: TrialLog) => {
    const d = trial.detail as FsDetail | undefined;
    if (!d) return '';
    const wrong = d.files.filter((f) => !f.ok).slice(0, 4);
    const parts = wrong.map((f) => `${f.name}: ${f.placed ?? '未分類'} → 正しくは「${f.correct}」`);
    const rest = d.files.filter((f) => !f.ok).length - wrong.length;
    return parts.join(' ／ ') + (rest > 0 ? ` ほか${rest}件` : '');
  },
  extraStats: (trials: TrialLog[]) => {
    let total = 0;
    let correct = 0;
    let unsorted = 0;
    let hesitations = 0;
    let removes = 0;
    for (const t of trials) {
      const d = t.detail as FsDetail | undefined;
      if (!d) continue;
      total += d.total;
      correct += d.correctCount;
      unsorted += d.unsorted;
      hesitations += d.ops?.hesitations ?? 0;
      removes += d.ops?.removes ?? 0;
    }
    return [
      {
        label: '分類の正答率',
        value: total === 0 ? '-' : `${Math.round((correct / total) * 100)}%（${correct}/${total}個）`,
        accent: true,
      },
      { label: '迷い（つかんで戻した）', value: `${hesitations}回` },
      { label: '置きなおし', value: `${removes}回` },
      { label: '未分類のまま', value: `${unsorted}個` },
    ];
  },
  Component: FileSortTask,
};
