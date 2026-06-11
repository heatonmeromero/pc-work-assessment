// 適応難易度制御（視力検査と同様のステアケース法）
// ・連続 nUp 問正解 → レベル+1
// ・直近 mWindow 問中 kDown 問誤答 → レベル-1
// ・上下動の向きが反転した点（折り返し点）を記録し、reversalTarget 回で収束。
//   到達レベル推定値 = 折り返し点レベルの平均。

export interface StaircaseConfig {
  startLevel: number;
  minLevel: number;
  maxLevel: number;
  nUp: number;
  mWindow: number;
  kDown: number;
  reversalTarget: number;
}

export interface StaircaseState {
  level: number;
  consecCorrect: number;
  window: boolean[];
  lastDirection: 'up' | 'down' | null;
  reversals: { trialIndex: number; level: number }[];
  converged: boolean;
}

export function createStaircase(cfg: StaircaseConfig): StaircaseState {
  return {
    level: clamp(cfg.startLevel, cfg.minLevel, cfg.maxLevel),
    consecCorrect: 0,
    window: [],
    lastDirection: null,
    reversals: [],
    converged: false,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** 1問の正誤を投入し状態を更新する（state を破壊的に更新） */
export function feedStaircase(
  state: StaircaseState,
  cfg: StaircaseConfig,
  correct: boolean,
  trialIndex: number
): StaircaseState {
  if (state.converged) return state;

  state.window.push(correct);
  if (state.window.length > cfg.mWindow) state.window.shift();
  state.consecCorrect = correct ? state.consecCorrect + 1 : 0;

  let moved: 'up' | 'down' | null = null;
  const levelBefore = state.level;

  if (state.consecCorrect >= cfg.nUp) {
    if (state.level < cfg.maxLevel) {
      state.level += 1;
      moved = 'up';
    } else {
      // 上限到達時はカウンタのみリセット（移動・折り返しなし）
      state.consecCorrect = 0;
      state.window = [];
    }
  } else {
    const wrongs = state.window.filter((w) => !w).length;
    if (wrongs >= cfg.kDown) {
      if (state.level > cfg.minLevel) {
        state.level -= 1;
        moved = 'down';
      } else {
        state.window = [];
      }
    }
  }

  if (moved) {
    if (state.lastDirection && state.lastDirection !== moved) {
      // 折り返し点 = 反転直前のレベル
      state.reversals.push({ trialIndex, level: levelBefore });
    }
    state.lastDirection = moved;
    state.consecCorrect = 0;
    state.window = [];
  }

  state.converged = state.reversals.length >= cfg.reversalTarget;
  return state;
}

/** 推定到達レベル。収束していれば確定値、未収束なら暫定値（折り返し平均 or 現在レベル） */
export function staircaseEstimate(state: StaircaseState): { estimate: number | null; provisional: boolean } {
  if (state.reversals.length > 0) {
    const mean = state.reversals.reduce((s, r) => s + r.level, 0) / state.reversals.length;
    return { estimate: Math.round(mean * 10) / 10, provisional: !state.converged };
  }
  return { estimate: state.level, provisional: true };
}
