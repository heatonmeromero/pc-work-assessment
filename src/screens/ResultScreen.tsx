import { useEffect, useMemo, useState } from 'react';
import { ERROR_LABELS, SELFEVAL_DIFFICULTY, SELFEVAL_PERFORMANCE, STATUS_LABELS, TASK_NAMES } from '../constants';
import { LevelChart, TimelineChart } from '../components/charts';
import { useApp } from '../store/AppContext';
import type { Screen } from '../store/AppContext';
import { dateStamp, downloadCSV, downloadJSON, fmtDateTime, trialsToCSV } from '../store/exporter';
import { getTask } from '../tasks/registry';
import type { SessionRecord, TrialLog } from '../types';

function pct(n: number, d: number): string {
  return d === 0 ? '-' : `${Math.round((n / d) * 100)}%`;
}

function avgSec(trials: TrialLog[]): string {
  if (trials.length === 0) return '-';
  const ms = trials.reduce((s, t) => s + t.durationMs, 0) / trials.length;
  return `${(ms / 1000).toFixed(1)}秒`;
}

/** 前半・後半の比較（持続性のめやす） */
function halves(trials: TrialLog[]) {
  const mid = Math.floor(trials.length / 2);
  const first = trials.slice(0, mid);
  const second = trials.slice(mid);
  return { first, second };
}

export function ResultScreen({ sessionId, backTo }: { sessionId: string; backTo?: Screen }) {
  const { doc, navigate, updateSession, setNavGuard } = useApp();
  const session = doc.sessions.find((s) => s.id === sessionId);
  const [note, setNote] = useState(session?.note ?? '');
  const [noteSaved, setNoteSaved] = useState(false);

  // 所見メモが未保存のまま画面を離れようとしたら確認する
  const noteDirty = note !== (session?.note ?? '');
  useEffect(() => {
    setNavGuard(noteDirty ? { message: '所見メモが保存されていません。保存せずに移動しますか？' } : null);
    return () => setNavGuard(null);
  }, [noteDirty, setNavGuard]);

  const errorCounts = useMemo(() => {
    if (!session) return [];
    const map = new Map<string, number>();
    for (const t of session.trials) {
      for (const e of t.errorTypes) map.set(e, (map.get(e) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [session]);

  if (!session) {
    return (
      <div className="screen">
        <section className="panel">
          <p>セッションが見つかりませんでした。</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate({ name: 'mode' })}>
            モード選択へ
          </button>
        </section>
      </div>
    );
  }

  const task = getTask(session.taskType);
  const trials = session.trials;
  const extraStats = trials.length > 0 ? (task?.extraStats?.(trials) ?? []) : [];
  const correctCount = trials.filter((t) => t.correct).length;
  const { first, second } = halves(trials);
  const maxErr = errorCounts.length > 0 ? errorCounts[0][1] : 1;
  const practiceCorrect = session.practiceTrials.filter((t) => t.correct).length;

  const saveNote = () => {
    updateSession(session.id, { note: note.trim() || undefined });
    setNoteSaved(true);
    window.setTimeout(() => setNoteSaved(false), 2000);
  };

  const exportJSON = () =>
    downloadJSON(`pcwa_session_${session.userId}_${session.taskType}_${dateStamp(new Date(session.startedAt))}.json`, session);
  const exportCSV = () =>
    downloadCSV(`pcwa_session_${session.userId}_${session.taskType}_${dateStamp(new Date(session.startedAt))}.csv`, trialsToCSV([session]));

  const retrySamePlan = () => {
    navigate({ name: 'session', plan: { ...session.plan, seed: Math.floor(Math.random() * 0xffffffff) } });
  };

  return (
    <div className="screen">
      <section className="panel">
        <div className="panel-head">
          <h2>セッション結果</h2>
          <div className="head-chips">
            <span className="chip">利用者: {session.userId}</span>
            <span className="chip">{TASK_NAMES[session.taskType]}</span>
            <span className="chip">{session.levelMode === 'fixed' ? `固定レベル ${session.plan.fixedLevel}` : '適応モード'}</span>
            <span className="chip">{fmtDateTime(session.startedAt)}</span>
            <span className="chip">{STATUS_LABELS[session.status] ?? session.status}</span>
          </div>
        </div>

        {/* できたことを先に表示する */}
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{trials.length}問</div>
            <div className="stat-label">取り組んだ問題</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {correctCount}問 <span className="stat-sub">({pct(correctCount, trials.length)})</span>
            </div>
            <div className="stat-label">正解</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{avgSec(trials)}</div>
            <div className="stat-label">1問あたりの平均時間</div>
          </div>
          {session.adaptiveResult && (
            <div className="stat-card stat-accent">
              <div className="stat-value">
                {session.adaptiveResult.estimate ?? '-'}
                {session.adaptiveResult.provisional && <span className="stat-sub">（暫定）</span>}
              </div>
              <div className="stat-label">安定して取り組めるレベルのめやす</div>
            </div>
          )}
        </div>

        {extraStats.length > 0 && (
          <div className="stat-grid">
            {extraStats.map((s, i) => (
              <div className={'stat-card' + (s.accent ? ' stat-accent' : '')} key={i}>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {(session.practiceTrials.length > 0 || session.pauses.length > 0) && (
          <p className="sub">
            {session.practiceTrials.length > 0 &&
              `練習: ${session.practiceTrials.length}問中${practiceCorrect}問正解・やりなおし${session.practiceRetries}回　`}
            {session.pauses.length > 0 &&
              `一時停止: ${session.pauses.length}回・合計${Math.round(session.totalPausedMs / 1000)}秒`}
          </p>
        )}
      </section>

      {session.adaptiveResult && trials.length > 0 && (
        <section className="panel">
          <h3>レベルの推移（適応モード）</h3>
          <LevelChart
            levels={trials.map((t) => t.level)}
            reversals={session.adaptiveResult.reversals}
            estimate={session.adaptiveResult.estimate}
            maxLevel={task?.maxLevel ?? 10}
          />
          <p className="sub">
            折り返し {session.adaptiveResult.reversals.length}回／収束目標 {session.plan.adaptive?.reversalTarget}回。
            めやすレベルは折り返し点の平均です。
          </p>
        </section>
      )}

      {trials.length > 0 && (
        <section className="panel">
          <h3>時間の流れと正誤</h3>
          <TimelineChart trials={trials} />
          {trials.length >= 6 && (
            <table className="mini-table">
              <thead>
                <tr>
                  <th></th>
                  <th>正答率</th>
                  <th>平均時間</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>前半（{first.length}問）</th>
                  <td>{pct(first.filter((t) => t.correct).length, first.length)}</td>
                  <td>{avgSec(first)}</td>
                </tr>
                <tr>
                  <th>後半（{second.length}問）</th>
                  <td>{pct(second.filter((t) => t.correct).length, second.length)}</td>
                  <td>{avgSec(second)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </section>
      )}

      {trials.length > 0 && (
        <section className="panel">
          <h3>エラーの内訳</h3>
          {errorCounts.length === 0 ? (
            <p>エラーはありませんでした。</p>
          ) : (
            <div className="bar-list">
              {errorCounts.map(([code, count]) => (
                <div className="bar-row" key={code}>
                  <span className="bar-label">{ERROR_LABELS[code] ?? code}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${(count / maxErr) * 100}%` }} />
                  </span>
                  <span className="bar-count">{count}件</span>
                </div>
              ))}
            </div>
          )}

          <details className="advanced">
            <summary>1問ごとの詳細</summary>
            <table className="detail-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>レベル</th>
                  <th>所要</th>
                  <th>正誤</th>
                  <th>修正</th>
                  <th>内容</th>
                </tr>
              </thead>
              <tbody>
                {trials.map((t) => (
                  <tr key={t.id}>
                    <td>{t.index + 1}</td>
                    <td>{t.level}</td>
                    <td>{(t.durationMs / 1000).toFixed(1)}秒</td>
                    <td className={t.correct ? 'cell-ok' : 'cell-ng'}>{t.correct ? '○' : '×'}</td>
                    <td>{t.editCount}</td>
                    <td className="cell-detail">{t.correct ? '' : (task?.renderTrialDetail?.(t) ?? t.errorTypes.join(', '))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      )}

      {session.selfEval && (session.selfEval.difficulty != null || session.selfEval.performance != null) && (
        <section className="panel">
          <h3>本人の自己評価</h3>
          <p>
            {session.selfEval.difficulty != null && `むずかしさ：${SELFEVAL_DIFFICULTY[session.selfEval.difficulty - 1]}　`}
            {session.selfEval.performance != null && `できばえ：${SELFEVAL_PERFORMANCE[session.selfEval.performance - 1]}`}
          </p>
          <p className="sub">実測の結果と自己評価のずれは、自己理解を話し合う材料になります。</p>
        </section>
      )}

      <section className="panel">
        <h3>所見メモ（支援者用）</h3>
        <textarea
          className="note-area"
          rows={3}
          placeholder="観察した様子などを自由に記録できます（氏名などの個人情報は書かないでください）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="panel-actions">
          {noteSaved && <span className="save-ok" role="status">保存しました</span>}
          <button type="button" className="btn btn-secondary" onClick={saveNote}>
            メモを保存
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-actions wrap">
          <button type="button" className="btn btn-secondary" onClick={exportJSON}>
            このセッションをJSON出力
          </button>
          <button type="button" className="btn btn-secondary" onClick={exportCSV}>
            このセッションをCSV出力
          </button>
          {!backTo && (
            <button type="button" className="btn btn-primary" onClick={retrySamePlan}>
              同じ設定でもう一度
            </button>
          )}
          {backTo && (
            <button type="button" className="btn btn-primary" onClick={() => navigate(backTo)}>
              総合結果へもどる
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => navigate({ name: 'mode' })}>
            モード選択へ
          </button>
        </div>
        <p className="disclaimer">
          この結果は作業のようすを知るための参考情報です。評価や診断を確定するものではありません。支援者の観察と合わせて活用してください。
        </p>
      </section>
    </div>
  );
}
