import { useRef, useState } from 'react';
import { TASK_NAMES, TASK_ORDER } from '../constants';
import { useApp } from '../store/AppContext';
import { dateStamp, downloadCSV, downloadJSON, fmtDateTime, trialsToCSV } from '../store/exporter';
import { storageUsageBytes, STORAGE_LIMIT_BYTES } from '../store/storage';
import { TASKS } from '../tasks/registry';

/** 数値入力の検証：空欄や数値でない入力は無視して現在値を維持し、範囲外はクランプする */
function numOr(value: string, min: number, max: number, fallback: number): number {
  if (value.trim() === '') return fallback; // Number('') は 0 になるため明示的に除外
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

const PIN_PATTERN = /^\d{4,8}$/;

/**
 * 管理画面の合言葉（PIN）ゲート。
 * 目的は誤操作・いたずら防止であり、セキュリティ機能ではない
 * （PINは平文で保存され、詳しい人ならブラウザの開発ツールで読める）。
 */
function AdminGate({
  pin,
  onSetPin,
  onUnlock,
  onResetPin,
  onBack,
}: {
  pin: string | undefined;
  onSetPin: (pin: string) => void;
  onUnlock: () => void;
  onResetPin: () => void;
  onBack: () => void;
}) {
  const [input, setInput] = useState('');
  const [confirm, setConfirm] = useState('');
  const [resetText, setResetText] = useState('');
  const [mode, setMode] = useState<'enter' | 'reset'>('enter');
  const [error, setError] = useState<string | null>(null);

  // --- 初回：PINの設定 ---
  if (!pin) {
    const trySet = () => {
      if (!PIN_PATTERN.test(input)) {
        setError('PINは4〜8桁の数字で設定してください');
        return;
      }
      if (input !== confirm) {
        setError('確認用のPINが一致しません');
        return;
      }
      onSetPin(input);
    };
    return (
      <div className="screen">
        <section className="panel gate-panel">
          <h2>管理画面のPIN（合言葉）を設定してください</h2>
          <p className="sub">
            はじめて管理画面を使うため、支援員共通のPINを決めます。設定後は、管理画面に入るときにこのPINが必要になります。
            <br />
            ※ 誤操作・いたずら防止のための仕組みです。PINを忘れてもデータは消えません。
          </p>
          <div className="form-group">
            <label className="input-row">
              <span>PIN（4〜8桁の数字）</span>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            </label>
            <label className="input-row">
              <span>もう一度入力</span>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) trySet();
                }}
              />
            </label>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="panel-actions">
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              もどる
            </button>
            <button type="button" className="btn btn-primary btn-lg" onClick={trySet}>
              このPINで設定する
            </button>
          </div>
        </section>
      </div>
    );
  }

  // --- PINリセット ---
  if (mode === 'reset') {
    const tryReset = () => {
      if (resetText.trim() !== 'リセット') {
        setError('「リセット」と入力してください');
        return;
      }
      onResetPin();
      setMode('enter');
      setInput('');
      setConfirm('');
      setResetText('');
      setError(null);
    };
    return (
      <div className="screen">
        <section className="panel gate-panel">
          <h2>PINの初期化</h2>
          <p className="sub">
            PINだけを初期化します。<strong>記録データは消えません。</strong>
            初期化すると、次に管理画面を開くときに新しいPINを設定します。
          </p>
          <label className="input-row">
            <span>確認のため「リセット」と入力</span>
            <input type="text" value={resetText} onChange={(e) => setResetText(e.target.value)} />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="panel-actions">
            <button type="button" className="btn btn-ghost" onClick={() => { setMode('enter'); setError(null); }}>
              やめる
            </button>
            <button type="button" className="btn btn-danger" onClick={tryReset}>
              PINを初期化する
            </button>
          </div>
        </section>
      </div>
    );
  }

  // --- 通常：PIN入力 ---
  const tryUnlock = () => {
    if (input === pin) {
      onUnlock();
    } else {
      setError('PINがちがいます');
      setInput('');
    }
  };
  return (
    <div className="screen">
      <section className="panel gate-panel">
        <h2>管理画面（支援者用）</h2>
        <p className="sub">支援員共通のPINを入力してください。</p>
        <label className="input-row">
          <span>PIN</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) tryUnlock();
            }}
          />
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="panel-actions">
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            もどる
          </button>
          <button type="button" className="btn btn-primary btn-lg" onClick={tryUnlock}>
            入る
          </button>
        </div>
        <p className="sub gate-reset-link">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMode('reset'); setError(null); }}>
            PINを忘れた場合（データは消えません）
          </button>
        </p>
      </section>
    </div>
  );
}

export function AdminScreen() {
  const { doc, navigate, deleteUser, updateDefaults, updateSettings, importData, clearAll } = useApp();
  const defs = doc.settings.defaults;
  const [unlocked, setUnlocked] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!unlocked) {
    return (
      <AdminGate
        pin={doc.settings.adminPin}
        onSetPin={(p) => {
          updateSettings({ adminPin: p });
          setUnlocked(true);
        }}
        onUnlock={() => setUnlocked(true)}
        onResetPin={() => updateSettings({ adminPin: undefined })}
        onBack={() => navigate({ name: 'top' })}
      />
    );
  }

  const onDeleteUser = (id: string) => {
    const count = doc.sessions.filter((s) => s.userId === id).length;
    const aCount = doc.assessments.filter((a) => a.userId === id).length;
    const detail = aCount > 0 ? `セッション${count}件・総合アセスメント${aCount}件` : `セッション${count}件`;
    if (window.confirm(`利用者「${id}」とその${detail}を削除します。よろしいですか？`)) {
      deleteUser(id);
      setMessage(`利用者「${id}」を削除しました`);
    }
  };

  const onImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = importData(String(reader.result ?? ''));
      if (typeof result === 'string') setMessage(result);
      else setMessage(`インポートしました（利用者 ${result.users}件・セッション ${result.sessions}件を追加）`);
    };
    reader.readAsText(file);
  };

  const onClearAll = () => {
    if (!window.confirm('すべての利用者・セッションデータを削除します。よろしいですか？')) return;
    const pinInput = window.prompt('確認のため、管理画面のPINを入力してください');
    if (pinInput === null) return;
    if (pinInput !== doc.settings.adminPin) {
      setMessage('PINが一致しないため、削除を中止しました');
      return;
    }
    clearAll();
    setMessage('すべてのデータを削除しました');
  };

  const usage = storageUsageBytes();
  const usagePct = Math.min(100, Math.round((usage / STORAGE_LIMIT_BYTES) * 100));

  return (
    <div className="screen">
      <section className="panel">
        <div className="panel-head">
          <h2>管理画面（支援者用）</h2>
          <button type="button" className="btn btn-ghost" onClick={() => navigate({ name: 'top' })}>
            トップへもどる
          </button>
        </div>
        {message && (
          <div className="banner" role="status">
            <span>{message}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMessage(null)}>
              閉じる
            </button>
          </div>
        )}
      </section>

      <section className="panel">
        <h3>利用者の一覧</h3>
        {doc.users.length === 0 ? (
          <p className="sub">登録されている利用者はいません。</p>
        ) : (
          <table className="detail-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>セッション数</th>
                <th>最終実施</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {doc.users.map((u) => {
                const ss = doc.sessions.filter((s) => s.userId === u.id);
                const last = ss.map((s) => s.startedAt).sort().pop();
                return (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{ss.length}</td>
                    <td>{last ? fmtDateTime(last) : '-'}</td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDeleteUser(u.id)}>
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h3>適応モードの既定値</h3>
        <p className="sub">新しいセッションを設定するときの初期値です（セッションごとに変更できます）。</p>
        <div className="form-group defaults-grid">
          <label className="input-row">
            <span>連続正解でレベル+1（N問）</span>
            <input
              type="number"
              min={1}
              max={10}
              value={defs.nUp}
              onChange={(e) => updateDefaults({ nUp: numOr(e.target.value, 1, 10, defs.nUp) })}
            />
          </label>
          <label className="input-row">
            <span>直近の問題数（M問）</span>
            <input
              type="number"
              min={1}
              max={10}
              value={defs.mWindow}
              onChange={(e) => {
                const m = numOr(e.target.value, 1, 10, defs.mWindow);
                // K ≤ M を常に保つ
                updateDefaults({ mWindow: m, kDown: Math.min(defs.kDown, m) });
              }}
            />
          </label>
          <label className="input-row">
            <span>そのうち誤答K問でレベル-1</span>
            <input
              type="number"
              min={1}
              max={defs.mWindow}
              value={defs.kDown}
              onChange={(e) => updateDefaults({ kDown: numOr(e.target.value, 1, defs.mWindow, defs.kDown) })}
            />
          </label>
          <label className="input-row">
            <span>収束とみなす折り返し回数</span>
            <input
              type="number"
              min={1}
              max={12}
              value={defs.reversalTarget}
              onChange={(e) => updateDefaults({ reversalTarget: numOr(e.target.value, 1, 12, defs.reversalTarget) })}
            />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={defs.practice} onChange={(e) => updateDefaults({ practice: e.target.checked })} />
            <span>練習問題を既定でオン</span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={defs.feedback} onChange={(e) => updateDefaults({ feedback: e.target.checked })} />
            <span>1問ごとの正誤表示を既定でオン</span>
          </label>
        </div>
      </section>

      <section className="panel">
        <h3>データ管理</h3>
        <p className="sub">
          データはこのPCのこのブラウザ内にのみ保存されます。バックアップやPC間の移動にはJSONエクスポート／インポートを使ってください。
        </p>
        <div className="capacity-row">
          <span className="sub">保存容量のめやす：</span>
          <span className="capacity-track" aria-hidden="true">
            <span
              className={'capacity-fill' + (usagePct >= 70 ? ' capacity-warn' : '')}
              style={{ width: `${Math.max(2, usagePct)}%` }}
            />
          </span>
          <span className="sub capacity-label">
            {(usage / 1024).toFixed(0)} KB / 約{Math.round(STORAGE_LIMIT_BYTES / 1024 / 1024)}MB（{usagePct}%）
          </span>
        </div>
        {usagePct >= 70 && (
          <p className="form-error">
            容量が残り少なくなっています。JSONエクスポートでバックアップした上で、古い利用者の記録を削除してください。
          </p>
        )}
        <div className="panel-actions wrap">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => downloadJSON(`pcwa_all_${dateStamp()}.json`, doc)}
          >
            全データをJSONエクスポート
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => downloadCSV(`pcwa_all_${dateStamp()}.csv`, trialsToCSV(doc.sessions))}
          >
            全データをCSVエクスポート
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
            JSONをインポート（マージ）
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = '';
            }}
          />
          <button type="button" className="btn btn-danger" onClick={onClearAll}>
            全データを削除
          </button>
        </div>
      </section>

      <section className="panel">
        <h3>種目別の標準時間（目安）</h3>
        <p className="sub">アセスメント（総合）モードの時間配分に使われる、1問あたりの標準所要時間です。</p>
        <table className="detail-table">
          <thead>
            <tr>
              <th>種目</th>
              {Array.from({ length: 10 }, (_, i) => (
                <th key={i}>L{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TASK_ORDER.map((t) => {
              const mod = TASKS[t];
              return (
                <tr key={t}>
                  <th>{TASK_NAMES[t]}</th>
                  {Array.from({ length: 10 }, (_, i) =>
                    mod ? <td key={i}>{mod.stdSeconds(i + 1)}秒</td> : <td key={i}>-</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
