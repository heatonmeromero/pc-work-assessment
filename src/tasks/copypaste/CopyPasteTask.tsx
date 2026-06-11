import { useEffect, useRef, useState } from 'react';
import type { TaskComponentProps } from '../taskModule';
import type { CpProblem } from './generator';
import { emptyOps, normalizeCp } from './score';
import type { CpAnswer, CpOps } from './score';

/**
 * コピー＆ペースト課題のUI。
 * 左：元データ（選択・コピー可） ／ 右：貼り付け先フォーム。
 * 操作ログを収集する：選択やり直し・コピー/貼り付け回数・
 * ショートカット（Ctrl+C/V）かメニュー経由か・貼り間違い・手入力キー数。
 */
export function CopyPasteTask({ problem, disabled, onSubmit }: TaskComponentProps<CpProblem, CpAnswer>) {
  const [vals, setVals] = useState<string[]>(() => problem.targets.map(() => ''));
  const opsRef = useRef<CpOps>(emptyOps());
  const editsRef = useRef(0);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const lastShortcutRef = useRef<{ key: string; t: number }>({ key: '', t: 0 });
  const lastSelectionRef = useRef('');
  const submittedRef = useRef(false);

  // 文書レベルのイベント（コピー検出・ショートカット検出・選択検出）
  useEffect(() => {
    const inSource = (node: Node | null): boolean =>
      !!node && !!sourceRef.current && sourceRef.current.contains(node);

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x'].includes(e.key.toLowerCase())) {
        lastShortcutRef.current = { key: e.key.toLowerCase(), t: Date.now() };
      }
    };
    const byShortcut = (key: string): boolean =>
      lastShortcutRef.current.key === key && Date.now() - lastShortcutRef.current.t < 400;

    const onCopy = () => {
      const sel = window.getSelection();
      if (!sel || !inSource(sel.anchorNode)) return;
      opsRef.current.copies++;
      if (byShortcut('c') || byShortcut('x')) opsRef.current.copyKeyboard++;
      else opsRef.current.copyMenu++;
    };

    const onMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || !inSource(sel.anchorNode)) return;
      const text = sel.toString();
      if (text && text !== lastSelectionRef.current) {
        opsRef.current.selections++;
        lastSelectionRef.current = text;
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('copy', onCopy);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const submit = () => {
    if (disabled || submittedRef.current) return;
    submittedRef.current = true;
    onSubmit({ values: vals, ops: { ...opsRef.current } }, { editCount: editsRef.current });
  };

  const setVal = (i: number, v: string) => {
    setVals((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  };

  const onPasteField = (e: React.ClipboardEvent<HTMLInputElement>, i: number) => {
    // 貼り付けはこの課題の主役なので妨げない（記録だけ取る）
    const text = e.clipboardData.getData('text');
    opsRef.current.pastes++;
    const byShortcut =
      lastShortcutRef.current.key === 'v' && Date.now() - lastShortcutRef.current.t < 400;
    if (byShortcut) opsRef.current.pasteKeyboard++;
    else opsRef.current.pasteMenu++;
    if (normalizeCp(text) !== problem.targets[i].expected) opsRef.current.wrongPastes++;
  };

  const onKeyDownField = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      editsRef.current++;
      return;
    }
    // 修飾キーなしの印字キー＝手入力
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      opsRef.current.manualKeystrokes++;
    }
  };

  const filled = vals.filter((v) => v.trim() !== '').length;

  return (
    <div className="task-copypaste">
      <div className="answer-caption">
        左のデータから指定された項目をさがし、文字を選択してコピー（Ctrl+C）し、右の欄に貼り付け（Ctrl+V）てください。右クリックのメニューも使えます。
      </div>
      <div className="cp-pair">
        <div className="cp-source" ref={sourceRef} aria-label="元データ">
          <div className="cp-source-title">元データ</div>
          {problem.mode === 'list' ? (
            <dl className="cp-list">
              {problem.listItems!.map((item, i) => (
                <div className="cp-list-row" key={i}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <table className="cp-table">
              <thead>
                <tr>
                  {problem.columns!.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {problem.rows!.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c} className={problem.columns![c] === '備考' ? 'cp-note' : ''}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="cp-form" aria-label="貼り付け先">
          <div className="cp-source-title">貼り付け先</div>
          {problem.targets.map((target, i) => (
            <label className="cp-field" key={i}>
              <span className="cp-field-label">
                {i + 1}. {target.label}
              </span>
              <input
                type="text"
                className="cp-input"
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                value={vals[i]}
                onChange={(e) => setVal(i, e.target.value)}
                onPaste={(e) => onPasteField(e, i)}
                onKeyDown={onKeyDownField}
              />
            </label>
          ))}
          <div className="cp-footer">
            <span className="sf-changed-count">
              入力済み：{filled} / {problem.targets.length}
            </span>
            <button type="button" className="btn btn-primary btn-lg" onClick={submit} disabled={disabled}>
              次へ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
