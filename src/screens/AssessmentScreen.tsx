import { useMemo, useRef, useState } from 'react';
import { SELFEVAL_DIFFICULTY, SELFEVAL_PERFORMANCE, TASK_ORDER } from '../constants';
import { useApp } from '../store/AppContext';
import { allocateAssessmentTime, TASKS } from '../tasks/registry';
import type { AssessmentPlan, AssessmentRecord, SessionPlan } from '../types';
import { SessionScreen } from './SessionScreen';

/**
 * 総合アセスメント：実装済みの全種目を順番に実施する。
 * 各種目は SessionScreen をそのまま使い（説明・練習・一時停止つき）、
 * 標準時間テーブルに比例した持ち時間で実施する。
 * 自己評価は最後にまとめて1回きく。
 */
export function AssessmentScreen({ plan }: { plan: AssessmentPlan }) {
  const { navigate, saveAssessment, updateAssessment } = useApp();
  const tasks = useMemo(() => TASK_ORDER.filter((t) => TASKS[t]), []);
  const startLevel = plan.levelMode === 'fixed' ? (plan.fixedLevel ?? 1) : (plan.adaptive?.startLevel ?? 1);
  const alloc = useMemo(
    () => allocateAssessmentTime(plan.totalSec, tasks, startLevel),
    [plan.totalSec, tasks, startLevel]
  );

  const [seq, setSeq] = useState(0);
  const [phase, setPhase] = useState<'tasks' | 'selfEval'>('tasks');
  const idRef = useRef(`a-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  const startedAtRef = useRef(new Date().toISOString());
  const sessionIdsRef = useRef<string[]>([]);
  const [selfDifficulty, setSelfDifficulty] = useState<number | null>(null);
  const [selfPerformance, setSelfPerformance] = useState<number | null>(null);

  const buildRecord = (): AssessmentRecord => ({
    id: idRef.current,
    userId: plan.userId,
    startedAt: startedAtRef.current,
    endedAt: new Date().toISOString(),
    plan,
    sessionIds: [...sessionIdsRef.current],
  });

  const onSegmentComplete = (sessionId: string) => {
    sessionIdsRef.current.push(sessionId);
    // 1種目終わるごとに保存（途中でブラウザが落ちても、ここまでの分は残る）
    saveAssessment(buildRecord());
    if (seq + 1 < tasks.length) {
      setSeq(seq + 1);
    } else {
      setPhase('selfEval');
    }
  };

  const submitSelfEval = (skip: boolean) => {
    if (!skip && (selfDifficulty != null || selfPerformance != null)) {
      updateAssessment(idRef.current, {
        selfEval: {
          difficulty: selfDifficulty ?? undefined,
          performance: selfPerformance ?? undefined,
        },
      });
    }
    navigate({ name: 'assessmentResult', assessmentId: idRef.current });
  };

  if (phase === 'selfEval') {
    return (
      <div className="screen">
        <section className="panel">
          <h2>すべての種目が終わりました。おつかれさまでした</h2>
          <p>よろしければ、今日の課題全体についてきかせてください（あとで結果といっしょに表示されます）。</p>
          <div className="form-group">
            <div className="form-label">今日の課題のむずかしさは どうでしたか？</div>
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
      </div>
    );
  }

  const taskType = tasks[seq];
  const subPlan: SessionPlan = {
    userId: plan.userId,
    taskType,
    levelMode: plan.levelMode,
    fixedLevel: plan.levelMode === 'fixed' ? (plan.fixedLevel ?? 1) : undefined,
    adaptive: plan.levelMode === 'adaptive' ? plan.adaptive : undefined,
    limitType: 'time',
    timeLimitSec: alloc[taskType],
    feedback: plan.feedback,
    practice: plan.practice,
    seed: (plan.seed + seq * 7919) >>> 0,
  };

  return (
    <SessionScreen
      key={`${idRef.current}-${seq}`}
      plan={subPlan}
      assessment={{
        id: idRef.current,
        seq: seq + 1,
        total: tasks.length,
        onComplete: onSegmentComplete,
      }}
    />
  );
}
