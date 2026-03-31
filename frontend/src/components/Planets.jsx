import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getCharacterPlanets, getColonyLayout } from '../services/api';
import './Planets.css';

// ============== CONSTANTS ==============

const PLANET_COLORS = {
  temperate: { bg: 'rgba(74,136,64,0.15)', border: 'rgba(74,136,64,0.4)', dot: '#4a8840' },
  barren:    { bg: 'rgba(200,152,96,0.15)', border: 'rgba(200,152,96,0.4)', dot: '#c89860' },
  oceanic:   { bg: 'rgba(56,112,168,0.15)', border: 'rgba(56,112,168,0.4)', dot: '#3870a8' },
  ice:       { bg: 'rgba(136,184,216,0.15)', border: 'rgba(136,184,216,0.4)', dot: '#88b8d8' },
  gas:       { bg: 'rgba(200,136,74,0.15)', border: 'rgba(200,136,74,0.4)', dot: '#c8884a' },
  lava:      { bg: 'rgba(216,74,42,0.15)', border: 'rgba(216,74,42,0.4)', dot: '#d84a2a' },
  storm:     { bg: 'rgba(120,88,168,0.15)', border: 'rgba(120,88,168,0.4)', dot: '#7858a8' },
  plasma:    { bg: 'rgba(216,112,40,0.15)', border: 'rgba(216,112,40,0.4)', dot: '#d87028' },
  shattered: { bg: 'rgba(136,136,136,0.15)', border: 'rgba(136,136,136,0.4)', dot: '#888888' },
};

// Storage capacities by pin type NAME (type IDs vary, names are consistent)
function getStorageCapacity(pin) {
  const name = (pin.type_name || '').toLowerCase();
  if (name.includes('launchpad')) return 10000;
  if (name.includes('storage')) return 12000;
  if (name.includes('command center')) return 500;
  return 0; // Not a storage pin
}

// Default volume for unknown types (fallback if SDE volume not available)
const DEFAULT_VOLUME = 0.01;

// Planet type → EVE type_id for image URLs
const PLANET_TYPE_IDS = {
  temperate: 11,
  ice: 12,
  gas: 13,
  oceanic: 2014,
  lava: 2015,
  barren: 2016,
  storm: 2017,
  plasma: 2063,
};

function getPlanetImageUrl(planetType) {
  const typeId = PLANET_TYPE_IDS[(planetType || '').toLowerCase()];
  if (!typeId) return null;
  return `https://images.evetech.net/types/${typeId}/icon?size=64`;
}

// Extractor balance threshold (units/hour)
const BALANCE_THRESHOLD = 1000;

// Low extraction rate threshold (units/hour)
const LOW_EXTRACTION_THRESHOLD = 500;

// ============== UTILITY FUNCTIONS ==============

function getPlanetStyle(type) {
  return PLANET_COLORS[(type || '').toLowerCase()] || {
    bg: 'rgba(90,106,122,0.15)', border: 'rgba(90,106,122,0.4)', dot: '#5a6a7a'
  };
}

function getExpiryColor(diff) {
  if (diff <= 0)                return '#AB324A'; // Expired
  if (diff < 2 * 3600000)      return '#9C4438'; // <2h
  if (diff < 4 * 3600000)      return '#765B21'; // <4h
  if (diff < 8 * 3600000)      return '#63620D'; // <8h
  if (diff < 12 * 3600000)     return '#2C6C2F'; // <12h
  if (diff < 24 * 3600000)     return '#2F695A'; // <24h
  if (diff < 48 * 3600000)     return '#2F695A'; // <48h
  return '#006596';                               // Normal
}

function formatCountdown(diff) {
  if (diff <= 0) return 'EXPIRED';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function calcExtractorUPH(extractor) {
  if (!extractor?.extractor_details) return 0;
  const { qty_per_cycle, cycle_time } = extractor.extractor_details;
  if (!cycle_time || cycle_time <= 0) return 0;
  return Math.round((qty_per_cycle / cycle_time) * 3600);
}

function calcStorageFill(pins) {
  let totalUsed = 0;
  let totalCapacity = 0;

  for (const pin of pins) {
    const cap = getStorageCapacity(pin);
    if (!cap) continue;

    totalCapacity += cap;
    if (pin.contents?.length) {
      for (const item of pin.contents) {
        // Use volume from backend (SDE data), fallback to DEFAULT_VOLUME
        const vol = item.volume || DEFAULT_VOLUME;
        totalUsed += vol * item.amount;
      }
    }
  }

  if (totalCapacity <= 0) return null;
  return { used: totalUsed, capacity: totalCapacity, pct: Math.min(100, (totalUsed / totalCapacity) * 100) };
}

function getAlertState(pins, expiryDate) {
  const alerts = {
    expired: false,
    hasLowExtraction: false,
    hasOffBalance: false,
    hasLowStorage: false,
  };

  // Check colony-level expiry
  if (expiryDate) {
    const diff = new Date(expiryDate) - Date.now();
    if (diff <= 0) alerts.expired = true;
  }

  // Check extractors
  const extractorPins = pins.filter(p => p.extractor_details);
  const extractorUPHs = extractorPins.map(p => calcExtractorUPH(p));

  // Expired extractors
  extractorPins.forEach(p => {
    if (p.expiry_time) {
      if (new Date(p.expiry_time) - Date.now() <= 0) {
        alerts.expired = true;
      }
    } else {
      alerts.expired = true; // No expiry = stopped
    }
  });

  // Low extraction rate
  if (extractorUPHs.some(uph => uph > 0 && uph < LOW_EXTRACTION_THRESHOLD)) {
    alerts.hasLowExtraction = true;
  }

  // Off-balance extractors
  if (extractorUPHs.length === 2) {
    const diff = Math.abs(extractorUPHs[0] - extractorUPHs[1]);
    if (diff > BALANCE_THRESHOLD) {
      alerts.hasOffBalance = true;
    }
  }

  // Storage fill
  const storage = calcStorageFill(pins);
  if (storage && storage.pct > 60) {
    alerts.hasLowStorage = true;
  }

  return alerts;
}

function hasAnyAlert(alerts) {
  return alerts.expired || alerts.hasLowExtraction || alerts.hasOffBalance || alerts.hasLowStorage;
}

// ============== EXTRACTION PREDICTION ==============

function getProgramOutput(baseValue, cycleTime, cycleNum) {
  const SEC = 1;
  const decayFactor = 0.012;
  const noiseFactor = 0.8;
  const barWidth = cycleTime / SEC / 900.0;
  const t = (cycleNum + 0.5) * barWidth;
  const phaseShift = Math.pow(baseValue, 0.7);

  const decayValue = baseValue / (1 + t * decayFactor);
  const sinA = Math.cos(phaseShift + t / 12);
  const sinB = Math.cos(phaseShift / 2 + t / 5);
  const sinC = Math.cos(t / 2);
  const sinStuff = Math.max(0, (sinA + sinB + sinC) / 3);
  const barHeight = decayValue * (1 + noiseFactor * sinStuff);
  return Math.max(0, Math.floor(barWidth * barHeight));
}

function getExtractionPrediction(extractor) {
  if (!extractor?.extractor_details) return null;
  const { qty_per_cycle, cycle_time, heads } = extractor.extractor_details;
  if (!qty_per_cycle || !cycle_time) return null;

  const installTime = extractor.install_time ? new Date(extractor.install_time).getTime() : null;
  const expiryTime = extractor.expiry_time ? new Date(extractor.expiry_time).getTime() : null;
  if (!installTime || !expiryTime) return null;

  const totalDuration = expiryTime - installTime;
  const totalCycles = Math.floor(totalDuration / (cycle_time * 1000));
  if (totalCycles <= 0) return null;

  const outputs = [];
  for (let i = 0; i < totalCycles; i++) {
    outputs.push(getProgramOutput(qty_per_cycle, cycle_time, i));
  }

  const now = Date.now();
  const elapsed = now - installTime;
  const currentCycle = Math.floor(elapsed / (cycle_time * 1000));

  return { outputs, totalCycles, currentCycle, cycle_time, installTime, expiryTime };
}

// ============== EXTRACTION BAR GRAPH ==============

const BAR_COLORS = [
  '#3D90CC', '#3DB6CC', '#3DCCBE', '#3DCC8E', '#3DCC5C',
  '#4FCC3D', '#82CC3D', '#B6CC3D', '#CCA83D', '#CC7E3D', '#CC3D3D'
];

function getBarColor(value, maxValue) {
  if (maxValue <= 0) return BAR_COLORS[0];
  const pct = Math.min(1, value / maxValue);
  const idx = Math.floor(pct * (BAR_COLORS.length - 1));
  return BAR_COLORS[idx];
}

function ExtractionGraph({ extractor }) {
  const canvasRef = useRef(null);
  const [hover, setHover] = useState(null);
  const prediction = getExtractionPrediction(extractor);

  useEffect(() => {
    if (!prediction || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { outputs, totalCycles, currentCycle } = prediction;
    const maxVal = Math.max(...outputs, 1);

    const w = canvas.width;
    const h = canvas.height;
    const leftPad = 50;
    const bottomPad = 4;
    const graphW = w - leftPad;
    const graphH = h - bottomPad;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(leftPad, 0, graphW, graphH);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const y = graphH * (1 - i / 4);
      ctx.beginPath();
      ctx.moveTo(leftPad, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Y-axis labels
    ctx.fillStyle = '#4a5568';
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = Math.round(maxVal * i / 4);
      const y = graphH * (1 - i / 4);
      ctx.fillText(val >= 1000 ? `${(val/1000).toFixed(0)}K` : val, leftPad - 6, y + 4);
    }

    // Bars
    const barGap = 1;
    const barW = Math.max(2, (graphW - totalCycles * barGap) / totalCycles);
    for (let i = 0; i < totalCycles; i++) {
      const x = leftPad + i * (barW + barGap);
      const barH = (outputs[i] / maxVal) * graphH;
      const y = graphH - barH;
      ctx.fillStyle = getBarColor(outputs[i], maxVal);
      ctx.globalAlpha = i === hover ? 1 : 0.85;
      ctx.fillRect(x, y, barW, barH);
    }
    ctx.globalAlpha = 1;

    // Current time indicator
    if (currentCycle >= 0 && currentCycle < totalCycles) {
      const x = leftPad + currentCycle * (barW + barGap) + barW / 2;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, graphH);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }, [prediction, hover]);

  if (!prediction) return null;

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const leftPad = 50;
    const graphW = canvasRef.current.width - leftPad;
    const barW = graphW / prediction.totalCycles;
    const idx = Math.floor((x - leftPad) / barW);
    if (idx >= 0 && idx < prediction.totalCycles) {
      setHover(idx);
    } else {
      setHover(null);
    }
  };

  const accumulated = hover !== null
    ? prediction.outputs.slice(0, hover + 1).reduce((s, v) => s + v, 0)
    : 0;

  return (
    <div className="extraction-graph-container">
      <canvas
        ref={canvasRef}
        width={400}
        height={120}
        className="extraction-graph-canvas"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      />
      {hover !== null && (
        <div className="extraction-graph-tooltip">
          Cycle {hover + 1}: <strong>{prediction.outputs[hover]?.toLocaleString()}</strong> units
          &bull; Total: {accumulated.toLocaleString()}
        </div>
      )}
    </div>
  );
}

// ============== LIVE COUNTDOWN COMPONENT ==============

function LiveCountdown({ expiryTime }) {
  const [now, setNow] = useState(Date.now());
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  if (!expiryTime) return <span className="expiry-stopped">STOPPED</span>;

  const target = new Date(expiryTime).getTime();
  const diff = target - now;
  const color = getExpiryColor(diff);
  const label = formatCountdown(diff);

  return (
    <span className="live-countdown" style={{ color }}>
      {label}
    </span>
  );
}

// ============== UPGRADE STARS ==============

function UpgradeStars({ level }) {
  return (
    <span className="upgrade-stars">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < level ? '' : 'upgrade-star-empty'}>
          {i < level ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}

// ============== ALERT BADGES ==============

function AlertBadges({ alerts }) {
  if (!hasAnyAlert(alerts)) return null;

  return (
    <span className="alert-badges">
      {alerts.expired && <span className="alert-badge alert-expired" title="Extractor expired or stopped">EXPIRED</span>}
      {alerts.hasOffBalance && <span className="alert-badge alert-offbalance" title="Extractors are off-balance (>1000 uph difference)">OFF-BAL</span>}
      {alerts.hasLowExtraction && <span className="alert-badge alert-lowrate" title="Low extraction rate (<500 uph)">LOW</span>}
      {alerts.hasLowStorage && <span className="alert-badge alert-storage" title="Storage >60% full">STORAGE</span>}
    </span>
  );
}

// ============== STORAGE BAR ==============

function StorageBar({ storage }) {
  if (!storage) return <span className="date-muted">—</span>;

  const pct = Math.round(storage.pct);
  const barColor = pct > 80 ? '#AB324A' : pct > 60 ? '#fbd38d' : '#68d391';

  return (
    <div className="storage-bar-container" title={`${storage.used.toFixed(0)} / ${storage.capacity.toFixed(0)} m³`}>
      <div className="storage-bar-track">
        <div className="storage-bar-fill" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
      <span className="storage-bar-label" style={{ color: barColor }}>{pct}%</span>
    </div>
  );
}

// ============== COLONY DETAIL ==============

function ColonyDetail({ characterId, planetId, planetType, onClose }) {
  const [layout, setLayout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getColonyLayout(characterId, planetId);
        setLayout(response.data);
      } catch (err) {
        console.error('Failed to load colony layout:', err);
        setError('Failed to load colony layout');
      } finally {
        setLoading(false);
      }
    })();
  }, [characterId, planetId]);

  const pins   = layout?.pins   || [];
  const links  = layout?.links  || [];
  const routes = layout?.routes || [];

  const extractorPins = pins.filter(p => p.extractor_details);
  const factoryPins   = pins.filter(p => p.factory_details);
  const withContents  = pins.filter(p => p.contents && p.contents.length > 0);

  // Calculate total extraction rate
  const totalUPH = extractorPins.reduce((sum, p) => sum + calcExtractorUPH(p), 0);

  // Calculate extractor balance
  const extractorUPHs = extractorPins.map(p => calcExtractorUPH(p));
  const isOffBalance = extractorUPHs.length === 2 && Math.abs(extractorUPHs[0] - extractorUPHs[1]) > BALANCE_THRESHOLD;

  // Storage fill
  const storage = calcStorageFill(pins);

  const style = getPlanetStyle(planetType);

  return (
    <div className="colony-detail-panel">
      <div className="colony-detail-header">
        <span className="planet-dot" style={{ backgroundColor: style.dot, width: 10, height: 10, borderRadius: '50%', display: 'inline-block' }} />
        <span className="colony-detail-title">Planet {planetId} — Colony Layout</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {!loading && (
            <>
              <span className="badge badge-green">{pins.length} pins</span>
              <span className="badge badge-amber">{links.length} links</span>
              <span className="badge badge-blue">{routes.length} routes</span>
            </>
          )}
        </div>
        <button className="colony-detail-close" onClick={onClose} title="Close">×</button>
      </div>

      {loading && (
        <div className="planets-loading" style={{ padding: '30px 20px' }}>
          <div className="spinner-small" style={{ width: 24, height: 24, marginBottom: 8 }}></div>
          <span style={{ fontSize: 13, color: '#a0aec0' }}>Loading layout...</span>
        </div>
      )}

      {error && (
        <div style={{ padding: '20px 16px', color: '#fc8181', fontSize: 13 }}>{error}</div>
      )}

      {!loading && !error && (
        <>
          {/* Stats grid — expanded with extraction rate and storage */}
          <div className="colony-stats-grid colony-stats-5col">
            <div className="colony-stat-box">
              <div className="colony-stat-label">Extractors</div>
              <div className="colony-stat-value extractors">
                {extractorPins.length}
                {isOffBalance && <span className="alert-badge alert-offbalance" style={{ fontSize: 9, marginLeft: 6, verticalAlign: 'middle' }}>OFF-BAL</span>}
              </div>
            </div>
            <div className="colony-stat-box">
              <div className="colony-stat-label">Factories</div>
              <div className="colony-stat-value factories">{factoryPins.length}</div>
            </div>
            <div className="colony-stat-box">
              <div className="colony-stat-label">With Contents</div>
              <div className="colony-stat-value contents">{withContents.length}</div>
            </div>
            <div className="colony-stat-box">
              <div className="colony-stat-label">Extraction Rate</div>
              <div className="colony-stat-value" style={{ color: totalUPH < LOW_EXTRACTION_THRESHOLD && totalUPH > 0 ? '#fbd38d' : '#68d391' }}>
                {totalUPH > 0 ? totalUPH.toLocaleString() : '—'}
                {totalUPH > 0 && <span style={{ fontSize: 11, fontWeight: 400, color: '#718096', marginLeft: 4 }}>u/h</span>}
              </div>
            </div>
            <div className="colony-stat-box">
              <div className="colony-stat-label">Storage</div>
              {storage ? <StorageBar storage={storage} /> : <div className="colony-stat-value" style={{ color: '#718096' }}>—</div>}
            </div>
          </div>

          {/* Extraction prediction graphs */}
          {extractorPins.length > 0 && (
            <div className="extraction-graphs">
              {extractorPins.map((pin, idx) => (
                <div key={pin.pin_id || idx} className="extraction-graph-wrapper">
                  <div className="extraction-graph-label">
                    {pin.extractor_details?.product_name || pin.type_name || 'Extractor'} — {calcExtractorUPH(pin).toLocaleString()} u/h
                  </div>
                  <ExtractionGraph extractor={pin} />
                </div>
              ))}
            </div>
          )}

          {/* Pins table with live countdowns and extraction rates */}
          {pins.length > 0 && (
            <table className="pins-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Structure</th>
                  <th>Expiry</th>
                  <th className="text-right">Rate</th>
                  <th>Contents</th>
                </tr>
              </thead>
              <tbody>
                {pins.map((pin, idx) => {
                  const isExtractor = !!pin.extractor_details;
                  const isFactory   = !!pin.factory_details;
                  const kind  = isExtractor ? 'Extractor' : isFactory ? 'Factory' : 'Storage/CC';
                  const badge = isExtractor ? 'badge-green' : isFactory ? 'badge-blue' : 'badge-amber';
                  const expiry = pin.expiry_time;
                  const uph = isExtractor ? calcExtractorUPH(pin) : 0;
                  const contents = pin.contents || [];
                  const contentStr = contents.length
                    ? contents.map(c => `${c.type_name || `Type ${c.type_id}`} ×${c.amount}`).join(', ')
                    : '—';

                  return (
                    <tr key={pin.pin_id || idx}>
                      <td><span className={`badge ${badge}`}>{kind}</span></td>
                      <td style={{ color: '#a0aec0', fontSize: 12 }}>{pin.type_name || `Type ${pin.type_id}`}</td>
                      <td>
                        {isExtractor
                          ? <LiveCountdown expiryTime={expiry} />
                          : <span className="date-muted">—</span>
                        }
                      </td>
                      <td className="text-right">
                        {isExtractor && uph > 0 ? (
                          <span style={{ color: uph < LOW_EXTRACTION_THRESHOLD ? '#fbd38d' : '#68d391', fontFamily: 'monospace', fontSize: 12 }}>
                            {uph.toLocaleString()} u/h
                          </span>
                        ) : <span className="date-muted">—</span>}
                      </td>
                      <td className="pin-contents">{contentStr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

// ============== CHARACTER COLONIES ==============

function CharacterColonies({ characterData, alertMode }) {
  const [openColony, setOpenColony] = useState(null);
  const [colonyLayouts, setColonyLayouts] = useState({});
  const [loadingLayouts, setLoadingLayouts] = useState({});

  const { character_id, character_name, colonies, error: charError } = characterData;

  // Pre-fetch layouts for alert computation
  useEffect(() => {
    if (!colonies?.length) return;
    colonies.forEach(async (colony) => {
      if (colonyLayouts[colony.planet_id]) return;
      setLoadingLayouts(prev => ({ ...prev, [colony.planet_id]: true }));
      try {
        const response = await getColonyLayout(character_id, colony.planet_id);
        setColonyLayouts(prev => ({ ...prev, [colony.planet_id]: response.data }));
      } catch (err) {
        console.error(`Failed to prefetch layout for planet ${colony.planet_id}:`, err);
      } finally {
        setLoadingLayouts(prev => ({ ...prev, [colony.planet_id]: false }));
      }
    });
  }, [character_id, colonies]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleColony = (planetId) => {
    setOpenColony(prev => prev === planetId ? null : planetId);
  };

  if (charError) {
    return (
      <div className="reauth-banner">
        <span className="reauth-icon">⚠️</span>
        <span>{character_name}: {characterData.message || 'Could not load colonies. Re-add character to grant planet scopes.'}</span>
      </div>
    );
  }

  if (!colonies || colonies.length === 0) {
    return alertMode ? null : (
      <div className="planets-empty" style={{ padding: '20px', textAlign: 'left' }}>
        No colonies found for {character_name}.
      </div>
    );
  }

  // Build alert states per colony
  const colonyAlerts = {};
  colonies.forEach(colony => {
    const layout = colonyLayouts[colony.planet_id];
    if (layout?.pins) {
      colonyAlerts[colony.planet_id] = getAlertState(layout.pins, colony.expiry_date);
    } else {
      colonyAlerts[colony.planet_id] = { expired: false, hasLowExtraction: false, hasOffBalance: false, hasLowStorage: false };
    }
  });

  // Filter in alert mode
  const filteredColonies = alertMode
    ? colonies.filter(c => hasAnyAlert(colonyAlerts[c.planet_id] || {}))
    : colonies;

  if (filteredColonies.length === 0) return null;

  const alertCount = colonies.filter(c => hasAnyAlert(colonyAlerts[c.planet_id] || {})).length;

  return (
    <div className="character-colonies-section">
      <div className="colonies-card">
        <div className="colonies-card-header">
          <span className="colonies-card-title">
            {character_name} — {colonies.length} {colonies.length === 1 ? 'Colony' : 'Colonies'}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {alertCount > 0 && (
              <span className="badge badge-red">{alertCount} alert{alertCount !== 1 ? 's' : ''}</span>
            )}
            <span className="badge badge-green">{colonies.length} active</span>
          </div>
        </div>

        <table className="colonies-table">
          <thead>
            <tr>
              <th className="col-planet">Planet</th>
              <th className="col-type">Type</th>
              <th className="col-level text-right">Level</th>
              <th className="col-pins text-right">Pins</th>
              <th className="col-rate text-right">Rate</th>
              <th className="col-storage">Storage</th>
              <th className="col-expiry">Expiry</th>
              <th className="col-status">Status</th>
              <th className="col-action"></th>
            </tr>
          </thead>
          <tbody>
            {filteredColonies.map(colony => {
              const style = getPlanetStyle(colony.planet_type);
              const alerts = colonyAlerts[colony.planet_id] || {};
              const layout = colonyLayouts[colony.planet_id];
              const layoutPins = layout?.pins || [];
              const extractorPins = layoutPins.filter(p => p.extractor_details);
              const totalUPH = extractorPins.reduce((sum, p) => sum + calcExtractorUPH(p), 0);
              const storage = layoutPins.length > 0 ? calcStorageFill(layoutPins) : null;

              // Find the earliest extractor expiry for this colony
              const extractorExpiries = extractorPins
                .map(p => p.expiry_time)
                .filter(Boolean);
              const earliestExpiry = extractorExpiries.length > 0
                ? extractorExpiries.sort()[0]
                : colony.expiry_date;

              return (
                <React.Fragment key={colony.planet_id}>
                  <tr className={hasAnyAlert(alerts) ? 'colony-row-alert' : ''}>
                    <td>
                      <div className="planet-cell">
                        {getPlanetImageUrl(colony.planet_type) ? (
                          <img src={getPlanetImageUrl(colony.planet_type)} alt="" className="planet-list-img" />
                        ) : (
                          <span className="planet-dot" style={{ backgroundColor: style.dot, width: 24, height: 24, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
                        )}
                        <span>{colony.planet_name || colony.system_name || `Planet ${colony.planet_id}`}</span>
                      </div>
                    </td>
                    <td>
                      <span className="planet-type-badge" style={{ backgroundColor: style.bg, borderColor: style.border, color: style.dot }}>
                        {(colony.planet_type || 'unknown').charAt(0).toUpperCase() + (colony.planet_type || '').slice(1)}
                      </span>
                    </td>
                    <td className="text-right">
                      <UpgradeStars level={colony.upgrade_level || 0} />
                    </td>
                    <td className="text-right" style={{ color: '#a0aec0' }}>{colony.num_pins || '—'}</td>
                    <td className="text-right">
                      {loadingLayouts[colony.planet_id] ? (
                        <span className="spinner-small" style={{ width: 12, height: 12 }}></span>
                      ) : totalUPH > 0 ? (
                        <span style={{ color: totalUPH < LOW_EXTRACTION_THRESHOLD ? '#fbd38d' : '#68d391', fontFamily: 'monospace', fontSize: 12 }}>
                          {totalUPH.toLocaleString()}
                        </span>
                      ) : <span className="date-muted">—</span>}
                    </td>
                    <td>
                      {loadingLayouts[colony.planet_id] ? (
                        <span className="spinner-small" style={{ width: 12, height: 12 }}></span>
                      ) : <StorageBar storage={storage} />}
                    </td>
                    <td>
                      <LiveCountdown expiryTime={earliestExpiry} />
                    </td>
                    <td>
                      <AlertBadges alerts={alerts} />
                    </td>
                    <td>
                      <button className="detail-btn" onClick={() => toggleColony(colony.planet_id)}>
                        {openColony === colony.planet_id ? 'Hide' : 'Detail'}
                      </button>
                    </td>
                  </tr>
                  {openColony === colony.planet_id && (
                    <tr>
                      <td colSpan={9} style={{ padding: '4px 8px 8px' }}>
                        <ColonyDetail
                          characterId={character_id}
                          planetId={colony.planet_id}
                          planetType={colony.planet_type}
                          onClose={() => setOpenColony(null)}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============== COLONY CARD (Grid View) ==============

function ColonyCard({ colony, characterName, characterId }) {
  const [layout, setLayout] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const response = await getColonyLayout(characterId, colony.planet_id);
        setLayout(response.data);
      } catch (e) { /* silent */ }
    })();
  }, [characterId, colony.planet_id]);

  const style = getPlanetStyle(colony.planet_type);
  const pins = layout?.pins || [];
  const extractorPins = pins.filter(p => p.extractor_details);
  const factoryPins = pins.filter(p => p.factory_details);
  const storage = pins.length > 0 ? calcStorageFill(pins) : null;
  const totalUPH = extractorPins.reduce((s, p) => s + calcExtractorUPH(p), 0);

  // Find earliest extractor expiry
  const extractorExpiries = extractorPins.map(p => p.expiry_time).filter(Boolean);
  const earliestExpiry = extractorExpiries.length > 0 ? extractorExpiries.sort()[0] : null;
  const expiryDiff = earliestExpiry ? new Date(earliestExpiry).getTime() - now : null;
  const expiryColor = expiryDiff !== null ? getExpiryColor(expiryDiff) : '#4a5568';

  // Determine colony status
  const hasExpired = extractorPins.some(p => !p.expiry_time || new Date(p.expiry_time).getTime() - now <= 0);
  const isExtracting = extractorPins.some(p => p.expiry_time && new Date(p.expiry_time).getTime() - now > 0);
  const isProducing = factoryPins.length > 0;
  const needsAttention = hasExpired || (storage && storage.pct > 80);

  let statusLabel = 'Idle';
  let statusClass = 'status-idle';
  if (needsAttention) { statusLabel = 'Attention'; statusClass = 'status-attention'; }
  else if (isExtracting) { statusLabel = 'Extracting'; statusClass = 'status-extracting'; }
  else if (isProducing) { statusLabel = 'Producing'; statusClass = 'status-producing'; }

  // Fill gauge SVG
  const fillPct = storage ? storage.pct : 0;
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const fillArc = (fillPct / 100) * circumference;

  return (
    <div className={`colony-card ${statusClass}`} title={`${characterName} — ${colony.system_name || ''} — ${(colony.planet_type || '').charAt(0).toUpperCase() + (colony.planet_type || '').slice(1)}`}>
      {/* Planet icon with fill gauge */}
      <div className="colony-card-planet">
        <svg className="colony-card-gauge" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
          {fillPct > 0 && (
            <circle cx="40" cy="40" r={radius} fill="none"
              stroke={fillPct > 80 ? '#AB324A' : fillPct > 60 ? '#fbd38d' : '#4a9eff'}
              strokeWidth="4"
              strokeDasharray={`${fillArc} ${circumference - fillArc}`}
              strokeDashoffset={circumference * 0.25}
              strokeLinecap="round"
            />
          )}
        </svg>
        {getPlanetImageUrl(colony.planet_type) ? (
          <img
            src={getPlanetImageUrl(colony.planet_type)}
            alt={colony.planet_type}
            className="colony-card-planet-img"
          />
        ) : (
          <div className="colony-card-planet-icon" style={{ backgroundColor: style.dot }}>
            <span className="colony-card-planet-letter">
              {(colony.planet_type || '?').charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {needsAttention && <div className="colony-card-attention-pulse" />}
      </div>

      {/* Info */}
      <div className="colony-card-info">
        <div className="colony-card-system">{colony.planet_name || colony.system_name || `Planet ${colony.planet_id}`}</div>
        <div className="colony-card-type">
          <span className="colony-card-type-badge" style={{ color: style.dot }}>
            {(colony.planet_type || 'unknown').charAt(0).toUpperCase() + (colony.planet_type || '').slice(1)}
          </span>
        </div>
      </div>

      {/* Status bar */}
      <div className="colony-card-status">
        <div className="colony-card-expiry" style={{ color: expiryColor }}>
          {expiryDiff !== null ? formatCountdown(expiryDiff) : 'STOPPED'}
        </div>
        {totalUPH > 0 && (
          <div className="colony-card-rate">{totalUPH.toLocaleString()} u/h</div>
        )}
      </div>

      {/* Character */}
      <div className="colony-card-character">{characterName}</div>
    </div>
  );
}

// ============== MAIN PLANETS COMPONENT ==============

function Planets({ onError }) {
  const [planetData, setPlanetData] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [characterFilter, setCharacterFilter] = useState('all');
  const [alertMode, setAlertMode] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(null);
  const [autoRefreshDropdown, setAutoRefreshDropdown] = useState(false);

  const loadPlanets = useCallback(async () => {
    setLoading(true);
    try {
      // Always fetch all — filter client-side
      const response = await getCharacterPlanets(null, true);
      const charData = response.data.characters || [];
      setPlanetData(charData);
      // Build characters list from planet data
      setCharacters(charData.map(c => ({ character_id: c.character_id, character_name: c.character_name })));
    } catch (err) {
      console.error('Failed to load planets:', err);
      const status = err.response?.status;
      if (status === 502 || status === 503 || status === 504) {
        if (onError) onError('EVE servers are in maintenance — data will refresh automatically when they come back online.');
      } else {
        if (onError) onError('Failed to load planetary data');
      }
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    loadPlanets();
  }, [loadPlanets]);

  // Load auto-refresh setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('planetsAutoRefreshInterval');
    if (saved && saved !== 'null') {
      setAutoRefreshInterval(parseInt(saved));
    }
  }, []);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefreshInterval) return;

    const interval = setInterval(() => {
      loadPlanets();
    }, autoRefreshInterval * 60 * 1000);

    return () => clearInterval(interval);
  }, [autoRefreshInterval, loadPlanets]);

  const handleAutoRefreshChange = (minutes) => {
    setAutoRefreshInterval(minutes);
    if (minutes) {
      localStorage.setItem('planetsAutoRefreshInterval', minutes.toString());
    } else {
      localStorage.removeItem('planetsAutoRefreshInterval');
    }
    setAutoRefreshDropdown(false);
  };

  if (loading) {
    return (
      <div className="planets-container">
        <div className="planets-loading">
          <div className="spinner"></div>
          <span>Loading planetary colonies...</span>
        </div>
      </div>
    );
  }

  // Apply character filter
  const filteredPlanetData = characterFilter === 'all'
    ? planetData
    : planetData.filter(c => String(c.character_id) === characterFilter);

  const allEmpty = filteredPlanetData.every(c => !c.colonies || c.colonies.length === 0);

  return (
    <div className="planets-container">
      {/* Alert mode toggle */}
      {!allEmpty && (
        <div className="pi-toolbar">
          <div className="pi-toolbar-left">
            {characters.length > 1 && (
              <select className="pi-char-filter" value={characterFilter} onChange={e => setCharacterFilter(e.target.value)}>
                <option value="all">All Characters</option>
                {characters.map(c => <option key={c.character_id} value={c.character_id}>{c.character_name}</option>)}
              </select>
            )}
            <button
              className={`pi-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >☰ List</button>
            <button
              className={`pi-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >⊞ Grid</button>
            <button
              className={`alert-mode-btn ${alertMode ? 'active' : ''}`}
              onClick={() => setAlertMode(!alertMode)}
              title={alertMode ? 'Show all planets' : 'Show only planets needing attention'}
            >
              <span className="alert-mode-icon">⚠️</span>
              <span>{alertMode ? 'Alerts Only' : 'Alerts'}</span>
            </button>
          </div>
          <div className="pi-toolbar-right">
            <div className="pi-toolbar-info">
              <span className="pi-legend-item"><span className="pi-legend-dot" style={{ background: '#AB324A' }}></span> Expired</span>
              <span className="pi-legend-item"><span className="pi-legend-dot" style={{ background: '#765B21' }}></span> &lt;4h</span>
              <span className="pi-legend-item"><span className="pi-legend-dot" style={{ background: '#2C6C2F' }}></span> &lt;12h</span>
              <span className="pi-legend-item"><span className="pi-legend-dot" style={{ background: '#006596' }}></span> OK</span>
            </div>
            <div className="auto-refresh-container">
              <button
                className={`auto-refresh-btn ${autoRefreshInterval ? 'active' : ''}`}
                onClick={() => setAutoRefreshDropdown(!autoRefreshDropdown)}
              >
                <span className={`refresh-icon ${autoRefreshInterval ? 'spinning' : ''}`}>⟳</span>
                Auto: {autoRefreshInterval ? `${autoRefreshInterval}m` : 'Off'}
              </button>
              {autoRefreshDropdown && (
                <div className="auto-refresh-dropdown">
                  <div
                    className={`dropdown-item ${!autoRefreshInterval ? 'active' : ''}`}
                    onClick={() => handleAutoRefreshChange(null)}
                  >
                    Off
                  </div>
                  <div
                    className={`dropdown-item ${autoRefreshInterval === 5 ? 'active' : ''}`}
                    onClick={() => handleAutoRefreshChange(5)}
                  >
                    5 minutes
                  </div>
                  <div
                    className={`dropdown-item ${autoRefreshInterval === 10 ? 'active' : ''}`}
                    onClick={() => handleAutoRefreshChange(10)}
                  >
                    10 minutes
                  </div>
                  <div
                    className={`dropdown-item ${autoRefreshInterval === 15 ? 'active' : ''}`}
                    onClick={() => handleAutoRefreshChange(15)}
                  >
                    15 minutes
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {filteredPlanetData.length === 0 ? (
        <div className="planets-empty">No characters found.</div>
      ) : allEmpty ? (
        <div className="planets-empty">No planet colonies found.</div>
      ) : viewMode === 'grid' ? (
        <div className="pi-grid-container">
          {filteredPlanetData.filter(c => c.colonies?.length > 0).map(charData => (
            <div className="pi-grid-row" key={charData.character_id}>
              <div className="pi-grid-character">{charData.character_name}</div>
              <div className="pi-grid-colonies">
                {charData.colonies.map(colony => (
                  <ColonyCard
                    key={colony.planet_id}
                    colony={colony}
                    characterName={charData.character_name}
                    characterId={charData.character_id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        filteredPlanetData.map(charData => (
          <CharacterColonies key={charData.character_id} characterData={charData} alertMode={alertMode} />
        ))
      )}
    </div>
  );
}

export default Planets;
