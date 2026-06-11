// 共通ドメイン型定義

export type TaskType = 'numeric' | 'text' | 'copypaste' | 'searchfix' | 'filesort';

export type LevelMode = 'fixed' | 'adaptive';

/** 適応モード（ステアケース法）のパラメータ */
export interface AdaptiveParams {
  startLevel: number;
  /** 連続 nUp 問正解でレベル+1 */
  nUp: number;
  /** 直近 mWindow 問中 kDown 問誤答でレベル-1 */
  mWindow: number;
  kDown: number;
  /** 折り返しがこの回数に達したら収束終了 */
  reversalTarget: number;
}

/** セッション開始時に確定する実施計画 */
export interface SessionPlan {
  userId: string;
  taskType: TaskType;
  levelMode: LevelMode;
  fixedLevel?: number;
  adaptive?: AdaptiveParams;
  limitType: 'time' | 'count';
  timeLimitSec?: number;
  countLimit?: number;
  feedback: boolean;
  practice: boolean;
  seed: number;
}

/** 1問ごとのローデータ */
export interface TrialLog {
  index: number;
  id: string;
  level: number;
  /** セッション開始からの経過ms（一時停止を除いた実働時間軸） */
  presentedAtMs: number;
  answeredAtMs: number;
  /** 所要ms（一時停止分を除く） */
  durationMs: number;
  pausedMs: number;
  correct: boolean;
  errorTypes: string[];
  /** Backspace/Delete の回数（修正回数の近似） */
  editCount: number;
  detail?: unknown;
}

export interface AdaptiveResult {
  reversals: { trialIndex: number; level: number }[];
  /** 推定到達レベル（折り返し点の平均）。データ不足時は暫定値 */
  estimate: number | null;
  provisional: boolean;
  converged: boolean;
}

export interface SelfEval {
  /** むずかしさ 1(かんたん)〜4(むずかしい) */
  difficulty?: number;
  /** できばえ 1(よくできた)〜4(できなかった) */
  performance?: number;
}

export type SessionStatus = 'completed' | 'timeup' | 'converged' | 'aborted' | 'recovered';

export interface SessionRecord {
  id: string;
  appVersion: string;
  userId: string;
  taskType: TaskType;
  levelMode: LevelMode;
  plan: SessionPlan;
  seed: number;
  startedAt: string; // ISO
  endedAt: string;
  status: SessionStatus;
  /** 総合アセスメントの一部として実施された場合のグループIDと順番 */
  assessmentId?: string;
  assessmentSeq?: number;
  trials: TrialLog[];
  practiceTrials: TrialLog[];
  practiceRetries: number;
  pauses: { atMs: number; durationMs: number }[];
  totalPausedMs: number;
  adaptiveResult?: AdaptiveResult;
  selfEval?: SelfEval;
  /** 支援者の所見メモ（個人情報は書かない運用） */
  note?: string;
}

/** 利用者は任意IDのみで識別（個人情報は保持しない） */
export interface UserRecord {
  id: string;
  createdAt: string;
  /** 総合レポートの所見メモ（支援者の自由記述。個人情報は書かない運用） */
  reportNote?: string;
}

export interface AppSettings {
  fontScale: 's' | 'm' | 'l';
  /** 管理画面の合言葉（誤操作・いたずら防止が目的。暗号化はしないためセキュリティ機能ではない） */
  adminPin?: string;
  /** 初回起動時の運用注意を表示済みか */
  onboardingDone?: boolean;
  defaults: {
    nUp: number;
    mWindow: number;
    kDown: number;
    reversalTarget: number;
    feedback: boolean;
    practice: boolean;
  };
}

/** 総合アセスメント（5種目通し）の実施計画 */
export interface AssessmentPlan {
  userId: string;
  totalSec: number;
  levelMode: LevelMode;
  fixedLevel?: number;
  adaptive?: AdaptiveParams;
  practice: boolean;
  feedback: boolean;
  seed: number;
}

/** 総合アセスメントのグループ記録（種目別セッションを束ねる） */
export interface AssessmentRecord {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string;
  plan: AssessmentPlan;
  sessionIds: string[];
  selfEval?: SelfEval;
  note?: string;
}

export interface DataDoc {
  version: 1;
  users: UserRecord[];
  sessions: SessionRecord[];
  assessments: AssessmentRecord[];
  settings: AppSettings;
}

export interface TrialScore {
  correct: boolean;
  errorTypes: string[];
  detail?: unknown;
}
