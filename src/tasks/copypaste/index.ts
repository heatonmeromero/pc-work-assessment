import type { TrialLog } from '../../types';
import type { TaskModule } from '../taskModule';
import { generateCopyPaste, copypasteStdSeconds, COPYPASTE_LEVEL_SUMMARIES } from './generator';
import type { CpProblem } from './generator';
import { scoreCopyPaste } from './score';
import type { CpAnswer, CpDetail } from './score';
import { CopyPasteTask } from './CopyPasteTask';

function cut(s: string, n = 20): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export const CopyPasteModule: TaskModule<CpProblem, CpAnswer> = {
  type: 'copypaste',
  name: 'コピー＆ペースト',
  shortDesc: '元データから指定された項目を選択してコピーし、右の欄に貼り付ける課題です。',
  maxLevel: 10,
  levelSummaries: COPYPASTE_LEVEL_SUMMARIES,
  stdSeconds: copypasteStdSeconds,
  instructions: [
    '左の「元データ」から、右の欄に指定された項目をさがします。',
    '文字をマウスでなぞって選択し、コピーします（Ctrl+C、または右クリック→コピー）。',
    '右の欄をクリックして、貼り付けます（Ctrl+V、または右クリック→貼り付け）。',
    'すべての欄に入れたら「次へ」を押します。',
    '手で打ち直すのではなく、コピーと貼り付けを使ってみましょう。',
  ],
  generate: generateCopyPaste,
  score: scoreCopyPaste,
  renderTrialDetail: (trial: TrialLog) => {
    const d = trial.detail as CpDetail | undefined;
    if (!d) return '';
    const wrong = d.fields
      .filter((f) => !f.correct)
      .map((f) => `${f.label}: 正「${cut(f.expected)}」→ 入「${cut(f.actual || '（空欄）')}」`);
    const opsNote = `コピー${d.ops.copies}回・貼り付け${d.ops.pastes}回`;
    return wrong.length > 0 ? `${wrong.join(' ／ ')}（${opsNote}）` : opsNote;
  },
  extraStats: (trials: TrialLog[]) => {
    let copies = 0;
    let pastes = 0;
    let kb = 0;
    let wrongPastes = 0;
    let manual = 0;
    let selections = 0;
    for (const t of trials) {
      const d = t.detail as CpDetail | undefined;
      if (!d?.ops) continue;
      copies += d.ops.copies;
      pastes += d.ops.pastes;
      kb += d.ops.copyKeyboard + d.ops.pasteKeyboard;
      wrongPastes += d.ops.wrongPastes;
      manual += d.ops.manualKeystrokes;
      selections += d.ops.selections;
    }
    const total = copies + pastes;
    return [
      {
        label: 'ショートカット利用（Ctrl+C/V）',
        value: total === 0 ? '-' : `${Math.round((kb / total) * 100)}%（${kb}/${total}回）`,
        accent: true,
      },
      { label: '選択 → コピー → 貼り付け', value: `${selections}回 → ${copies}回 → ${pastes}回` },
      { label: '貼り間違い・やり直し', value: `${wrongPastes}回` },
      { label: '手入力したキー数', value: `${manual}回` },
    ];
  },
  Component: CopyPasteTask,
};
