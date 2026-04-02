import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getWealthHistory } from '../services/api';
import './WealthChart.css';

function formatISKAxis(value) {
  if (value >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toFixed(0);
}

function formatISKTooltip(value) {
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T ISK`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B ISK`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M ISK`;
  return `${value.toLocaleString()} ISK`;
}

function WealthChart({ characterId, refreshKey }) {
  const [snapshots, setSnapshots] = useState([]);
  const [days, setDays] = useState(30);
  const [hover, setHover] = useState(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await getWealthHistory(days);
      setSnapshots(resp.data.snapshots || []);
    } catch { setSnapshots([]); }
    finally { setLoading(false); }
  }, [days]);

  useEffect(() => { loadHistory(); }, [loadHistory, refreshKey]);

  // Aggregate snapshots by date — deduplicate per character per hour, then sum across characters
  const chartData = React.useMemo(() => {
    if (snapshots.length === 0) return [];
    // First: keep only latest snapshot per character per hour
    const perCharHour = {};
    snapshots.forEach(s => {
      if (characterId && s.character_id !== characterId) return;
      const hourKey = s.snapshot_date.substring(0, 13);
      const key = `${s.character_id}_${hourKey}`;
      // Keep the latest snapshot per character per hour
      if (!perCharHour[key] || s.snapshot_date > perCharHour[key].snapshot_date) {
        perCharHour[key] = s;
      }
    });
    // Then: sum across characters per hour
    const byDate = {};
    Object.values(perCharHour).forEach(s => {
      const dateKey = s.snapshot_date.substring(0, 13);
      if (!byDate[dateKey]) byDate[dateKey] = { date: s.snapshot_date, wallet: 0, assets: 0, total: 0 };
      byDate[dateKey].wallet += s.wallet_balance || 0;
      byDate[dateKey].assets += s.asset_value || 0;
      byDate[dateKey].total += s.total_wealth || 0;
    });
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [snapshots, characterId]);

  // Draw chart
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

    // Find min/max
    const allValues = chartData.flatMap(d => [d.wallet, d.assets, d.total]);
    const maxVal = Math.max(...allValues, 1);
    const minVal = Math.min(...allValues.filter(v => v > 0), 0);

    const scaleX = (i) => pad.left + (i / (chartData.length - 1 || 1)) * gw;
    const scaleY = (v) => pad.top + gh - ((v - minVal) / (maxVal - minVal || 1)) * gh;

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (gh * i) / 4;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      ctx.fillStyle = '#4a5568';
      ctx.font = '10px Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(formatISKAxis(maxVal - ((maxVal - minVal) * i) / 4), pad.left - 6, y + 4);
    }

    // X-axis labels
    ctx.fillStyle = '#4a5568';
    ctx.font = '9px Consolas, monospace';
    ctx.textAlign = 'center';
    const labelStep = Math.max(1, Math.floor(chartData.length / 6));
    chartData.forEach((d, i) => {
      if (i % labelStep === 0 || i === chartData.length - 1) {
        const date = new Date(d.date);
        ctx.fillText(`${date.getMonth() + 1}/${date.getDate()}`, scaleX(i), h - 4);
      }
    });

    // Draw lines
    const drawLine = (key, color, lineWidth = 2) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      chartData.forEach((d, i) => {
        const x = scaleX(i);
        const y = scaleY(d[key]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    drawLine('assets', '#f6ad55', 1.5);
    drawLine('wallet', '#f6c90e', 1.5);
    drawLine('total', '#e2e8f0', 2);

    // Hover indicator
    if (hover !== null && hover >= 0 && hover < chartData.length) {
      const x = scaleX(hover);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + gh); ctx.stroke();
      ctx.setLineDash([]);

      [['total', '#e2e8f0'], ['assets', '#f6ad55'], ['wallet', '#f6c90e']].forEach(([key, color]) => {
        const y = scaleY(chartData[hover][key]);
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

  if (loading) return <div className="wealth-chart-loading">Loading wealth history...</div>;

  if (chartData.length < 2) {
    return (
      <div className="wealth-chart-empty">
        Wealth history will appear after the first few snapshots (taken hourly).
      </div>
    );
  }

  // Show hovered point or latest data point
  const displayData = (hover !== null && chartData[hover]) ? chartData[hover] : chartData[chartData.length - 1];

  const RANGES = [
    { days: 1, label: '1D' },
    { days: 7, label: '1W' },
    { days: 30, label: '1M' },
    { days: 90, label: '3M' },
    { days: 180, label: '6M' },
    { days: 365, label: '1Y' },
    { days: 'all', label: 'MAX' },
  ];

  return (
    <div className="wealth-chart-container">
      <div className="wealth-chart-header">
        <div className="wealth-chart-legend">
          <span className="legend-item"><span className="legend-dot" style={{ background: '#e2e8f0' }} /> Total: <span className="legend-val total">{formatISKTooltip(displayData.total)}</span></span>
          <span className="legend-item"><span className="legend-dot" style={{ background: '#f6ad55' }} /> Assets: <span className="legend-val assets">{formatISKTooltip(displayData.assets)}</span></span>
          <span className="legend-item"><span className="legend-dot" style={{ background: '#f6c90e' }} /> Wallet: <span className="legend-val wallet">{formatISKTooltip(displayData.wallet)}</span></span>
          {hover !== null && <span className="legend-date">{new Date(displayData.date).toLocaleString()}</span>}
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

export default WealthChart;
