import type { SessionRecord, TrialLog } from '../types';
import { TASK_NAMES, STATUS_LABELS } from '../constants';

function csvCell(v: unknown): string {
  let s = String(v ?? '');
  // Excelが数式として実行するのを防ぐ（CSVインジェクション対策）
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * 利用者ID用のセル。数字とハイフン等だけのID（例: 007 や 1-1）は
 * Excelが「7」や「1月1日」に勝手に変換するため、文字列扱いを強制する。
 */
function csvId(id: string): string {
  return /^[\d\-/.]+$/.test(id) ? `="${id}"` : csvCell(id);
}

/** CSV用の日時表記（日本時間・読み間違いのないローカル形式） */
function fmtDateTimeCsv(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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
  // 利用者ID列のみ csvId（="…" による文字列強制があるため、二重エスケープを避けて列ごとに処理）
  return [
    csvCell(s.id),
    csvId(s.userId),
    csvCell(TASK_NAMES[s.taskType]),
    csvCell(s.levelMode === 'fixed' ? `固定L${s.plan.fixedLevel ?? ''}` : '適応'),
    csvCell(fmtDateTimeCsv(s.startedAt)),
    csvCell(STATUS_LABELS[s.status] ?? s.status),
    csvCell(practice ? 1 : 0),
    csvCell(t.index + 1),
    csvCell(t.level),
    csvCell((t.presentedAtMs / 1000).toFixed(1)),
    csvCell((t.answeredAtMs / 1000).toFixed(1)),
    csvCell((t.durationMs / 1000).toFixed(2)),
    csvCell(t.correct ? 1 : 0),
    csvCell(t.errorTypes.join('|')),
    csvCell(t.editCount),
  ].join(',');
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
