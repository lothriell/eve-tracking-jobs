import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getHubPriceHistory } from '../services/api';
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
  if (!value) return '0 ISK';
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T ISK`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B ISK`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M ISK`;
  return `${Math.round(value).toLocaleString()} ISK`;
}

const RANGES = [
  { days: 7, label: '1W' },
  { days: 30, label: '1M' },
  { days: 90, label: '3M' },
  { days: 180, label: '6M' },
];

const SELL_COLOR = '#4ade80';  // green — sellers asking
const BUY_COLOR = '#f87171';   // red  — buyers bidding

function PriceTrendChart({ typeId, stationId, typeName, stationName }) {
  const [rows, setRows] = useState([]);
  const [days, setDays] = useState(90);
  const [hover, setHover] = useState(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef(null);

  const load = useCallback(async () => {
    if (!typeId || !stationId) return;
    setLoading(true);
    try {
      const resp = await getHubPriceHistory({ type_id: typeId, station_id: stationId, days });
      setRows(resp.data.rows || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [typeId, stationId, days]);

  useEffect(() => { load(); }, [load]);

  const chartData = useMemo(() => rows.map(r => ({
    date: r.capture_date,
    sell_min: r.sell_min || 0,
    buy_max: r.buy_max || 0,
    sell_volume: r.sell_volume || 0,
    buy_volume: r.buy_volume || 0,
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

    const values = chartData.flatMap(d => [d.sell_min, d.buy_max].filter(v => v > 0));
    if (values.length === 0) return;
    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);
    // A little padding on the Y range so lines don't sit on the edges
    const range = Math.max(1, maxVal - minVal);
    const yMax = maxVal + range * 0.08;
    const yMin = Math.max(0, minVal - range * 0.08);

    const scaleX = (i) => pad.left + (i / (chartData.length - 1 || 1)) * gw;
    const scaleY = (v) => pad.top + gh - ((v - yMin) / (yMax - yMin || 1)) * gh;

    // Grid + Y labels
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

    // X-axis labels
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
        if (!d[key]) return; // skip zero (missing data) points
        const x = scaleX(i);
        const y = scaleY(d[key]);
        if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
      });
      ctx.stroke();
    };

    drawLine('sell_min', SELL_COLOR, 2);
    drawLine('buy_max', BUY_COLOR, 2);

    if (hover !== null && hover >= 0 && hover < chartData.length) {
      const x = scaleX(hover);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + gh); ctx.stroke();
      ctx.setLineDash([]);

      [['sell_min', SELL_COLOR], ['buy_max', BUY_COLOR]].forEach(([key, color]) => {
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
    return <div className="wealth-chart-loading">Loading price history…</div>;
  }

  if (!loading && chartData.length < 2) {
    return (
      <div className="wealth-chart-empty">
        Only {chartData.length} day{chartData.length === 1 ? '' : 's'} of history so far.
        One snapshot per hub per day — chart fills in over time.
      </div>
    );
  }

  const displayData = (hover !== null && chartData[hover]) ? chartData[hover] : chartData[chartData.length - 1];

  return (
    <div className="wealth-chart-container">
      <div className="wealth-chart-header">
        <div className="wealth-chart-legend">
          {typeName && <span className="legend-item" style={{ color: '#e2e8f0', fontWeight: 600 }}>{typeName}</span>}
          {stationName && <span className="legend-item" style={{ color: '#718096' }}>@ {stationName}</span>}
          <span className="legend-item"><span className="legend-dot" style={{ background: SELL_COLOR }} /> Sell: <span className="legend-val" style={{ color: SELL_COLOR }}>{formatISKTooltip(displayData.sell_min)}</span></span>
          <span className="legend-item"><span className="legend-dot" style={{ background: BUY_COLOR }} /> Buy: <span className="legend-val" style={{ color: BUY_COLOR }}>{formatISKTooltip(displayData.buy_max)}</span></span>
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

export default PriceTrendChart;
