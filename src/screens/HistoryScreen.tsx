import { STATUS_LABELS, TASK_NAMES } from '../constants';
import { useApp } from '../store/AppContext';
import { dateStamp, downloadCSV, downloadJSON, fmtDateTime, trialsToCSV } from '../store/exporter';

export function HistoryScreen() {
  const { doc, navigate, currentUserId } = useApp();
  const sessions = doc.sessions
    .filter((s) => s.userId === currentUserId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const assessments = doc.assessments
    .filter((a) => a.userId === currentUserId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const exportAllJSON = () =>
    downloadJSON(`pcwa_user_${currentUserId}_${dateStamp()}.json`, {
      version: 1,
      users: doc.users.filter((u) => u.id === currentUserId),
      sessions,
    });
  const exportAllCSV = () => downloadCSV(`pcwa_user_${currentUserId}_${dateStamp()}.csv`, trialsToCSV(sessions));

  return (
    <div className="screen">
      <section className="panel">
        <div className="panel-head">
          <h2>これまでの結果</h2>
          <span className="chip">利用者: {currentUserId}</span>
        </div>

        {assessments.length > 0 && (
          <>
            <h3>総合アセスメント</h3>
            <table className="detail-table">
              <thead>
                <tr>
                  <th>日時</th>
                  <th>レベルの決めかた</th>
                  <th>実施種目数</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {assessments.map((a) => (
                  <tr key={a.id}>
                    <td>{fmtDateTime(a.startedAt)}</td>
                    <td>{a.plan.levelMode === 'adaptive' ? '自動調整' : `固定L${a.plan.fixedLevel}`}</td>
                    <td>{doc.sessions.filter((s) => s.assessmentId === a.id).length}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => navigate({ name: 'assessmentResult', assessmentId: a.id })}
                      >
                        表示
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="history-sessions-head">種目別セッション</h3>
          </>
        )}

        {sessions.length === 0 ? (
          <p className="sub">まだ記録がありません。訓練モードまたは適応モードで課題を実施すると、ここに表示されます。</p>
        ) : (
          <table className="detail-table">
            <thead>
              <tr>
                <th>日時</th>
                <th>種目</th>
                <th>モード</th>
                <th>問題数</th>
                <th>正答率</th>
                <th>めやすLv</th>
                <th>状態</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const n = s.trials.length;
                const c = s.trials.filter((t) => t.correct).length;
                return (
                  <tr key={s.id}>
                    <td>{fmtDateTime(s.startedAt)}</td>
                    <td>{TASK_NAMES[s.taskType]}</td>
                    <td>
                      {s.levelMode === 'fixed' ? `固定L${s.plan.fixedLevel}` : '適応'}
                      {s.assessmentId ? '（総合）' : ''}
                    </td>
                    <td>{n}</td>
                    <td>{n === 0 ? '-' : `${Math.round((c / n) * 100)}%`}</td>
                    <td>{s.adaptiveResult?.estimate ?? '-'}</td>
                    <td>{STATUS_LABELS[s.status] ?? s.status}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => navigate({ name: 'result', sessionId: s.id })}
                      >
                        表示
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="panel-actions wrap">
          {sessions.length > 0 && (
            <>
              <button type="button" className="btn btn-secondary" onClick={exportAllJSON}>
                この利用者のJSON出力
              </button>
              <button type="button" className="btn btn-secondary" onClick={exportAllCSV}>
                この利用者のCSV出力
              </button>
            </>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => navigate({ name: 'mode' })}>
            モード選択へ
          </button>
        </div>
      </section>
    </div>
  );
}
