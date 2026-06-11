import { TASK_NAMES } from '../constants';
import type { TaskType, TrialLog } from '../types';
import type { LearningSeries, ScatterPoint } from '../engine/report';

/**
 * 1問ごとの所要時間チャート（SVG手描き・依存ライブラリなし）。
 * 正誤は色＋記号の両方で示す（色覚多様性配慮）。
 */
export function TimelineChart({ trials }: { trials: TrialLog[] }) {
  if (trials.length === 0) return null;
  const W = 660;
  const H = 180;
  const padL = 40;
  const padR = 8;
  const padT = 12;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxSec = Math.max(1, ...trials.map((t) => t.durationMs / 1000));
  const slot = innerW / trials.length;
  const bw = Math.max(2, Math.min(28, slot - 3));
  const x = (i: number) => padL + slot * i + (slot - bw) / 2;
  const y = (s: number) => padT + innerH * (1 - s / maxSec);
  const showMarks = trials.length <= 40;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="1問ごとの所要時間と正誤">
        <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="var(--line)" />
        <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="var(--line)" />
        <text x={padL - 6} y={padT + 10} textAnchor="end" className="chart-label">
          {Math.ceil(maxSec)}秒
        </text>
        <text x={padL - 6} y={padT + innerH + 4} textAnchor="end" className="chart-label">
          0
        </text>
        {trials.map((t, i) => {
          const s = t.durationMs / 1000;
          return (
            <g key={i}>
              <rect
                x={x(i)}
                y={y(s)}
                width={bw}
                height={Math.max(1, padT + innerH - y(s))}
                fill={t.correct ? 'var(--c-ok)' : 'var(--c-ng)'}
              />
              {showMarks && (
                <text
                  x={x(i) + bw / 2}
                  y={H - 10}
                  textAnchor="middle"
                  className="chart-mark"
                  fill={t.correct ? 'var(--c-ok)' : 'var(--c-ng)'}
                >
                  {t.correct ? '○' : '×'}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        <span className="legend-ok">■ ○ 正解</span>
        <span className="legend-ng">■ × 相違あり</span>
        <span className="legend-note">横軸：問題の順番（左→右）／縦軸：所要時間</span>
      </div>
    </div>
  );
}

/** 適応モードのレベル推移チャート */
export function LevelChart({
  levels,
  reversals,
  estimate,
  maxLevel = 10,
}: {
  levels: number[];
  reversals: { trialIndex: number; level: number }[];
  estimate: number | null;
  maxLevel?: number;
}) {
  if (levels.length === 0) return null;
  const W = 660;
  const H = 180;
  const padL = 40;
  const padR = 8;
  const padT = 12;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i: number) => padL + (levels.length <= 1 ? innerW / 2 : (innerW / (levels.length - 1)) * i);
  const y = (lv: number) => padT + innerH * (1 - (lv - 1) / Math.max(1, maxLevel - 1));
  const points = levels.map((lv, i) => `${x(i)},${y(lv)}`).join(' ');
  const revSet = new Map(reversals.map((r) => [r.trialIndex, r.level]));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="レベルの推移">
        {[1, Math.ceil(maxLevel / 2), maxLevel].map((lv) => (
          <g key={lv}>
            <line x1={padL} y1={y(lv)} x2={W - padR} y2={y(lv)} stroke="var(--line)" strokeDasharray="2 4" />
            <text x={padL - 6} y={y(lv) + 4} textAnchor="end" className="chart-label">
              {lv}
            </text>
          </g>
        ))}
        {estimate != null && (
          <g>
            <line x1={padL} y1={y(estimate)} x2={W - padR} y2={y(estimate)} stroke="var(--c-accent)" strokeDasharray="6 4" strokeWidth={1.5} />
            <text x={W - padR} y={y(estimate) - 5} textAnchor="end" className="chart-label" fill="var(--c-accent)">
              推定 {estimate}
            </text>
          </g>
        )}
        <polyline points={points} fill="none" stroke="var(--c-ok)" strokeWidth={2} />
        {levels.map((lv, i) => (
          <circle key={i} cx={x(i)} cy={y(lv)} r={revSet.has(i) ? 5 : 2.5} fill={revSet.has(i) ? 'var(--c-ng)' : 'var(--c-ok)'} />
        ))}
      </svg>
      <div className="chart-legend">
        <span className="legend-ok">— 出題レベル</span>
        <span className="legend-ng">● 折り返し点</span>
        <span className="legend-note">横軸：問題の順番</span>
      </div>
    </div>
  );
}

/** 5種目プロフィールのレーダーチャート（手描きSVG） */
export function RadarChart({ axes }: { axes: { label: string; value: number | null; max: number }[] }) {
  const W = 440;
  const H = 380;
  const cx = W / 2;
  const cy = H / 2 + 4;
  const R = 128;
  const n = axes.length;
  const pt = (i: number, frac: number): [number, number] => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [cx + Math.cos(a) * R * frac, cy + Math.sin(a) * R * frac];
  };
  const poly = (frac: number) =>
    axes.map((_, i) => pt(i, frac).map((v) => v.toFixed(1)).join(',')).join(' ');
  const valuePoly = axes
    .map((ax, i) => pt(i, Math.max(0, Math.min(1, (ax.value ?? 0) / ax.max))).map((v) => v.toFixed(1)).join(','))
    .join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart chart-radar" role="img" aria-label="種目別のめやすレベル">
      {[0.2, 0.4, 0.6, 0.8, 1].map((f) => (
        <polygon key={f} points={poly(f)} fill="none" stroke="var(--line)" strokeWidth={f === 1 ? 1.5 : 1} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" />;
      })}
      <polygon points={valuePoly} fill="var(--c-accent)" fillOpacity={0.25} stroke="var(--c-accent)" strokeWidth={2} />
      {axes.map((ax, i) => {
        const [x, y] = pt(i, Math.max(0, Math.min(1, (ax.value ?? 0) / ax.max)));
        return <circle key={i} cx={x} cy={y} r={4} fill="var(--c-accent)" />;
      })}
      {axes.map((ax, i) => {
        const [x, y] = pt(i, 1.22);
        const anchor = Math.abs(x - cx) < 12 ? 'middle' : x > cx ? 'start' : 'end';
        return (
          <text key={i} x={x} y={y} textAnchor={anchor} className="chart-label radar-label">
            {ax.label}
            <tspan x={x} dy="1.2em" className="radar-value">
              {ax.value == null ? '未実施' : `Lv ${ax.value}`}
            </tspan>
          </text>
        );
      })}
      <text x={cx + 6} y={cy - R - 4} className="chart-label">
        10
      </text>
    </svg>
  );
}

const SCATTER_COLORS = ['#2563eb', '#b3261e', '#15803d', '#7c3aed', '#c2630a'];

function Mark({ shape, x, y, color, size = 5 }: { shape: number; x: number; y: number; color: string; size?: number }) {
  const s = size;
  switch (shape % 5) {
    case 0:
      return <circle cx={x} cy={y} r={s} fill={color} />;
    case 1:
      return <path d={`M ${x} ${y - s} L ${x + s} ${y + s} L ${x - s} ${y + s} Z`} fill={color} />;
    case 2:
      return <rect x={x - s} y={y - s} width={s * 2} height={s * 2} fill={color} />;
    case 3:
      return <path d={`M ${x} ${y - s} L ${x + s} ${y} L ${x} ${y + s} L ${x - s} ${y} Z`} fill={color} />;
    default:
      return (
        <path
          d={`M ${x - s} ${y - s} L ${x + s} ${y + s} M ${x - s} ${y + s} L ${x + s} ${y - s}`}
          stroke={color}
          strokeWidth={2.5}
          fill="none"
        />
      );
  }
}

/** 速度（標準時間比）×正確性の散布図 */
export function ScatterChart({ points, taskOrder }: { points: ScatterPoint[]; taskOrder: TaskType[] }) {
  const W = 660;
  const H = 320;
  const padL = 46;
  const padR = 14;
  const padT = 14;
  const padB = 44;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const X_MAX = 2.5;
  const x = (v: number) => padL + innerW * Math.min(1, v / X_MAX);
  const y = (v: number) => padT + innerH * (1 - v / 100);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="速度と正確性のバランス">
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="var(--line)" strokeDasharray="2 4" />
            <text x={padL - 6} y={y(v) + 4} textAnchor="end" className="chart-label">
              {v}%
            </text>
          </g>
        ))}
        {[0.5, 1, 1.5, 2].map((v) => (
          <g key={v}>
            <line
              x1={x(v)}
              y1={padT}
              x2={x(v)}
              y2={padT + innerH}
              stroke={v === 1 ? 'var(--sub)' : 'var(--line)'}
              strokeDasharray={v === 1 ? '6 4' : '2 4'}
            />
            <text x={x(v)} y={H - 26} textAnchor="middle" className="chart-label">
              {v === 1 ? '標準' : `×${v}`}
            </text>
          </g>
        ))}
        <text x={padL} y={H - 8} className="chart-label">
          ← 速い
        </text>
        <text x={W - padR} y={H - 8} textAnchor="end" className="chart-label">
          時間をかける →
        </text>
        {points.map((p, i) => {
          const ti = Math.max(0, taskOrder.indexOf(p.taskType));
          return <Mark key={i} shape={ti} x={x(p.speedIndex)} y={y(p.accuracy)} color={SCATTER_COLORS[ti % 5]} />;
        })}
      </svg>
      <div className="chart-legend">
        {taskOrder.map((t, i) => (
          <span key={t} className="legend-item">
            <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">
              <Mark shape={i} x={0} y={0} color={SCATTER_COLORS[i % 5]} size={5} />
            </svg>{' '}
            {TASK_NAMES[t]}
          </span>
        ))}
        <span className="legend-note">縦軸：正答率／横軸：1問あたり時間（その種目・レベルの標準時間との比）</span>
      </div>
    </div>
  );
}

/** 学習曲線（同種目・同レベルの反復推移。実線=正答率、点線=平均時間） */
export function LearningChart({ series }: { series: LearningSeries }) {
  const W = 460;
  const H = 210;
  const padL = 46;
  const padR = 52;
  const padT = 14;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = series.points.length;
  const maxSec = Math.max(1, ...series.points.map((p) => p.avgSec));
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (innerW / (n - 1)) * i);
  const yAcc = (v: number) => padT + innerH * (1 - v / 100);
  const ySec = (v: number) => padT + innerH * (1 - v / maxSec);
  const accLine = series.points.map((p, i) => `${x(i)},${yAcc(p.accuracy)}`).join(' ');
  const secLine = series.points.map((p, i) => `${x(i)},${ySec(p.avgSec)}`).join(' ');

  return (
    <div className="learning-chart">
      <div className="learning-title">
        {TASK_NAMES[series.taskType]} レベル{series.level}（{n}回）
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="学習曲線">
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={padL} y1={yAcc(v)} x2={W - padR} y2={yAcc(v)} stroke="var(--line)" strokeDasharray="2 4" />
            <text x={padL - 6} y={yAcc(v) + 4} textAnchor="end" className="chart-label">
              {v}%
            </text>
          </g>
        ))}
        <text x={W - padR + 6} y={ySec(maxSec) + 10} className="chart-label" fill="var(--c-ng)">
          {Math.round(maxSec)}秒
        </text>
        <text x={W - padR + 6} y={padT + innerH} className="chart-label" fill="var(--c-ng)">
          0
        </text>
        <polyline points={secLine} fill="none" stroke="var(--c-ng)" strokeWidth={1.8} strokeDasharray="5 4" />
        <polyline points={accLine} fill="none" stroke="var(--c-ok)" strokeWidth={2.2} />
        {series.points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={yAcc(p.accuracy)} r={3.5} fill="var(--c-ok)" />
            <circle cx={x(i)} cy={ySec(p.avgSec)} r={3} fill="var(--c-ng)" />
            <text x={x(i)} y={H - 10} textAnchor="middle" className="chart-label">
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        <span className="legend-ok">— 正答率（左軸）</span>
        <span className="legend-ng">--- 平均時間（右軸）</span>
        <span className="legend-note">横軸：実施回</span>
      </div>
    </div>
  );
}
