import { useEffect, useRef, useState } from 'react';
import type { TaskComponentProps } from '../taskModule';
import type { TextProblem } from './generator';

/**
 * 文書入力課題のUI。
 * 上：見本の文章（コピー不可） ／ 下：入力欄（IME使用可）。
 * 変換中でない Enter（または「次へ」）で確定。貼り付けは無効。
 */
export function TextTask({ problem, disabled, onSubmit }: TaskComponentProps<TextProblem, string>) {
  const [val, setVal] = useState('');
  const editsRef = useRef(0);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    areaRef.current?.focus();
  }, []);

  const submit = () => {
    if (disabled || submittedRef.current) return;
    submittedRef.current = true;
    onSubmit(val, { editCount: editsRef.current });
  };

  const rows = problem.text.length > 120 ? 6 : problem.text.length > 60 ? 4 : 3;

  return (
    <div className="task-text">
      <div className="text-problem" onCopy={(e) => e.preventDefault()} aria-label="見本の文章">
        {problem.text}
      </div>
      <div className="answer-area">
        <div className="answer-caption">
          上の文章と同じように入力してください（漢字・カタカナ・数字・記号も表示のとおり）
        </div>
        <textarea
          ref={areaRef}
          className="text-input"
          rows={rows}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onPaste={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' || e.key === 'Delete') {
              editsRef.current += 1;
              return;
            }
            if (e.key === 'Enter') {
              if (e.nativeEvent.isComposing) return; // 変換確定のEnterは無視
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="char-counter">
          {val.length} / {problem.text.length} 文字
        </div>
        <div className="answer-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={submit} disabled={disabled}>
            次へ（Enter）
          </button>
        </div>
      </div>
    </div>
  );
}
