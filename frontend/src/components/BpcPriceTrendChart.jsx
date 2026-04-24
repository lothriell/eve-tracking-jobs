import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBpcPriceHistory } from '../services/api';
import './WealthChart.css';

function formatISKAxis(value) {
  if (!value) return '0';
  if (value >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toFixed(0);
}

function formatISKTooltip(value) {
  if (!value) return '—';
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T ISK`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B ISK`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M ISK`;
  return `${Math.round(value).toLocaleString()} ISK`;
}

const RANGES = [
  { days: 30, label: '1M' },
  { days: 90, label: '3M' },
  { days: 180, label: '6M' },
];

const MIN_COLOR = '#4ade80';    // green — cheapest ask
const MEDIAN_COLOR = '#f6ad55'; // amber — typical price
const MAX_COLOR = '#f87171';    // red — priciest ask

function BpcPriceTrendChart({ typeId, typeName }) {
  const [rows, setRows] = useState([]);
  const [days, setDays] = useState(180);
  const [hover, setHover] = useState(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef(null);

  const load = useCallback(async () => {
    if (!typeId) return;
    setLoading(true);
    try {
      const resp = await getBpcPriceHistory(typeId, days);
      setRows(resp.data.rows || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [typeId, days]);

  useEffect(() => { load(); }, [load]);

  const chartData = useMemo(() => rows.map(r => ({
    date: r.capture_date,
    min: r.min_per_run || 0,
    median: r.median_per_run || 0,
    max: r.max_per_run || 0,
    count: r.offer_count || 0,
  })), [rows]);

  useEffect(() => {
    if (!canvasRef.current || chartData.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 10, right: 10, bottom: 25, left: 60 };
    const gw = w - pad.left - pad.right;
    const gh = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    const values = chartData.flatMap(d => [d.min, d.median, d.max].filter(v => v > 0));
    if (values.length === 0) return;
    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);
    const range = Math.max(1, maxVal - minVal);
    const yMax = maxVal + range * 0.08;
    const yMin = Math.max(0, minVal - range * 0.08);

    const scaleX = (i) => pad.left + (i / (chartData.length - 1 || 1)) * gw;
    const scaleY = (v) => pad.top + gh - ((v - yMin) / (yMax - yMin || 1)) * gh;

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (gh * i) / 4;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      ctx.fillStyle = '#4a5568';
      ctx.font = '10px Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(formatISKAxis(yMax - ((yMax - yMin) * i) / 4), pad.left - 6, y + 4);
    }

    ctx.fillStyle = '#4a5568';
    ctx.font = '9px Consolas, monospace';
    ctx.textAlign = 'center';
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const labelStep = Math.max(1, Math.floor(chartData.length / 6));
    chartData.forEach((d, i) => {
      if (i % labelStep === 0 || i === chartData.length - 1) {
        const date = new Date(d.date + 'T00:00:00Z');
        const label = chartData.length > 30
          ? `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`
          : `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
        ctx.fillText(label, scaleX(i), h - 4);
      }
    });

    const drawLine = (key, color, lineWidth = 2) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      let started = false;
      chartData.forEach((d, i) => {
        if (!d[key]) return;
        const x = scaleX(i);
        const y = scaleY(d[key]);
        if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
      });
      ctx.stroke();
    };

    drawLine('max', MAX_COLOR, 1.5);
    drawLine('min', MIN_COLOR, 1.5);
    drawLine('median', MEDIAN_COLOR, 2);

    if (hover !== null && hover >= 0 && hover < chartData.length) {
      const x = scaleX(hover);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + gh); ctx.stroke();
      ctx.setLineDash([]);

      [['max', MAX_COLOR], ['median', MEDIAN_COLOR], ['min', MIN_COLOR]].forEach(([key, color]) => {
        const v = chartData[hover][key];
        if (!v) return;
        const y = scaleY(v);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      });
    }
  }, [chartData, hover]);

  const handleMouseMove = (e) => {
    if (chartData.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pad = { left: 60, right: 10 };
    const gw = rect.width - pad.left - pad.right;
    const ratio = (x - pad.left) / gw;
    const idx = Math.round(ratio * (chartData.length - 1));
    if (idx >= 0 && idx < chartData.length) setHover(idx);
    else setHover(null);
  };

  if (loading && chartData.length === 0) {
    return <div className="wealth-chart-loading">Loading BPC price history…</div>;
  }

  if (!loading && chartData.length < 2) {
    return (
      <div className="wealth-chart-empty">
        Only {chartData.length} day{chartData.length === 1 ? '' : 's'} of history so far.
        Snapshot runs once per scrape cycle (4h); chart fills in over days.
      </div>
    );
  }

  const displayData = (hover !== null && chartData[hover]) ? chartData[hover] : chartData[chartData.length - 1];

  return (
    <div className="wealth-chart-container">
      <div className="wealth-chart-header">
        <div className="wealth-chart-legend">
          {typeName && <span className="legend-item" style={{ color: '#e2e8f0', fontWeight: 600 }}>{typeName} — BPC</span>}
          <span className="legend-item"><span className="legend-dot" style={{ background: MIN_COLOR }} /> Cheapest: <span className="legend-val" style={{ color: MIN_COLOR }}>{formatISKTooltip(displayData.min)}</span>/run</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: MEDIAN_COLOR }} /> Median: <span className="legend-val" style={{ color: MEDIAN_COLOR }}>{formatISKTooltip(displayData.median)}</span>/run</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: MAX_COLOR }} /> Priciest: <span className="legend-val" style={{ color: MAX_COLOR }}>{formatISKTooltip(displayData.max)}</span>/run</span>
          <span className="legend-item" style={{ color: '#718096' }}>{displayData.count} offers</span>
          {hover !== null && <span className="legend-date">{displayData.date}</span>}
        </div>
        <div className="wealth-chart-range">
          {RANGES.map(r => (
            <button key={r.days} className={`range-btn ${days === r.days ? 'active' : ''}`} onClick={() => setDays(r.days)}>{r.label}</button>
          ))}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="wealth-chart-canvas"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      />
    </div>
  );
}

export default BpcPriceTrendChart;
