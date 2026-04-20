import React, { useCallback, useEffect, useRef, useState } from 'react';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatAxis(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${n}`;
}

function formatTooltip(n) {
  return n.toLocaleString();
}

function labelForMonth(monthKey) {
  const [y, m] = monthKey.split('-');
  return `${MONTHS[parseInt(m, 10) - 1]} '${y.slice(2)}`;
}

/**
 * @param {{by_month: Array<{month,job_count,total_runs,total_cost}>}} props
 */
function MonthlyTrendChart({ by_month }) {
  const [metric, setMetric] = useState('runs'); // 'runs' | 'jobs' | 'cost'
  const [hover, setHover] = useState(null);
  const canvasRef = useRef(null);

  const data = by_month || [];
  const getVal = useCallback((row) => {
    if (metric === 'runs') return row.total_runs || 0;
    if (metric === 'jobs') return row.job_count || 0;
    return row.total_cost || 0;
  }, [metric]);

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;
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

    const maxVal = Math.max(...data.map(getVal), 1);
    const barSlot = gw / data.length;
    const barWidth = Math.min(40, Math.max(6, barSlot * 0.7));

    // Gridlines + Y labels
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.fillStyle = '#4a5568';
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (gh * i) / 4;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      ctx.fillText(formatAxis(maxVal - (maxVal * i) / 4), pad.left - 6, y + 4);
    }

    // Bars
    data.forEach((row, i) => {
      const v = getVal(row);
      const x = pad.left + i * barSlot + (barSlot - barWidth) / 2;
      const barH = (v / maxVal) * gh;
      const y = pad.top + gh - barH;
      const hovered = hover === i;
      ctx.fillStyle = hovered ? '#ffb168' : '#ff6b35';
      ctx.fillRect(x, y, barWidth, barH);
    });

    // X-axis labels
    ctx.fillStyle = '#4a5568';
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'center';
    const labelStep = Math.max(1, Math.ceil(data.length / 12));
    data.forEach((row, i) => {
      if (i % labelStep === 0 || i === data.length - 1) {
        ctx.fillText(labelForMonth(row.month), pad.left + i * barSlot + barSlot / 2, h - 6);
      }
    });

    // Hover value above bar
    if (hover !== null && data[hover]) {
      const v = getVal(data[hover]);
      const x = pad.left + hover * barSlot + barSlot / 2;
      const y = pad.top + gh - (v / maxVal) * gh;
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '11px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(formatTooltip(v), x, Math.max(y - 6, pad.top + 12));
    }
  }, [data, hover, getVal]);

  const handleMouseMove = (e) => {
    if (data.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pad = { left: 56, right: 10 };
    const gw = rect.width - pad.left - pad.right;
    const barSlot = gw / data.length;
    const idx = Math.floor((x - pad.left) / barSlot);
    setHover(idx >= 0 && idx < data.length ? idx : null);
  };

  if (data.length === 0) return null;

  const hoverRow = hover !== null ? data[hover] : null;

  return (
    <section className="cis-panel cis-monthly">
      <div className="cis-monthly-header">
        <h3>Monthly Trend</h3>
        <div className="cis-metric-toggle">
          <button className={metric === 'runs' ? 'active' : ''} onClick={() => setMetric('runs')}>Runs</button>
          <button className={metric === 'jobs' ? 'active' : ''} onClick={() => setMetric('jobs')}>Jobs</button>
          <button className={metric === 'cost' ? 'active' : ''} onClick={() => setMetric('cost')}>Cost (ISK)</button>
        </div>
        {hoverRow && (
          <div className="cis-monthly-hover">
            {labelForMonth(hoverRow.month)} · {formatTooltip(getVal(hoverRow))}
            {metric === 'cost' ? ' ISK' : ''}
          </div>
        )}
      </div>
      <canvas
        ref={canvasRef}
        className="cis-monthly-canvas"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      />
    </section>
  );
}

export default MonthlyTrendChart;
