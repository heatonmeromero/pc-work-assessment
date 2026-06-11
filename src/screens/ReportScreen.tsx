import { useEffect, useMemo, useState } from 'react';
import { LearningChart, RadarChart, ScatterChart } from '../components/charts';
import {
  APP_NAME,
  ERROR_ADVICE,
  ERROR_LABELS,
  SELFEVAL_DIFFICULTY,
  SELFEVAL_PERFORMANCE,
  TASK_NAMES,
  TASK_ORDER,
} from '../constants';
import { buildReport } from '../engine/report';
import { useApp } from '../store/AppContext';
import { dateStamp, downloadCSV, downloadJSON, fmtDateTime, trialsToCSV } from '../store/exporter';
import { getTask } from '../tasks/registry';

function fmtPct(v: number | null): string {
  return v == null ? '-' : `${Math.round(v)}%`;
}
function fmtSec(v: number | null): string {
  return v == null ? '-' : `${v.toFixed(1)}秒`;
}

/**
 * 総合アセスメントレポート（最重要機能）。
 * 利用者IDの全セッションを集計し、A4縦のブラウザ印刷に耐えるレイアウトで表示する。
 * 機械的な判定で本人の評価を決めつけない：表現は「〜の可能性があります」で統一し、
 * 支援者の観察と合わせて判断する前提を明記する。
 */
export function ReportScreen() {
  const { doc, navigate, currentUserId, updateUser, setNavGuard } = useApp();
  const user = doc.users.find((u) => u.id === currentUserId);
  const sessions = useMemo(
    () =>
      doc.sessions
        .filter((s) => s.userId === currentUserId)
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    [doc.sessions, currentUserId]
  );
  const assessments = doc.assessments.filter((a) => a.userId === currentUserId);

  const report = useMemo(
    () => buildReport(sessions, TASK_ORDER, (t, l) => getTask(t)?.stdSeconds(l) ?? 30),
    [sessions]
  );

  const [note, setNote] = useState(user?.reportNote ?? '');
  const [noteSaved, setNoteSaved] = useState(false);

  // 所見メモが未保存のまま画面を離れようとしたら確認する
  const noteDirty = note !== (user?.reportNote ?? '');
  useEffect(() => {
    setNavGuard(noteDirty ? { message: '所見メモが保存されていません。保存せずに移動しますか？' } : null);
    return () => setNavGuard(null);
  }, [noteDirty, setNavGuard]);

  const selfEvalRows = useMemo(() => {
    const rows: { date: string; label: string; accuracy: number | null; difficulty?: number; performance?: number }[] = [];
    for (const s of sessions) {
      if (s.selfEval && (s.selfEval.difficulty != null || s.selfEval.performance != null)) {
        const n = s.trials.length;
        rows.push({
          date: s.startedAt,
          label: TASK_NAMES[s.taskType],
          accuracy: n === 0 ? null : (s.trials.filter((t) => t.correct).length / n) * 100,
          ...s.selfEval,
        });
      }
    }
    for (const a of assessments) {
      if (a.selfEval && (a.selfEval.difficulty != null || a.selfEval.performance != null)) {
        const ss = sessions.filter((s) => s.assessmentId === a.id);
        const trials = ss.flatMap((s) => s.trials);
        rows.push({
          date: a.startedAt,
          label: '総合（全体）',
          accuracy: trials.length === 0 ? null : (trials.filter((t) => t.correct).length / trials.length) * 100,
          ...a.selfEval,
        });
      }
    }
    return rows.sort((x, y) => y.date.localeCompare(x.date)).slice(0, 10);
  }, [sessions, assessments]);

  if (!user) {
    return (
      <div className="screen">
        <section className="panel">
          <p>利用者が選択されていません。</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate({ name: 'top' })}>
            トップへ
          </button>
        </section>
      </div>
    );
  }

  const totalTrials = sessions.reduce((sum, s) => sum + s.trials.length, 0);
  const period =
    sessions.length === 0
      ? '-'
      : `${fmtDateTime(sessions[0].startedAt)} 〜 ${fmtDateTime(sessions[sessions.length - 1].startedAt)}`;

  const saveNote = () => {
    updateUser(user.id, { reportNote: note.trim() || undefined });
    setNoteSaved(true);
    window.setTimeout(() => setNoteSaved(false), 2000);
  };

  const exportJSON = () =>
    downloadJSON(`pcwa_report_${user.id}_${dateStamp()}.json`, {
      app: APP_NAME,
      generatedAt: new Date().toISOString(),
      userId: user.id,
      reportNote: user.reportNote ?? note,
      summary: report,
      sessions,
      assessments,
    });

  const radarAxes = report.profiles.map((p) => ({
    label: TASK_NAMES[p.taskType],
    value: p.estimate,
    max: getTask(p.taskType)?.maxLevel ?? 10,
  }));

  return (
    <div className="screen report-screen">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>総合アセスメントレポート</h2>
            <p className="sub report-meta">
              利用者ID：{user.id}　｜　集計期間：{period}
              <br />
              セッション {sessions.length}回・問題 {totalTrials}問　｜　作成日：{fmtDateTime(new Date().toISOString())}　｜　{APP_NAME}
            </p>
          </div>
          <div className="panel-actions no-print">
            <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
              印刷（A4）
            </button>
            <button type="button" className="btn btn-secondary" onClick={exportJSON}>
              JSON出力
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => downloadCSV(`pcwa_report_${user.id}_${dateStamp()}.csv`, trialsToCSV(sessions))}
            >
              CSV出力
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => navigate({ name: 'mode' })}>
              もどる
            </button>
          </div>
        </div>
        {sessions.length === 0 && (
          <p className="sub">まだ記録がありません。課題を実施すると、ここに集計が表示されます。</p>
        )}
      </section>

      {sessions.length > 0 && (
        <>
          <section className="panel report-section">
            <h3>1. 5種目プロフィール（得意・不得意の見える化）</h3>
            <div className="report-radar-row">
              <RadarChart axes={radarAxes} />
              <table className="detail-table report-profile-table">
                <thead>
                  <tr>
                    <th>種目</th>
                    <th>めやすLv</th>
                    <th>根拠</th>
                    <th>回数</th>
                    <th>正答率</th>
                    <th>平均時間</th>
                  </tr>
                </thead>
                <tbody>
                  {report.profiles.map((p) => (
                    <tr key={p.taskType}>
                      <th>{TASK_NAMES[p.taskType]}</th>
                      <td>
                        {p.estimate ?? '-'}
                        {p.estimate != null && p.provisional ? '（暫定）' : ''}
                      </td>
                      <td>{p.source === 'adaptive' ? '自動調整' : p.source === 'fixed' ? '固定Lv実績' : '-'}</td>
                      <td>{p.sessions}</td>
                      <td>{fmtPct(p.accuracy)}</td>
                      <td>{fmtSec(p.avgSec)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sub">
              めやすLvは、適応モード（自動調整）の推定値、なければ正答率70%以上で取り組めた固定レベルの実績です。未実施の種目は表示されません。
            </p>
          </section>

          {report.scatter.length > 0 && (
            <section className="panel report-section">
              <h3>2. 速度と正確性のバランス</h3>
              <ScatterChart points={report.scatter} taskOrder={TASK_ORDER} />
              <p className="sub">
                1点が1セッション（直近{report.scatter.length}回）。右上＝時間をかけて正確、左上＝速くて正確、左下＝速さを優先する傾向、の見方ができます。どの位置にも良し悪しはなく、合う作業の種類を考える材料です。
              </p>
            </section>
          )}

          {report.endurance && (
            <section className="panel report-section">
              <h3>3. 持続性（セッション前半と後半のくらべ）</h3>
              <table className="mini-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>正答率</th>
                    <th>1問あたり平均時間</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>前半</th>
                    <td>{fmtPct(report.endurance.firstAcc)}</td>
                    <td>{fmtSec(report.endurance.firstSec)}</td>
                  </tr>
                  <tr>
                    <th>後半</th>
                    <td>{fmtPct(report.endurance.secondAcc)}</td>
                    <td>{fmtSec(report.endurance.secondSec)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="sub">
                6問以上のセッション{report.endurance.sessionsUsed}回分の集計です。後半に正答率の低下や時間の延びが大きい場合、こまめな休憩や作業時間の調整が合う可能性があります。
              </p>
            </section>
          )}

          <section className="panel report-section">
            <h3>4. 学習曲線（同じ課題のくり返しによる変化）</h3>
            {report.learning.length === 0 ? (
              <p className="sub">
                同じ種目・同じレベルを3回以上くり返すと、ここに推移が表示されます（訓練モードの反復で記録されます）。
              </p>
            ) : (
              <div className="learning-row">
                {report.learning.map((series) => (
                  <LearningChart key={`${series.taskType}-${series.level}`} series={series} />
                ))}
              </div>
            )}
          </section>

          <section className="panel report-section">
            <h3>5. エラー傾向と配慮の参考例</h3>
            {report.errors.length === 0 ? (
              <p>記録されたエラーはありません。</p>
            ) : (
              <div className="advice-list">
                {report.errors.slice(0, 5).map(({ code, count }) => (
                  <div className="advice-row" key={code}>
                    <div className="advice-head">
                      <span className="advice-label">{ERROR_LABELS[code] ?? code}</span>
                      <span className="advice-count">{count}件</span>
                    </div>
                    {ERROR_ADVICE[code] && <p className="advice-text">{ERROR_ADVICE[code]}</p>}
                  </div>
                ))}
              </div>
            )}
            <p className="sub">
              ※ いずれも実測データからの「可能性」の提示です。本人のようす・体調・環境によって見え方は変わります。支援者の観察と合わせて判断してください。
            </p>
          </section>

          {selfEvalRows.length > 0 && (
            <section className="panel report-section">
              <h3>6. 自己評価と実測のくらべ（自己理解の材料）</h3>
              <table className="detail-table">
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>課題</th>
                    <th>実測の正答率</th>
                    <th>本人：むずかしさ</th>
                    <th>本人：できばえ</th>
                  </tr>
                </thead>
                <tbody>
                  {selfEvalRows.map((r, i) => (
                    <tr key={i}>
                      <td>{fmtDateTime(r.date)}</td>
                      <td>{r.label}</td>
                      <td>{fmtPct(r.accuracy)}</td>
                      <td>{r.difficulty != null ? SELFEVAL_DIFFICULTY[r.difficulty - 1] : '-'}</td>
                      <td>{r.performance != null ? SELFEVAL_PERFORMANCE[r.performance - 1] : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="sub">自己評価と実測のずれは「できていないこと」ではなく、本人と一緒にふり返るときの話題になります。</p>
            </section>
          )}
        </>
      )}

      <section className="panel report-section">
        <h3>所見メモ（支援者の観察・自由記述）</h3>
        <textarea
          className="note-area no-print"
          rows={4}
          placeholder="数値にあらわれない観察（取り組む姿勢、疲れのサイン、有効だった声かけなど）を記録できます。氏名などの個人情報は書かないでください。"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="print-only report-note-print">{user.reportNote || note || '（記入なし）'}</div>
        <div className="panel-actions no-print">
          {noteSaved && <span className="save-ok" role="status">保存しました</span>}
          <button type="button" className="btn btn-secondary" onClick={saveNote}>
            メモを保存
          </button>
        </div>
      </section>

      <section className="panel report-section">
        <p className="disclaimer">
          本レポートはPC事務作業のようすを知るための参考資料であり、能力や適性を確定的に判定するものではありません。
          結果は実施時の体調・環境・課題への慣れの影響を受けます。本人・支援者の観察、ほかのアセスメントと合わせて、
          働き方や必要な配慮を一緒に考える材料としてご活用ください。
        </p>
      </section>
    </div>
  );
}
