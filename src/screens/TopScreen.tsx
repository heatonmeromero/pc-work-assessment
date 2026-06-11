import { useState } from 'react';
import { useApp } from '../store/AppContext';

/** 氏名らしき入力（漢字・ひらがな・カタカナを含む）かどうか */
function looksLikeName(id: string): boolean {
  return /[一-鿿ぁ-ゖァ-ヺ]/.test(id);
}

/** 初回起動時の運用注意（1回だけ表示） */
function FirstRunNotice({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" role="dialog" aria-label="はじめにお読みください">
      <div className="modal-card">
        <h2>はじめに（支援者の方へ）</h2>
        <ul className="first-run-list">
          <li>
            <strong>利用者のIDは記号で。</strong>
            「A-01」のような記号のIDを使い、氏名は入力しないでください（個人情報を持たない設計を保つため）。
          </li>
          <li>
            <strong>所見メモに個人情報を書かない。</strong>
            氏名・診断名・家族情報などは記入しない運用でお願いします。
          </li>
          <li>
            <strong>記録は「このPCのこのブラウザ」にだけ保存されます。</strong>
            ブラウザの閲覧データを削除すると記録も消えます。残したい記録は、管理画面の
            JSONエクスポートで保存するか、レポートを印刷してください。
          </li>
          <li>
            <strong>結果は参考情報です。</strong>
            能力や適性を確定するものではなく、支援者の観察と合わせて活用してください。
          </li>
        </ul>
        <div className="panel-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={onClose}>
            わかりました
          </button>
        </div>
      </div>
    </div>
  );
}

export function TopScreen() {
  const { doc, navigate, currentUserId, setCurrentUser, addUser, recoveredSessionId, dismissRecovered, updateSettings } =
    useApp();
  const [newId, setNewId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nameWarning, setNameWarning] = useState<string | null>(null);

  const doAdd = (id: string) => {
    const err = addUser(id);
    setError(err);
    setNameWarning(null);
    if (!err) {
      setCurrentUser(id.trim());
      setNewId('');
    }
  };

  const onAdd = () => {
    const id = newId.trim();
    if (id && looksLikeName(id)) {
      setError(null);
      setNameWarning(id);
      return;
    }
    doAdd(newId);
  };

  const sortedUsers = [...doc.users].sort((a, b) => a.id.localeCompare(b.id, 'ja'));

  return (
    <div className="screen">
      {!doc.settings.onboardingDone && <FirstRunNotice onClose={() => updateSettings({ onboardingDone: true })} />}

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
        {nameWarning && (
          <div className="name-warning" role="alertdialog" aria-label="IDの確認">
            <p>
              「{nameWarning}」は氏名のように見えます。個人情報保護のため、
              <strong>「A-01」のような記号のID</strong>をおすすめします。このまま登録しますか？
            </p>
            <div className="panel-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setNameWarning(null)}>
                入力しなおす
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => doAdd(nameWarning)}>
                このまま登録する
              </button>
            </div>
          </div>
        )}

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
