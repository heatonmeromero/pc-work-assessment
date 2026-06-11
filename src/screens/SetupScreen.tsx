import { useState } from 'react';
import { TASK_NAMES, TASK_ORDER } from '../constants';
import { randomSeed } from '../engine/rng';
import { useApp } from '../store/AppContext';
import { allocateAssessmentTime, TASKS } from '../tasks/registry';
import type { AssessmentPlan, LevelMode, SessionPlan, TaskType } from '../types';

const TIME_PRESETS = [5, 10, 15, 20] as const;
const ASSESSMENT_TIME_PRESETS = [10, 15, 20] as const;
const COUNT_PRESETS = [10, 20, 50] as const;

export function SetupScreen({ mode }: { mode: 'training' | 'adaptive' | 'assessment' }) {
  const { navigate, currentUserId, doc } = useApp();
  const defs = doc.settings.defaults;
  const isAssessment = mode === 'assessment';
  const implementedTasks = TASK_ORDER.filter((t) => TASKS[t]);

  const [taskType, setTaskType] = useState<TaskType>('numeric');
  const task = TASKS[taskType]!;

  const [level, setLevel] = useState(1); // 訓練=固定レベル／適応・総合=開始レベル
  const [levelMode, setLevelMode] = useState<LevelMode>('adaptive'); // 総合のみで使用
  const [limitType, setLimitType] = useState<'time' | 'count'>(mode === 'training' ? 'count' : 'time');
  const [timeMin, setTimeMin] = useState<number | 'custom'>(isAssessment ? 15 : 10);
  const [customMin, setCustomMin] = useState(isAssessment ? 15 : 10);
  const [count, setCount] = useState<number | 'custom'>(20);
  const [customCount, setCustomCount] = useState(20);
  const [feedback, setFeedback] = useState(isAssessment ? false : defs.feedback);
  const [practice, setPractice] = useState(defs.practice);
  const [nUp, setNUp] = useState(defs.nUp);
  const [mWindow, setMWindow] = useState(defs.mWindow);
  const [kDown, setKDown] = useState(defs.kDown);
  const [reversalTarget, setReversalTarget] = useState(defs.reversalTarget);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    if (!currentUserId) return;
    const timeLimitMin = timeMin === 'custom' ? customMin : timeMin;
    const countLimit = count === 'custom' ? customCount : count;
    if (limitType === 'time' && (timeLimitMin < 1 || timeLimitMin > 120)) {
      setError('時間は1〜120分で設定してください');
      return;
    }
    if (limitType === 'count' && (countLimit < 1 || countLimit > 500)) {
      setError('問題数は1〜500問で設定してください');
      return;
    }
    const adaptiveActive = mode === 'adaptive' || (isAssessment && levelMode === 'adaptive');
    if (adaptiveActive) {
      if (kDown > mWindow) {
        setError('「誤答数（K）」は「直近の問題数（M）」以下にしてください');
        return;
      }
      if (nUp < 1 || mWindow < 1 || kDown < 1 || reversalTarget < 1) {
        setError('適応条件は1以上の数で設定してください');
        return;
      }
    }
    if (isAssessment) {
      if (timeLimitMin < 3) {
        setError('総合アセスメントは3分以上で設定してください');
        return;
      }
      const plan: AssessmentPlan = {
        userId: currentUserId,
        totalSec: timeLimitMin * 60,
        levelMode,
        fixedLevel: levelMode === 'fixed' ? level : undefined,
        adaptive: levelMode === 'adaptive' ? { startLevel: level, nUp, mWindow, kDown, reversalTarget } : undefined,
        practice,
        feedback,
        seed: randomSeed(),
      };
      navigate({ name: 'assessment', plan });
      return;
    }
    const plan: SessionPlan = {
      userId: currentUserId,
      taskType,
      levelMode: mode === 'training' ? 'fixed' : 'adaptive',
      fixedLevel: mode === 'training' ? level : undefined,
      adaptive:
        mode === 'adaptive'
          ? { startLevel: level, nUp, mWindow, kDown, reversalTarget }
          : undefined,
      limitType,
      timeLimitSec: limitType === 'time' ? timeLimitMin * 60 : undefined,
      countLimit: limitType === 'count' ? countLimit : undefined,
      feedback,
      practice,
      seed: randomSeed(),
    };
    navigate({ name: 'session', plan });
  };

  return (
    <div className="screen">
      <section className="panel">
        <div className="panel-head">
          <h2>
            {mode === 'training' ? '訓練モードの設定' : mode === 'adaptive' ? '適応モードの設定' : 'アセスメント（総合）の設定'}
          </h2>
          <span className="chip">利用者: {currentUserId}</span>
        </div>

        {isAssessment ? (
          <div className="form-group">
            <div className="form-label">実施する種目（5種目を順番に行います）</div>
            <div className="choice-row">
              {implementedTasks.map((t, i) => (
                <span key={t} className="chip chip-ok">
                  {i + 1}. {TASK_NAMES[t]}
                </span>
              ))}
            </div>
            <p className="sub">種目のあいだは説明画面で止まるので、そこで休憩できます。</p>
          </div>
        ) : (
          <div className="form-group">
            <div className="form-label">種目</div>
            <div className="choice-row">
              {TASK_ORDER.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={'chip-btn' + (taskType === t ? ' selected' : '')}
                  disabled={!TASKS[t]}
                  aria-pressed={taskType === t}
                  onClick={() => setTaskType(t)}
                >
                  {TASK_NAMES[t]}
                  {TASKS[t] ? '' : '（準備中）'}
                </button>
              ))}
            </div>
            <p className="sub">{task.shortDesc}</p>
          </div>
        )}

        {isAssessment && (
          <div className="form-group">
            <div className="form-label">レベルの決めかた</div>
            <div className="choice-row">
              <label className="radio-row">
                <input type="radio" checked={levelMode === 'adaptive'} onChange={() => setLevelMode('adaptive')} />
                <span>自動調整（おすすめ：種目ごとのめやすレベルを測ります）</span>
              </label>
              <label className="radio-row">
                <input type="radio" checked={levelMode === 'fixed'} onChange={() => setLevelMode('fixed')} />
                <span>固定レベル</span>
              </label>
            </div>
          </div>
        )}

        <div className="form-group">
          <div className="form-label">
            {mode === 'training' || (isAssessment && levelMode === 'fixed') ? 'レベル（固定）' : '開始レベル'}
          </div>
          <div className="choice-row">
            <select value={level} onChange={(e) => setLevel(Number(e.target.value))} aria-label="レベル">
              {Array.from({ length: task.maxLevel }, (_, i) => i + 1).map((lv) => (
                <option key={lv} value={lv}>
                  レベル {lv}
                </option>
              ))}
            </select>
            {!isAssessment && <span className="sub level-summary">{task.levelSummaries[level - 1]}</span>}
          </div>
          {(mode === 'adaptive' || (isAssessment && levelMode === 'adaptive')) && (
            <p className="sub">正解が続くとレベルが上がり、まちがいが続くと下がります（本人への増減表示はしません）。</p>
          )}
        </div>

        <div className="form-group">
          <div className="form-label">{isAssessment ? '合計のめやす時間' : '実施量'}</div>
          {!isAssessment && (
            <div className="choice-row">
              <label className="radio-row">
                <input type="radio" checked={limitType === 'time'} onChange={() => setLimitType('time')} />
                <span>時間で区切る</span>
              </label>
              <label className="radio-row">
                <input type="radio" checked={limitType === 'count'} onChange={() => setLimitType('count')} />
                <span>問題数で区切る</span>
              </label>
            </div>
          )}
          {limitType === 'time' || isAssessment ? (
            <div className="choice-row">
              {(isAssessment ? ASSESSMENT_TIME_PRESETS : TIME_PRESETS).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={'chip-btn' + (timeMin === m ? ' selected' : '')}
                  aria-pressed={timeMin === m}
                  onClick={() => setTimeMin(m)}
                >
                  {m}分
                </button>
              ))}
              <button
                type="button"
                className={'chip-btn' + (timeMin === 'custom' ? ' selected' : '')}
                aria-pressed={timeMin === 'custom'}
                onClick={() => setTimeMin('custom')}
              >
                カスタム
              </button>
              {timeMin === 'custom' && (
                <label className="input-row inline">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={customMin}
                    onChange={(e) => setCustomMin(Number(e.target.value))}
                  />
                  <span>分</span>
                </label>
              )}
            </div>
          ) : (
            <div className="choice-row">
              {COUNT_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={'chip-btn' + (count === c ? ' selected' : '')}
                  aria-pressed={count === c}
                  onClick={() => setCount(c)}
                >
                  {c}問
                </button>
              ))}
              <button
                type="button"
                className={'chip-btn' + (count === 'custom' ? ' selected' : '')}
                aria-pressed={count === 'custom'}
                onClick={() => setCount('custom')}
              >
                カスタム
              </button>
              {count === 'custom' && (
                <label className="input-row inline">
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={customCount}
                    onChange={(e) => setCustomCount(Number(e.target.value))}
                  />
                  <span>問</span>
                </label>
              )}
            </div>
          )}
          {isAssessment && (
            <div className="alloc-preview">
              <p className="sub">種目ごとの持ち時間のめやす（標準時間に比例して自動配分）：</p>
              <div className="choice-row">
                {(() => {
                  const totalMin = timeMin === 'custom' ? customMin : timeMin;
                  const alloc = allocateAssessmentTime(Math.max(1, totalMin) * 60, implementedTasks, level);
                  return implementedTasks.map((t) => (
                    <span key={t} className="chip">
                      {TASK_NAMES[t]} 約{Math.round(alloc[t] / 60 * 10) / 10}分
                    </span>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>

        <div className="form-group">
          <div className="form-label">オプション</div>
          <label className="check-row">
            <input type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} />
            <span>本番の前に練習問題（2問）を行う</span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={feedback} onChange={(e) => setFeedback(e.target.checked)} />
            <span>1問ごとに正誤を表示する</span>
          </label>
        </div>

        {(mode === 'adaptive' || (isAssessment && levelMode === 'adaptive')) && (
          <details className="advanced">
            <summary>適応条件のくわしい設定（支援者用）</summary>
            <div className="form-group">
              <label className="input-row">
                <span>連続正解でレベル+1（N問）</span>
                <input type="number" min={1} max={10} value={nUp} onChange={(e) => setNUp(Number(e.target.value))} />
              </label>
              <label className="input-row">
                <span>直近の問題数（M問）</span>
                <input type="number" min={1} max={10} value={mWindow} onChange={(e) => setMWindow(Number(e.target.value))} />
              </label>
              <label className="input-row">
                <span>そのうち誤答がK問でレベル-1</span>
                <input type="number" min={1} max={10} value={kDown} onChange={(e) => setKDown(Number(e.target.value))} />
              </label>
              <label className="input-row">
                <span>収束とみなす折り返し回数</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={reversalTarget}
                  onChange={(e) => setReversalTarget(Number(e.target.value))}
                />
              </label>
            </div>
          </details>
        )}

        {error && <div className="form-error" role="alert">{error}</div>}

        <div className="panel-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate({ name: 'mode' })}>
            もどる
          </button>
          <button type="button" className="btn btn-primary btn-lg" onClick={start}>
            この設定ではじめる
          </button>
        </div>
      </section>
    </div>
  );
}
