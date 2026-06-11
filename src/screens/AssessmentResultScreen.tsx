import { useMemo, useState } from 'react';
import { SELFEVAL_DIFFICULTY, SELFEVAL_PERFORMANCE, STATUS_LABELS, TASK_NAMES } from '../constants';
import { useApp } from '../store/AppContext';
import { dateStamp, downloadCSV, downloadJSON, fmtDateTime, trialsToCSV } from '../store/exporter';
import { getTask } from '../tasks/registry';
import type { SessionRecord } from '../types';

function pct(n: number, d: number): string {
  return d === 0 ? '-' : `${Math.round((n / d) * 100)}%`;
}

function levelOf(s: SessionRecord): { value: number | null; label: string } {
  if (s.levelMode === 'adaptive') {
    const est = s.adaptiveResult?.estimate ?? null;
    return { value: est, label: est == null ? '-' : `${est}${s.adaptiveResult?.provisional ? '（暫定）' : ''}` };
  }
  const lv = s.plan.fixedLevel ?? null;
  return { value: lv, label: lv == null ? '-' : `固定 ${lv}` };
}

/** 総合アセスメントの通し結果（種目別サマリーとレベルのめやす） */
export function AssessmentResultScreen({ assessmentId }: { assessmentId: string }) {
  const { doc, navigate, updateAssessment } = useApp();
  const assessment = doc.assessments.find((a) => a.id === assessmentId);
  const sessions = useMemo(
    () =>
      doc.sessions
        .filter((s) => s.assessmentId === assessmentId)
        .sort((a, b) => (a.assessmentSeq ?? 0) - (b.assessmentSeq ?? 0)),
    [doc.sessions, assessmentId]
  );
  const [note, setNote] = useState(assessment?.note ?? '');
  const [noteSaved, setNoteSaved] = useState(false);

  if (!assessment) {
    return (
      <div className="screen">
        <section className="panel">
          <p>総合アセスメントの記録が見つかりませんでした。</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate({ name: 'mode' })}>
            モード選択へ
          </button>
        </section>
      </div>
    );
  }

  const allTrials = sessions.flatMap((s) => s.trials);
  const totalCorrect = allTrials.filter((t) => t.correct).length;

  const saveNote = () => {
    updateAssessment(assessment.id, { note: note.trim() || undefined });
    setNoteSaved(true);
    window.setTimeout(() => setNoteSaved(false), 2000);
  };

  const exportJSON = () =>
    downloadJSON(`pcwa_assessment_${assessment.userId}_${dateStamp(new Date(assessment.startedAt))}.json`, {
      assessment,
      sessions,
    });
  const exportCSV = () =>
    downloadCSV(`pcwa_assessment_${assessment.userId}_${dateStamp(new Date(assessment.startedAt))}.csv`, trialsToCSV(sessions));

  return (
    <div className="screen">
      <section className="panel">
        <div className="panel-head">
          <h2>総合アセスメント結果</h2>
          <div className="head-chips">
            <span className="chip">利用者: {assessment.userId}</span>
            <span className="chip">{fmtDateTime(assessment.startedAt)}</span>
            <span className="chip">{assessment.plan.levelMode === 'adaptive' ? 'レベル自動調整' : `固定レベル ${assessment.plan.fixedLevel}`}</span>
            <span className="chip">合計めやす {Math.round(assessment.plan.totalSec / 60)}分</span>
          </div>
        </div>

        {/* できたことを先に表示する */}
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{sessions.length}種目</div>
            <div className="stat-label">取り組んだ種目</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{allTrials.length}問</div>
            <div className="stat-label">取り組んだ問題の合計</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {totalCorrect}問 <span className="stat-sub">({pct(totalCorrect, allTrials.length)})</span>
            </div>
            <div className="stat-label">正解</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h3>種目別のようす</h3>
        <table className="detail-table">
          <thead>
            <tr>
              <th>種目</th>
              <th>問題数</th>
              <th>正答率</th>
              <th>平均時間</th>
              <th>レベルのめやす</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const n = s.trials.length;
              const c = s.trials.filter((t) => t.correct).length;
              const avgMs = n === 0 ? 0 : s.trials.reduce((sum, t) => sum + t.durationMs, 0) / n;
              return (
                <tr key={s.id}>
                  <td>{TASK_NAMES[s.taskType]}</td>
                  <td>{n}</td>
                  <td>{pct(c, n)}</td>
                  <td>{n === 0 ? '-' : `${(avgMs / 1000).toFixed(1)}秒`}</td>
                  <td>{levelOf(s).label}</td>
                  <td>{STATUS_LABELS[s.status] ?? s.status}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        navigate({ name: 'result', sessionId: s.id, backTo: { name: 'assessmentResult', assessmentId } })
                      }
                    >
                      詳細
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h3 className="profile-head">レベルのめやす（種目間の比較）</h3>
        <div className="bar-list">
          {sessions.map((s) => {
            const lv = levelOf(s);
            const max = getTask(s.taskType)?.maxLevel ?? 10;
            return (
              <div className="bar-row" key={s.id}>
                <span className="bar-label">{TASK_NAMES[s.taskType]}</span>
                <span className="bar-track">
                  <span
                    className="bar-fill bar-level"
                    style={{ width: lv.value == null ? '0%' : `${(lv.value / max) * 100}%` }}
                  />
                </span>
                <span className="bar-count">{lv.label}</span>
              </div>
            );
          })}
        </div>
        <p className="sub">
          レベルのめやすは結果のひとつの見方です。実測値と本人のようす（疲れ・緊張など）を合わせて解釈してください。
        </p>
      </section>

      {assessment.selfEval && (assessment.selfEval.difficulty != null || assessment.selfEval.performance != null) && (
        <section className="panel">
          <h3>本人の自己評価（全体をとおして）</h3>
          <p>
            {assessment.selfEval.difficulty != null &&
              `むずかしさ：${SELFEVAL_DIFFICULTY[assessment.selfEval.difficulty - 1]}　`}
            {assessment.selfEval.performance != null &&
              `できばえ：${SELFEVAL_PERFORMANCE[assessment.selfEval.performance - 1]}`}
          </p>
          <p className="sub">実測の結果と自己評価のずれは、自己理解を話し合う材料になります。</p>
        </section>
      )}

      <section className="panel">
        <h3>所見メモ（支援者用）</h3>
        <textarea
          className="note-area"
          rows={3}
          placeholder="全体をとおして観察した様子などを記録できます（氏名などの個人情報は書かないでください）"
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
            この結果をJSON出力
          </button>
          <button type="button" className="btn btn-secondary" onClick={exportCSV}>
            この結果をCSV出力
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate({ name: 'mode' })}>
            モード選択へ
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate({ name: 'top' })}>
            トップへ
          </button>
        </div>
        <p className="disclaimer">
          この結果は作業のようすを知るための参考情報です。評価や診断を確定するものではありません。支援者の観察と合わせて活用してください。
        </p>
      </section>
    </div>
  );
}
