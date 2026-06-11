import type { SessionRecord, TrialLog } from '../types';
import { TASK_NAMES, STATUS_LABELS } from '../constants';

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function dateStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const CSV_HEADER = [
  'セッションID',
  '利用者ID',
  '種目',
  'レベル制御',
  'セッション開始',
  '状態',
  '練習',
  '問題番号',
  'レベル',
  '提示(秒)',
  '確定(秒)',
  '所要(秒)',
  '正誤',
  'エラー分類',
  '修正回数',
];

function trialRow(s: SessionRecord, t: TrialLog, practice: boolean): string {
  return [
    s.id,
    s.userId,
    TASK_NAMES[s.taskType],
    s.levelMode === 'fixed' ? `固定L${s.plan.fixedLevel ?? ''}` : '適応',
    s.startedAt,
    STATUS_LABELS[s.status] ?? s.status,
    practice ? 1 : 0,
    t.index + 1,
    t.level,
    (t.presentedAtMs / 1000).toFixed(1),
    (t.answeredAtMs / 1000).toFixed(1),
    (t.durationMs / 1000).toFixed(2),
    t.correct ? 1 : 0,
    t.errorTypes.join('|'),
    t.editCount,
  ]
    .map(csvCell)
    .join(',');
}

/** 問題ローデータCSV（Excel向けにBOM付きUTF-8） */
export function trialsToCSV(sessions: SessionRecord[]): string {
  const lines = [CSV_HEADER.join(',')];
  for (const s of sessions) {
    for (const t of s.practiceTrials ?? []) lines.push(trialRow(s, t, true));
    for (const t of s.trials) lines.push(trialRow(s, t, false));
  }
  return '\uFEFF' + lines.join('\r\n');
}

export function downloadText(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadJSON(filename: string, obj: unknown): void {
  downloadText(filename, 'application/json', JSON.stringify(obj, null, 2));
}

export function downloadCSV(filename: string, csv: string): void {
  downloadText(filename, 'text/csv;charset=utf-8', csv);
}
