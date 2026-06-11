// 総合アセスメントレポートの集計エンジン（純ロジック・UIに依存しない）
// 利用者の全セッションから以下を組み立てる：
//   1. 5種目プロフィール（種目別のめやすレベル）
//   2. 速度×正確性の散布図データ（標準時間比の速度指数）
//   3. 持続性（セッション前半/後半の集計比較）
//   4. 学習曲線（同種目・同レベルの反復推移）
//   5. エラー傾向（頻出エラーの集計）

import type { SessionRecord, TaskType } from '../types';

export interface TaskProfileRow {
  taskType: TaskType;
  /** めやすレベル（適応の推定値 or 固定レベルの実績） */
  estimate: number | null;
  provisional: boolean;
  source: 'adaptive' | 'fixed' | null;
  sessions: number;
  trials: number;
  accuracy: number | null; // 0-100
  avgSec: number | null;
}

export interface ScatterPoint {
  taskType: TaskType;
  startedAt: string;
  /** 平均所要時間 ÷ 標準時間（1.0=標準、小さいほど速い） */
  speedIndex: number;
  accuracy: number; // 0-100
}

export interface EnduranceSummary {
  sessionsUsed: number;
  firstAcc: number;
  secondAcc: number;
  firstSec: number;
  secondSec: number;
}

export interface LearningSeries {
  taskType: TaskType;
  level: number;
  points: { startedAt: string; accuracy: number; avgSec: number }[];
}

export interface ReportData {
  profiles: TaskProfileRow[];
  scatter: ScatterPoint[];
  endurance: EnduranceSummary | null;
  learning: LearningSeries[];
  errors: { code: string; count: number }[];
}

function accuracyOf(s: SessionRecord): number | null {
  if (s.trials.length === 0) return null;
  return (s.trials.filter((t) => t.correct).length / s.trials.length) * 100;
}

function avgSecOf(s: SessionRecord): number | null {
  if (s.trials.length === 0) return null;
  return s.trials.reduce((sum, t) => sum + t.durationMs, 0) / s.trials.length / 1000;
}

function meanLevelOf(s: SessionRecord): number {
  if (s.trials.length === 0) return s.plan.fixedLevel ?? s.plan.adaptive?.startLevel ?? 1;
  return Math.round(s.trials.reduce((sum, t) => sum + t.level, 0) / s.trials.length);
}

export function buildReport(
  allSessions: SessionRecord[],
  taskOrder: TaskType[],
  stdSecondsOf: (t: TaskType, level: number) => number
): ReportData {
  const sessions = [...allSessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  // ---- 1. 種目別プロフィール ----
  const profiles: TaskProfileRow[] = taskOrder.map((taskType) => {
    const ss = sessions.filter((s) => s.taskType === taskType);
    const trials = ss.flatMap((s) => s.trials);
    const correct = trials.filter((t) => t.correct).length;

    // めやすレベル：最新の適応セッションの推定値を優先
    let estimate: number | null = null;
    let provisional = false;
    let source: 'adaptive' | 'fixed' | null = null;
    for (let i = ss.length - 1; i >= 0; i--) {
      const est = ss[i].adaptiveResult?.estimate;
      if (est != null) {
        estimate = est;
        provisional = ss[i].adaptiveResult!.provisional;
        source = 'adaptive';
        break;
      }
    }
    if (estimate == null) {
      // 適応の記録がなければ、正答率70%以上で取り組めた固定レベルの最大値（参考値）
      let best: number | null = null;
      for (const s of ss) {
        const acc = accuracyOf(s);
        if (s.levelMode === 'fixed' && s.plan.fixedLevel != null && s.trials.length >= 5 && acc != null && acc >= 70) {
          best = Math.max(best ?? 0, s.plan.fixedLevel);
        }
      }
      if (best != null) {
        estimate = best;
        provisional = true;
        source = 'fixed';
      }
    }

    return {
      taskType,
      estimate,
      provisional,
      source,
      sessions: ss.length,
      trials: trials.length,
      accuracy: trials.length === 0 ? null : (correct / trials.length) * 100,
      avgSec: trials.length === 0 ? null : trials.reduce((s, t) => s + t.durationMs, 0) / trials.length / 1000,
    };
  });

  // ---- 2. 速度×正確性（直近30セッション） ----
  const scatter: ScatterPoint[] = sessions
    .filter((s) => s.trials.length >= 3)
    .slice(-30)
    .map((s) => {
      const std = Math.max(1, stdSecondsOf(s.taskType, meanLevelOf(s)));
      return {
        taskType: s.taskType,
        startedAt: s.startedAt,
        speedIndex: (avgSecOf(s) ?? std) / std,
        accuracy: accuracyOf(s) ?? 0,
      };
    });

  // ---- 3. 持続性（前半/後半） ----
  let used = 0;
  let fC = 0;
  let fN = 0;
  let fMs = 0;
  let sC = 0;
  let sN = 0;
  let sMs = 0;
  for (const s of sessions) {
    if (s.trials.length < 6) continue;
    used++;
    const mid = Math.floor(s.trials.length / 2);
    const first = s.trials.slice(0, mid);
    const second = s.trials.slice(mid);
    fC += first.filter((t) => t.correct).length;
    fN += first.length;
    fMs += first.reduce((sum, t) => sum + t.durationMs, 0);
    sC += second.filter((t) => t.correct).length;
    sN += second.length;
    sMs += second.reduce((sum, t) => sum + t.durationMs, 0);
  }
  const endurance: EnduranceSummary | null =
    used === 0
      ? null
      : {
          sessionsUsed: used,
          firstAcc: (fC / fN) * 100,
          secondAcc: (sC / sN) * 100,
          firstSec: fMs / fN / 1000,
          secondSec: sMs / sN / 1000,
        };

  // ---- 4. 学習曲線（同種目・同固定レベルを3回以上） ----
  const groups = new Map<string, SessionRecord[]>();
  for (const s of sessions) {
    if (s.levelMode !== 'fixed' || s.plan.fixedLevel == null || s.trials.length === 0) continue;
    const key = `${s.taskType}|${s.plan.fixedLevel}`;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }
  const learning: LearningSeries[] = [...groups.entries()]
    .filter(([, arr]) => arr.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
    .map(([key, arr]) => {
      const [taskType, level] = key.split('|');
      return {
        taskType: taskType as TaskType,
        level: Number(level),
        points: arr.map((s) => ({
          startedAt: s.startedAt,
          accuracy: accuracyOf(s) ?? 0,
          avgSec: avgSecOf(s) ?? 0,
        })),
      };
    });

  // ---- 5. エラー傾向 ----
  const errCounts = new Map<string, number>();
  for (const s of sessions) {
    for (const t of s.trials) {
      for (const code of t.errorTypes) errCounts.set(code, (errCounts.get(code) ?? 0) + 1);
    }
  }
  const errors = [...errCounts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { profiles, scatter, endurance, learning, errors };
}
