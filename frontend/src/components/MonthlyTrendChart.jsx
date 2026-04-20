import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Stable category palette — reuses dashboard palette for the big three then
// fills the rest with distinct hues so categories stay recognizable across
// sessions even when data changes.
const CATEGORY_COLORS = {
  Ship: '#ff6b35',          // manufacturing orange
  Module: '#4a9eff',        // science blue
  Charge: '#e6c35c',        // gold
  Drone: '#b07bff',         // purple
  Material: '#10b981',      // reactions green
  Commodity: '#48bb78',     // green variant
  Structure: '#f56565',     // red
  Blueprint: '#9ca3af',     // grey
  Implant: '#ec4899',       // pink
  Subsystem: '#06b6d4',     // cyan
  Deployable: '#facc15',    // yellow
  Accessories: '#84cc16',   // lime
};
const FALLBACK_COLORS = ['#94a3b8', '#fb7185', '#c084fc', '#14b8a6', '#fbbf24'];

function colorForCategory(name, idx) {
  if (name && CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  return FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

function formatAxis(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${n}`;
}

function formatNumber(n) {
  return (n || 0).toLocaleString();
}

function labelForMonth(monthKey) {
  const [y, m] = monthKey.split('-');
  return `${MONTHS[parseInt(m, 10) - 1]} '${y.slice(2)}`;
}

/**
 * @param {object} props
 * @param {Array<{month,job_count,total_runs,total_cost}>} props.by_month
 * @param {Array<{month,product_category_id,product_category_name,job_count,total_runs,total_cost}>} props.by_month_category
 * @param {'jobs'|'cost'|'runs'} props.metric
 * @param {(m: 'jobs'|'cost'|'runs') => void} props.onMetricChange
 */
function MonthlyTrendChart({ by_month, by_month_category, metric, onMetricChange }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const canvasRef = useRef(null);

  // Rows per month, stacked by category, ordered by descending total so the
  // biggest category sits at the bottom of each bar.
  const monthData = useMemo(() => {
    const months = [];
    const monthIndex = new Map();
    for (const row of by_month || []) {
      const m = { month: row.month, total: 0, segments: [] };
      monthIndex.set(row.month, m);
      months.push(m);
    }

    const categoryTotals = new Map();
    for (const row of (by_month_category || [])) {
      const key = row.product_category_name || (row.product_category_id ? `Category ${row.product_category_id}` : 'Unknown');
      const val = metric === 'runs' ? (row.total_runs || 0)
                : metric === 'jobs' ? (row.job_count || 0)
                : (row.total_cost || 0);
      categoryTotals.set(key, (categoryTotals.get(key) || 0) + val);
    }

    // Rank categories by totals so the legend + stack order is stable.
    const orderedCategories = [...categoryTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name], i) => ({ name, color: colorForCategory(name, i) }));
    const categoryIndex = new Map(orderedCategories.map((c, i) => [c.name, i]));

    for (const row of (by_month_category || [])) {
      const m = monthIndex.get(row.month);
      if (!m) continue;
      const name = row.product_category_name || (row.product_category_id ? `Category ${row.product_category_id}` : 'Unknown');
      const val = metric === 'runs' ? (row.total_runs || 0)
                : metric === 'jobs' ? (row.job_count || 0)
                : (row.total_cost || 0);
      m.segments.push({ name, value: val, rank: categoryIndex.get(name) ?? 999 });
      m.total += val;
    }
    for (const m of months) {
      m.segments.sort((a, b) => a.rank - b.rank);
    }
    return { months, categories: orderedCategories };
  }, [by_month, by_month_category, metric]);

  const { months, categories } = monthData;

  useEffect(() => {
    if (!canvasRef.current || months.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 10, right: 10, bottom: 28, left: 56 };
    const gw = w - pad.left - pad.right;
    const gh = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    const maxVal = Math.max(...months.map(m => m.total), 1);
    const barSlot = gw / months.length;
    const barWidth = Math.min(44, Math.max(6, barSlot * 0.7));

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.fillStyle = '#4a5568';
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (gh * i) / 4;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      ctx.fillText(formatAxis(maxVal - (maxVal * i) / 4), pad.left - 6, y + 4);
    }

    months.forEach((m, i) => {
      const x = pad.left + i * barSlot + (barSlot - barWidth) / 2;
      let cursorY = pad.top + gh;
      const hovered = hoverIdx === i;
      for (const seg of m.segments) {
        const color = CATEGORY_COLORS[seg.name] || FALLBACK_COLORS[seg.rank % FALLBACK_COLORS.length];
        const segH = (seg.value / maxVal) * gh;
        cursorY -= segH;
        ctx.fillStyle = color;
        ctx.globalAlpha = hovered || hoverIdx === null ? 1 : 0.5;
        ctx.fillRect(x, cursorY, barWidth, segH);
      }
      ctx.globalAlpha = 1;
    });

    ctx.fillStyle = '#4a5568';
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'center';
    const labelStep = Math.max(1, Math.ceil(months.length / 12));
    months.forEach((m, i) => {
      if (i % labelStep === 0 || i === months.length - 1) {
        ctx.fillText(labelForMonth(m.month), pad.left + i * barSlot + barSlot / 2, h - 6);
      }
    });
  }, [months, hoverIdx]);

  const handleMouseMove = (e) => {
    if (months.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pad = { left: 56, right: 10 };
    const gw = rect.width - pad.left - pad.right;
    const barSlot = gw / months.length;
    const idx = Math.floor((x - pad.left) / barSlot);
    setHoverIdx(idx >= 0 && idx < months.length ? idx : null);
  };

  if (months.length === 0) return null;

  // Default selection = latest month; hover swaps to hovered bar. Rendering
  // the tooltip unconditionally prevents the surrounding layout from jumping
  // when the user first moves the mouse over the chart.
  const displayIdx = hoverIdx !== null ? hoverIdx : months.length - 1;
  const displayedMonth = months[displayIdx];
  const isHover = hoverIdx !== null;

  return (
    <section className="cis-panel cis-monthly">
      <div className="cis-monthly-header">
        <h3>Monthly Trend</h3>
        <div className="cis-metric-toggle">
          <button className={metric === 'jobs' ? 'active' : ''} onClick={() => onMetricChange('jobs')}>Jobs</button>
          <button className={metric === 'cost' ? 'active' : ''} onClick={() => onMetricChange('cost')}>Cost (ISK)</button>
          <button className={metric === 'runs' ? 'active' : ''} onClick={() => onMetricChange('runs')}>Runs</button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="cis-monthly-canvas"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      />

      <div className="cis-monthly-legend">
        {categories.map(c => (
          <span className="cis-legend-item" key={c.name}>
            <span className="cis-legend-swatch" style={{ background: c.color }} />
            <span>{c.name}</span>
          </span>
        ))}
      </div>

      {displayedMonth && (
        <div className="cis-monthly-tooltip">
          <div className="cis-tooltip-head">
            <span>
              {labelForMonth(displayedMonth.month)}
              {!isHover && <span className="cis-tooltip-hint"> · latest</span>}
            </span>
            <span className="cis-tooltip-total">
              {formatNumber(displayedMonth.total)} {metric === 'cost' ? 'ISK' : metric}
            </span>
          </div>
          <ul>
            {displayedMonth.segments.filter(s => s.value > 0).map(s => (
              <li key={s.name}>
                <span className="cis-legend-swatch" style={{ background: colorForCategory(s.name, s.rank) }} />
                <span className="cis-tooltip-name">{s.name}</span>
                <span className="cis-tooltip-val">{formatNumber(s.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default MonthlyTrendChart;
