import { useEffect, useRef, useState } from 'react';
import type { TaskComponentProps } from '../taskModule';
import type { NumericProblem } from './generator';

/**
 * 数値入力課題のUI。
 * 上：伝票（表示のみ） ／ 下：転記入力欄。
 * Enter で次の欄へ、最後の欄の Enter（または「次へ」）で確定。
 */
export function NumericTask({ problem, disabled, onSubmit }: TaskComponentProps<NumericProblem, string[]>) {
  const flat = problem.rows.flat();
  const cols = problem.rows[0].length;
  const multiRow = problem.rows.length > 1;
  const [vals, setVals] = useState<string[]>(() => flat.map(() => ''));
  const [imeHint, setImeHint] = useState(false);
  const editsRef = useRef(0);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const submittedRef = useRef(false);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const submit = () => {
    if (disabled || submittedRef.current) return;
    submittedRef.current = true;
    onSubmit(vals, { editCount: editsRef.current });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      editsRef.current += 1;
      return;
    }
    if (e.key === 'Enter') {
      if (e.nativeEvent.isComposing) return; // IME確定のEnterは無視
      e.preventDefault();
      if (idx < flat.length - 1) {
        inputsRef.current[idx + 1]?.focus();
      } else {
        submit();
      }
    }
  };

  const setVal = (idx: number, v: string) => {
    setVals((prev) => {
      const next = [...prev];
      next[idx] = v;
      return next;
    });
  };

  return (
    <div className="task-numeric">
      <div className="voucher" aria-label="入力伝票">
        <div className="voucher-title">入力伝票</div>
        {multiRow ? (
          <table className="voucher-table">
            <thead>
              <tr>
                <th></th>
                {problem.rows[0].map((f, i) => (
                  <th key={i}>{f.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {problem.rows.map((row, r) => (
                <tr key={r}>
                  <th>{r + 1}行目</th>
                  {row.map((f, i) => (
                    <td key={i} className="num">
                      {f.value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <dl className="voucher-list">
            {flat.map((f, i) => (
              <div className="voucher-row" key={i}>
                <dt>{f.label}</dt>
                <dd className="num">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="answer-area">
        <div className="answer-caption">上の伝票と同じように入力してください（カンマ・ハイフン・小数点も含む）</div>
        {problem.rows.map((row, r) => (
          <div className="inputs-grid" key={r}>
            {multiRow && <div className="inputs-rowlabel">{r + 1}行目</div>}
            {row.map((f, i) => {
              const idx = r * cols + i;
              return (
                <label className="input-row" key={i}>
                  <span>{f.label}</span>
                  <input
                    ref={(el) => {
                      inputsRef.current[idx] = el;
                    }}
                    type="text"
                    className="num-input"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={disabled}
                    value={vals[idx]}
                    onChange={(e) => setVal(idx, e.target.value)}
                    onKeyDown={(e) => onKeyDown(e, idx)}
                    onPaste={(e) => e.preventDefault()}
                    onCompositionStart={() => setImeHint(true)}
                  />
                </label>
              );
            })}
          </div>
        ))}
        {imeHint && (
          <div className="ime-hint" role="status">
            ※ 日本語入力（IME）がオンのようです。半角で入力してください。
          </div>
        )}
        <div className="answer-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={submit} disabled={disabled}>
            次へ（Enter）
          </button>
        </div>
      </div>
    </div>
  );
}
