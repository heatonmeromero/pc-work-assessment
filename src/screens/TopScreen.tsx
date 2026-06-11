import { useState } from 'react';
import { useApp } from '../store/AppContext';

export function TopScreen() {
  const { doc, navigate, currentUserId, setCurrentUser, addUser, recoveredSessionId, dismissRecovered } = useApp();
  const [newId, setNewId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onAdd = () => {
    const err = addUser(newId);
    setError(err);
    if (!err) {
      setCurrentUser(newId.trim());
      setNewId('');
    }
  };

  const sortedUsers = [...doc.users].sort((a, b) => a.id.localeCompare(b.id, 'ja'));

  return (
    <div className="screen">
      {recoveredSessionId && (
        <div className="banner" role="status">
          <span>前回中断されたセッションのデータを保存しました（履歴から確認できます）。</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={dismissRecovered}>
            閉じる
          </button>
        </div>
      )}

      <section className="panel">
        <h2>利用者の選択</h2>
        <p className="sub">
          氏名は使わず、任意のID（例：A-01）で記録します。個人情報はこのアプリに保存されません。
        </p>

        {sortedUsers.length > 0 && (
          <div className="user-list">
            {sortedUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                className={'chip-btn' + (currentUserId === u.id ? ' selected' : '')}
                aria-pressed={currentUserId === u.id}
                onClick={() => setCurrentUser(u.id)}
              >
                {u.id}
              </button>
            ))}
          </div>
        )}

        <div className="new-user-row">
          <label className="input-row">
            <span>新しいID</span>
            <input
              type="text"
              value={newId}
              placeholder="例：A-01"
              maxLength={20}
              onChange={(e) => setNewId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) onAdd();
              }}
            />
          </label>
          <button type="button" className="btn btn-secondary" onClick={onAdd}>
            追加して選択
          </button>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}

        <div className="panel-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={!currentUserId}
            onClick={() => navigate({ name: 'mode' })}
          >
            {currentUserId ? `${currentUserId} さんで進む` : '利用者を選んでください'}
          </button>
        </div>
      </section>

      <div className="top-footer">
        <button type="button" className="btn btn-ghost" onClick={() => navigate({ name: 'admin' })}>
          管理画面（支援者用）
        </button>
      </div>
    </div>
  );
}
