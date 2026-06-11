import type { TaskType } from '../types';
import type { TaskModule } from './taskModule';
import { NumericModule } from './numeric';
import { TextModule } from './text';
import { SearchFixModule } from './searchfix';
import { CopyPasteModule } from './copypaste';
import { FileSortModule } from './filesort';

/** 実装済み種目のレジストリ（全5種目） */
export const TASKS: Partial<Record<TaskType, TaskModule<any, any>>> = {
  numeric: NumericModule,
  text: TextModule,
  copypaste: CopyPasteModule,
  searchfix: SearchFixModule,
  filesort: FileSortModule,
};

export function getTask(type: TaskType): TaskModule<any, any> | undefined {
  return TASKS[type];
}

/**
 * 総合アセスメントの時間配分。
 * 種目×レベル別の標準時間（stdSeconds）に比例して合計時間を配分し、
 * どの種目もおおむね同じ問題数に取り組めるようにする（10秒単位・最低30秒）。
 */
export function allocateAssessmentTime(
  totalSec: number,
  tasks: TaskType[],
  level: number
): Record<string, number> {
  const MIN_SEC = 30;
  const weights = tasks.map((t) => TASKS[t]?.stdSeconds(level) ?? 30);
  const sum = weights.reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  tasks.forEach((t, i) => {
    out[t] = Math.max(MIN_SEC, Math.round((totalSec * weights[i]) / sum / 10) * 10);
  });
  return out;
}
