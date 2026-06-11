import { TASK_NAMES, TASK_ORDER } from '../constants';
import { TASKS } from '../tasks/registry';
import { useApp } from '../store/AppContext';

export function ModeSelect() {
  const { navigate, currentUserId } = useApp();
  const implementedCount = TASK_ORDER.filter((t) => TASKS[t]).length;

  return (
    <div className="screen">
      <section className="panel">
        <div className="panel-head">
          <h2>モードの選択</h2>
          <div>
            <span className="chip">利用者: {currentUserId}</span>{' '}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate({ name: 'top' })}>
              変更
            </button>
          </div>
        </div>

        <div className="mode-grid">
          <button
            type="button"
            className="mode-card"
            disabled={implementedCount < 5}
            onClick={() => navigate({ name: 'setup', mode: 'assessment' })}
          >
            <div className="mode-title">アセスメント（総合）</div>
            <div className="mode-desc">
              5種目を順番に短時間ずつ実施し、種目ごとのめやすレベルと通し結果をまとめます。
              {implementedCount < 5 && (
                <>
                  <br />
                  <strong>※ 全5種目の実装後に有効になります（現在 {implementedCount}/5 種目）</strong>
                </>
              )}
            </div>
          </button>

          <button type="button" className="mode-card" onClick={() => navigate({ name: 'setup', mode: 'training' })}>
            <div className="mode-title">訓練（種目べつ）</div>
            <div className="mode-desc">種目・レベル・時間を選んで、固定レベルで反復練習します。</div>
          </button>

          <button type="button" className="mode-card" onClick={() => navigate({ name: 'setup', mode: 'adaptive' })}>
            <div className="mode-title">適応（レベル自動調整）</div>
            <div className="mode-desc">
              成績に合わせて問題のレベルが自動で変わり、安定して取り組めるレベルのめやすを測ります。
            </div>
          </button>

          <button type="button" className="mode-card" onClick={() => navigate({ name: 'history' })}>
            <div className="mode-title">これまでの結果</div>
            <div className="mode-desc">この利用者IDの過去セッションの一覧と結果を表示します。</div>
          </button>

          <button type="button" className="mode-card" onClick={() => navigate({ name: 'report' })}>
            <div className="mode-title">総合レポート</div>
            <div className="mode-desc">
              全セッションを集計し、5種目プロフィール・速度と正確性・学習曲線・エラー傾向をまとめます（A4印刷可）。
            </div>
          </button>
        </div>

        <div className="task-status">
          <span className="sub">種目の実装状況：</span>
          {TASK_ORDER.map((t) => (
            <span key={t} className={'chip' + (TASKS[t] ? ' chip-ok' : ' chip-off')}>
              {TASK_NAMES[t]}
              {TASKS[t] ? '' : '（準備中）'}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
