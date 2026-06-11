import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_VERSION, PRACTICE_COUNT, SELFEVAL_DIFFICULTY, SELFEVAL_PERFORMANCE, TASK_NAMES } from '../constants';
import { mulberry32 } from '../engine/rng';
import type { RNG } from '../engine/rng';
import { createStaircase, feedStaircase, staircaseEstimate } from '../engine/staircase';
import type { StaircaseConfig, StaircaseState } from '../engine/staircase';
import { useApp } from '../store/AppContext';
import { clearInflight, saveInflight } from '../store/storage';
import { getTask } from '../tasks/registry';
import type { SessionPlan, SessionRecord, SessionStatus, TrialLog } from '../types';

type Phase = 'intro' | 'practice' | 'practiceDone' | 'running' | 'selfEval';

interface ActiveTrial {
  id: string;
  index: number;
  level: number;
  problem: unknown;
  presentedActiveMs: number;
  presentedWall: number;
  pausedMs: number;
}

function fmtClock(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 総合アセスメントの一部として実行する場合のコンテキスト */
export interface AssessmentCtx {
  id: string;
  seq: number;
  total: number;
  onComplete: (sessionId: string) => void;
}

export function SessionScreen({ plan, assessment }: { plan: SessionPlan; assessment?: AssessmentCtx }) {
  const { navigate, saveSession, updateSession } = useApp();
  const task = getTask(plan.taskType)!;

  const [phase, setPhase] = useState<Phase>('intro');
  const [paused, setPaused] = useState(false);
  const [trial, setTrial] = useState<ActiveTrial | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean } | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const [, setTick] = useState(0);

  // 計測まわりは ref（レンダリングに依存しない正確な記録のため）
  const sessionIdRef = useRef(`s-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  const rngRef = useRef<RNG | null>(null);
  const practiceRngRef = useRef<RNG | null>(null);
  const stairRef = useRef<StaircaseState | null>(null);
  const stairCfgRef = useRef<StaircaseConfig | null>(null);
  const logsRef = useRef<TrialLog[]>([]);
  const practiceLogsRef = useRef<TrialLog[]>([]);
  const practiceRetriesRef = useRef(0);
  const practiceRoundRef = useRef(0); // 今回の練習ラウンドで解いた数
  const pausesRef = useRef<{ atMs: number; durationMs: number }[]>([]);
  const totalPausedRef = useRef(0);
  const pauseStartRef = useRef<number | null>(null);
  const startWallRef = useRef(0);
  const startedAtIsoRef = useRef('');
  const finishedRef = useRef(false);
  const savedIdRef = useRef<string | null>(null);
  const [selfDifficulty, setSelfDifficulty] = useState<number | null>(null);
  const [selfPerformance, setSelfPerformance] = useState<number | null>(null);

  const startLevel = plan.levelMode === 'fixed' ? plan.fixedLevel! : plan.adaptive!.startLevel;

  const activeElapsed = useCallback(() => {
    if (startWallRef.current === 0) return 0;
    const pausing = pauseStartRef.current != null ? Date.now() - pauseStartRef.current : 0;
    return Date.now() - startWallRef.current - totalPausedRef.current - pausing;
  }, []);

  const currentLevel = useCallback((): number => {
    if (plan.levelMode === 'fixed') return plan.fixedLevel!;
    return stairRef.current ? stairRef.current.level : plan.adaptive!.startLevel;
  }, [plan]);

  // ---- 出題 ----
  const beginTrial = useCallback(
    (practiceMode: boolean) => {
      const level = practiceMode ? startLevel : currentLevel();
      const rng = practiceMode
        ? (practiceRngRef.current ??= mulberry32(plan.seed ^ 0x9e3779b9))
        : (rngRef.current ??= mulberry32(plan.seed));
      const index = practiceMode ? practiceLogsRef.current.length : logsRef.current.length;
      setTrial({
        id: `${sessionIdRef.current}-${practiceMode ? 'p' : 't'}${index}`,
        index,
        level,
        problem: task.generate(level, rng),
        presentedActiveMs: practiceMode ? 0 : Math.max(0, activeElapsed()),
        presentedWall: Date.now(),
        pausedMs: 0,
      });
    },
    [plan.seed, task, startLevel, currentLevel, activeElapsed]
  );

  // ---- セッション記録の組み立て ----
  const buildRecord = useCallback(
    (status: SessionStatus): SessionRecord => {
      const rec: SessionRecord = {
        id: sessionIdRef.current,
        appVersion: APP_VERSION,
        userId: plan.userId,
        taskType: plan.taskType,
        levelMode: plan.levelMode,
        plan,
        seed: plan.seed,
        startedAt: startedAtIsoRef.current || new Date().toISOString(),
        endedAt: new Date().toISOString(),
        status,
        trials: [...logsRef.current],
        practiceTrials: [...practiceLogsRef.current],
        practiceRetries: practiceRetriesRef.current,
        pauses: [...pausesRef.current],
        totalPausedMs: totalPausedRef.current,
      };
      if (plan.levelMode === 'adaptive' && stairRef.current) {
        const st = stairRef.current;
        const { estimate, provisional } = staircaseEstimate(st);
        rec.adaptiveResult = {
          reversals: [...st.reversals],
          estimate,
          provisional,
          converged: st.converged,
        };
      }
      if (assessment) {
        rec.assessmentId = assessment.id;
        rec.assessmentSeq = assessment.seq;
      }
      return rec;
    },
    [plan, assessment]
  );

  const finish = useCallback(
    (status: SessionStatus) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const rec = buildRecord(status);
      saveSession(rec);
      clearInflight();
      savedIdRef.current = rec.id;
      setTrial(null);
      setFeedback(null);
      if (assessment) {
        // 総合アセスメント中は自己評価を最後にまとめて聞く（親が次の種目へ進める）
        assessment.onComplete(rec.id);
      } else {
        setPhase('selfEval');
      }
    },
    [buildRecord, saveSession, assessment]
  );

  // ---- 回答確定 ----
  const onSubmit = useCallback(
    (answer: unknown, meta: { editCount: number }) => {
      if (!trial || feedback || finishedRef.current) return;
      const now = Date.now();
      const durationMs = Math.max(0, now - trial.presentedWall - trial.pausedMs);
      const scored = task.score(trial.problem, answer);
      const log: TrialLog = {
        index: trial.index,
        id: trial.id,
        level: trial.level,
        presentedAtMs: trial.presentedActiveMs,
        answeredAtMs: trial.presentedActiveMs + durationMs,
        durationMs,
        pausedMs: trial.pausedMs,
        correct: scored.correct,
        errorTypes: scored.errorTypes,
        editCount: meta.editCount,
        detail: scored.detail,
      };

      if (phase === 'practice') {
        practiceLogsRef.current.push(log);
        practiceRoundRef.current += 1;
        const roundDone = practiceRoundRef.current >= PRACTICE_COUNT;
        // 練習は常に正誤を表示（指示理解の確認のため）
        setFeedback({ ok: scored.correct });
        window.setTimeout(() => {
          setFeedback(null);
          if (roundDone) {
            setTrial(null);
            setPhase('practiceDone');
          } else {
            beginTrial(true);
          }
        }, 900);
        return;
      }

      // 本番
      logsRef.current.push(log);
      let converged = false;
      if (plan.levelMode === 'adaptive' && stairRef.current && stairCfgRef.current) {
        feedStaircase(stairRef.current, stairCfgRef.current, scored.correct, trial.index);
        converged = stairRef.current.converged;
      }
      saveInflight(buildRecord('recovered'));

      const reachedCount = plan.limitType === 'count' && logsRef.current.length >= (plan.countLimit ?? Infinity);
      const reachedTime = plan.limitType === 'time' && activeElapsed() >= (plan.timeLimitSec ?? Infinity) * 1000;
      const endStatus: SessionStatus | null = converged
        ? 'converged'
        : reachedCount
          ? 'completed'
          : reachedTime
            ? 'timeup'
            : null;

      const proceed = () => {
        setFeedback(null);
        if (endStatus) finish(endStatus);
        else beginTrial(false);
      };

      if (plan.feedback) {
        setFeedback({ ok: scored.correct });
        window.setTimeout(proceed, 700);
      } else {
        proceed();
      }
    },
    [trial, feedback, phase, task, plan, beginTrial, buildRecord, finish, activeElapsed]
  );

  // ---- フェーズ遷移 ----
  const startPractice = () => {
    practiceRoundRef.current = 0;
    setPhase('practice');
    beginTrial(true);
  };

  const retryPractice = () => {
    practiceRetriesRef.current += 1;
    startPractice();
  };

  const startMain = () => {
    startWallRef.current = Date.now();
    startedAtIsoRef.current = new Date().toISOString();
    if (plan.levelMode === 'adaptive') {
      stairCfgRef.current = {
        startLevel: plan.adaptive!.startLevel,
        minLevel: 1,
        maxLevel: task.maxLevel,
        nUp: plan.adaptive!.nUp,
        mWindow: plan.adaptive!.mWindow,
        kDown: plan.adaptive!.kDown,
        reversalTarget: plan.adaptive!.reversalTarget,
      };
      stairRef.current = createStaircase(stairCfgRef.current);
    }
    setPhase('running');
    beginTrial(false);
  };

  // ---- 一時停止 ----
  const pause = () => {
    if (paused || phase !== 'running') return;
    pauseStartRef.current = Date.now();
    setPaused(true);
  };

  const resume = () => {
    if (!paused || pauseStartRef.current == null) return;
    const now = Date.now();
    const d = now - pauseStartRef.current;
    const atMs = pauseStartRef.current - startWallRef.current - totalPausedRef.current;
    totalPausedRef.current += d;
    pausesRef.current.push({ atMs: Math.max(0, atMs), durationMs: d });
    pauseStartRef.current = null;
    // 休止中に次の問題が提示された場合（フィードバック表示中の一時停止など）は、
    // 提示後の休止時間だけをその問題に計上する
    setTrial((t) =>
      t ? { ...t, pausedMs: t.pausedMs + Math.min(d, Math.max(0, now - t.presentedWall)) } : t
    );
    setPaused(false);
    window.setTimeout(() => {
      document.querySelector<HTMLInputElement>('.task-area input:not([disabled])')?.focus();
    }, 0);
  };

  // ---- 中断 ----
  const quit = () => {
    if (assessment) {
      if (window.confirm('この種目をここまでにして、次へ進みますか？（ここまでの記録は保存されます）')) {
        finish('aborted');
      }
      return;
    }
    if (phase === 'running' && logsRef.current.length > 0) {
      if (window.confirm('ここまでの結果を保存して終了しますか？')) {
        finish('aborted');
      }
    } else {
      if (window.confirm('セッションをやめてモード選択にもどりますか？（記録は保存されません）')) {
        clearInflight();
        navigate({ name: 'mode' });
      }
    }
  };

  // ---- 時計（500ms tick：残り時間表示と時間切れ判定） ----
  useEffect(() => {
    if (phase !== 'running') return;
    const h = window.setInterval(() => {
      setTick((t) => t + 1);
      if (
        plan.limitType === 'time' &&
        !paused &&
        activeElapsed() >= (plan.timeLimitSec ?? Infinity) * 1000
      ) {
        setTimeUp(true);
      }
    }, 500);
    return () => window.clearInterval(h);
  }, [phase, paused, plan, activeElapsed]);

  // ---- ブラウザを閉じる操作への警告 ----
  useEffect(() => {
    if (phase !== 'running') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  // ---- 自己評価の確定 ----
  const submitSelfEval = (skip: boolean) => {
    const id = savedIdRef.current;
    if (id && !skip && (selfDifficulty != null || selfPerformance != null)) {
      updateSession(id, {
        selfEval: {
          difficulty: selfDifficulty ?? undefined,
          performance: selfPerformance ?? undefined,
        },
      });
    }
    if (id) navigate({ name: 'result', sessionId: id });
    else navigate({ name: 'mode' });
  };

  // ================= 描画 =================

  const TaskComponent = task.Component;
  const isTrialPhase = phase === 'practice' || phase === 'running';

  return (
    <div className="screen session-screen">
      <div className="session-bar">
        <div className="session-bar-left">
          {assessment && (
            <span className="chip chip-ok">
              種目 {assessment.seq}/{assessment.total}
            </span>
          )}
          <span className="chip">{TASK_NAMES[plan.taskType]}</span>
          {plan.levelMode === 'fixed' && <span className="chip">レベル {plan.fixedLevel}</span>}
          {phase === 'practice' && <span className="chip chip-ok">練習中</span>}
        </div>
        <div className="session-bar-center">
          {phase === 'running' &&
            (plan.limitType === 'time' ? (
              <span className="timer" aria-label="残り時間">
                残り {fmtClock((plan.timeLimitSec ?? 0) * 1000 - activeElapsed())}
              </span>
            ) : (
              <span className="timer">
                {logsRef.current.length + (trial ? 1 : 0)} / {plan.countLimit} 問
              </span>
            ))}
        </div>
        <div className="session-bar-right">
          {phase === 'running' && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={pause}>
              一時停止
            </button>
          )}
          {isTrialPhase && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={quit}>
              終了する
            </button>
          )}
        </div>
      </div>

      {timeUp && phase === 'running' && (
        <div className="lastone-note" role="status">
          この問題で終わりです。
        </div>
      )}

      {phase === 'intro' && (
        <section className="panel">
          <h2>{task.name}</h2>
          <p>{task.shortDesc}</p>
          <ul className="instructions">
            {task.instructions.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <p className="sub">
            実施量：
            {plan.limitType === 'time' ? `${Math.round((plan.timeLimitSec ?? 0) / 60)}分` : `${plan.countLimit}問`}
            {plan.practice ? '（はじめに練習が2問あります）' : ''}
          </p>
          <div className="panel-actions">
            <button type="button" className="btn btn-ghost" onClick={quit}>
              やめる
            </button>
            <button type="button" className="btn btn-primary btn-lg" onClick={plan.practice ? startPractice : startMain}>
              {plan.practice ? '練習をはじめる' : 'はじめる'}
            </button>
          </div>
        </section>
      )}

      {phase === 'practiceDone' && (
        <section className="panel">
          <h2>練習が終わりました</h2>
          <p>
            練習の結果：{PRACTICE_COUNT}問中{' '}
            {practiceLogsRef.current.slice(-PRACTICE_COUNT).filter((t) => t.correct).length}問 正解
          </p>
          <p className="sub">やり方がわかったら、本番に進みましょう。もう一度練習することもできます。</p>
          <div className="panel-actions">
            <button type="button" className="btn btn-secondary" onClick={retryPractice}>
              もう一度練習する
            </button>
            <button type="button" className="btn btn-primary btn-lg" onClick={startMain}>
              本番をはじめる
            </button>
          </div>
        </section>
      )}

      {isTrialPhase && trial && (
        <section className="panel task-area" aria-live="polite">
          <TaskComponent key={trial.id} problem={trial.problem} disabled={!!feedback || paused} onSubmit={onSubmit} />
          {feedback && (
            <div className={'feedback-toast ' + (feedback.ok ? 'ok' : 'ng')} role="status">
              {feedback.ok ? '○ 正解' : '× ちがいがありました'}
            </div>
          )}
          {phase === 'practice' && feedback && !feedback.ok && task.renderTrialDetail && (
            <div className="practice-detail" role="status">
              {task.renderTrialDetail(practiceLogsRef.current[practiceLogsRef.current.length - 1])}
            </div>
          )}
        </section>
      )}

      {phase === 'selfEval' && (
        <section className="panel">
          <h2>おつかれさまでした</h2>
          <p>よろしければ、今回の課題についてきかせてください（あとで結果といっしょに表示されます）。</p>
          <div className="form-group">
            <div className="form-label">今回の課題のむずかしさは どうでしたか？</div>
            <div className="choice-row">
              {SELFEVAL_DIFFICULTY.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  className={'chip-btn' + (selfDifficulty === i + 1 ? ' selected' : '')}
                  aria-pressed={selfDifficulty === i + 1}
                  onClick={() => setSelfDifficulty(i + 1)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <div className="form-label">自分では どのくらい できたと思いますか？</div>
            <div className="choice-row">
              {SELFEVAL_PERFORMANCE.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  className={'chip-btn' + (selfPerformance === i + 1 ? ' selected' : '')}
                  aria-pressed={selfPerformance === i + 1}
                  onClick={() => setSelfPerformance(i + 1)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="panel-actions">
            <button type="button" className="btn btn-ghost" onClick={() => submitSelfEval(true)}>
              とばす
            </button>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              disabled={selfDifficulty == null && selfPerformance == null}
              onClick={() => submitSelfEval(false)}
            >
              これで決定
            </button>
          </div>
        </section>
      )}

      {paused && (
        <div className="pause-overlay">
          <div className="pause-card">
            <h2>ひと休みしています</h2>
            <p className="sub">休んだ時間は作業時間に含まれません。</p>
            <button type="button" className="btn btn-primary btn-lg" onClick={resume}>
              再開する
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
