import { useMemo, useRef, useState } from 'react';
import type { TaskComponentProps } from '../taskModule';
import type { SearchFixProblem, SfColKind } from './generator';

/**
 * 検索修正課題のUI。
 * 左：原本（正しいデータ・編集不可） ／ 右：修正対象（誤りを含む・編集可）。
 * 同じ行どうしを見くらべ、ちがう箇所を右側で直して「確認する」。
 */
export function SearchFixTask({ problem, disabled, onSubmit }: TaskComponentProps<SearchFixProblem, string[][]>) {
  const [vals, setVals] = useState<string[][]>(() => problem.presented.map((row) => [...row]));
  const editsRef = useRef(0);
  const submittedRef = useRef(false);

  const changedCount = useMemo(() => {
    let n = 0;
    for (let r = 0; r < vals.length; r++) {
      for (let c = 0; c < vals[r].length; c++) {
        if (vals[r][c] !== problem.presented[r][c]) n++;
      }
    }
    return n;
  }, [vals, problem.presented]);

  const submit = () => {
    if (disabled || submittedRef.current) return;
    submittedRef.current = true;
    onSubmit(vals, { editCount: editsRef.current });
  };

  const setVal = (r: number, c: number, v: string) => {
    setVals((prev) => {
      const next = prev.map((row) => [...row]);
      next[r][c] = v;
      return next;
    });
  };

  const alignClass = (kind: SfColKind) => (kind === 'qty' || kind === 'amount' ? ' sf-num' : '');

  return (
    <div className="task-searchfix">
      <div className="answer-caption">
        左の「原本」と右の「修正対象」を見くらべ、ちがっている箇所を右側だけ直してください。
        正しく直したら「確認する」を押します。
      </div>

      <div className="sf-scroll">
        <div className="sf-pair">
          <table className="sf-table sf-original" aria-label="原本（正しいデータ）">
            <thead>
              <tr>
                <th className="sf-rownum">行</th>
                <th className="sf-side-th" colSpan={problem.columns.length}>
                  原本（正しい）
                </th>
              </tr>
              <tr>
                <th className="sf-rownum"></th>
                {problem.columns.map((col) => (
                  <th key={col.key} className={alignClass(col.kind)}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {problem.original.map((row, r) => (
                <tr key={r}>
                  <th className="sf-rownum">{r + 1}</th>
                  {row.map((cell, c) => (
                    <td key={c} className={'sf-cell' + alignClass(problem.columns[c].kind)}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <table className="sf-table sf-target" aria-label="修正対象（直す側）">
            <thead>
              <tr>
                <th className="sf-rownum">行</th>
                <th className="sf-side-th sf-side-edit" colSpan={problem.columns.length}>
                  修正対象（ここを直す）
                </th>
              </tr>
              <tr>
                <th className="sf-rownum"></th>
                {problem.columns.map((col) => (
                  <th key={col.key} className={alignClass(col.kind)}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {problem.presented.map((row, r) => (
                <tr key={r}>
                  <th className="sf-rownum">{r + 1}</th>
                  {row.map((_, c) => {
                    const changed = vals[r][c] !== problem.presented[r][c];
                    return (
                      <td key={c} className={'sf-cell' + alignClass(problem.columns[c].kind)}>
                        <input
                          type="text"
                          className={'sf-input' + (changed ? ' sf-changed' : '') + alignClass(problem.columns[c].kind)}
                          value={vals[r][c]}
                          disabled={disabled}
                          autoComplete="off"
                          spellCheck={false}
                          aria-label={`${r + 1}行目 ${problem.columns[c].label}`}
                          onChange={(e) => setVal(r, c, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Backspace' || e.key === 'Delete') editsRef.current += 1;
                          }}
                          onPaste={(e) => e.preventDefault()}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sf-footer">
        <span className="sf-changed-count">直した箇所：{changedCount}</span>
        <button type="button" className="btn btn-primary btn-lg" onClick={submit} disabled={disabled}>
          確認する
        </button>
      </div>
    </div>
  );
}
