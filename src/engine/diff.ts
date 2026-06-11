// 文字単位の編集スクリプト（Levenshtein 経路復元）。
// エラー分類（置換・脱字・余分・入れかわり）の材料にする。

export type EditOp =
  | { op: 'sub'; a: string; b: string; i: number }
  | { op: 'del'; a: string; i: number }
  | { op: 'ins'; b: string; i: number };

export function editOps(a: string, b: string): EditOp[] {
  const n = a.length;
  const m = b.length;
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  const ops: EditOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      if (a[i - 1] !== b[j - 1]) ops.push({ op: 'sub', a: a[i - 1], b: b[j - 1], i: i - 1 });
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      ops.push({ op: 'del', a: a[i - 1], i: i - 1 });
      i--;
    } else {
      ops.push({ op: 'ins', b: b[j - 1], i });
      j--;
    }
  }
  return ops.reverse();
}
