import type { ComponentType } from 'react';
import type { RNG } from '../engine/rng';
import type { TaskType, TrialLog, TrialScore } from '../types';

export interface TaskComponentProps<P = unknown, A = unknown> {
  problem: P;
  disabled: boolean;
  onSubmit: (answer: A, meta: { editCount: number }) => void;
}

/** 種目プラグインの共通インターフェース。残り4種目もこの形で追加する */
export interface TaskModule<P = unknown, A = unknown> {
  type: TaskType;
  name: string;
  shortDesc: string;
  maxLevel: number;
  levelSummaries: string[];
  /** アセスメントモードの時間配分用の目安（秒/問） */
  stdSeconds: (level: number) => number;
  instructions: string[];
  generate: (level: number, rng: RNG) => P;
  score: (problem: P, answer: A) => TrialScore;
  /** 結果詳細表で誤答内容を文字列化する */
  renderTrialDetail?: (trial: TrialLog) => string;
  /** 結果画面に種目固有の集計カードを追加する（発見率・誤検出など） */
  extraStats?: (trials: TrialLog[]) => { label: string; value: string; accent?: boolean }[];
  Component: ComponentType<TaskComponentProps<P, A>>;
}
