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

// Storage capacity by command center level (m³)
const CC_STORAGE_CAPACITY = {
  0: 500, 1: 500, 2: 500, 3: 500, 4: 500, 5: 500
};

// Launchpad and storage facility capacities
const STORAGE_PIN_CAPACITIES = {
  2256: 10000,  // Launchpad
  2541: 10000,  // Launchpad (alternate)
  2543: 12000,  // Storage Facility
  2544: 12000,  // Storage Facility (alternate)
  2552: 500,    // Command Center (level 0-5 varies, default 500)
};

// PI product volumes (m³ per unit)
const PI_PRODUCT_VOLUMES = {
  // R0 - Raw resources
  2267: 0.01, 2268: 0.01, 2270: 0.01, 2272: 0.01, 2286: 0.01,
  2287: 0.01, 2288: 0.01, 2305: 0.01, 2306: 0.01, 2307: 0.01,
  2308: 0.01, 2309: 0.01, 2310: 0.01, 2311: 0.01,
  // P1 - Basic processed
  2389: 0.38, 2390: 0.38, 2392: 0.38, 2393: 0.38, 2395: 0.38,
  2396: 0.38, 2397: 0.38, 2398: 0.38, 2399: 0.38, 2400: 0.38,
  2401: 0.38, 3645: 0.38, 3683: 0.38, 3779: 0.38, 9828: 0.38,
  // P2 - Refined
  44: 1.50, 2312: 1.50, 2317: 1.50, 2319: 1.50, 2321: 1.50,
  2327: 1.50, 2328: 1.50, 2329: 1.50, 2463: 1.50, 3689: 1.50,
  3691: 1.50, 3693: 1.50, 3695: 1.50, 3697: 1.50, 3725: 1.50,
  3775: 1.50, 9830: 1.50, 9832: 1.50, 9834: 1.50, 9836: 1.50,
  9838: 1.50, 9840: 1.50, 9842: 1.50, 15317: 1.50,
  // P3 - Specialized
  2344: 6.00, 2345: 6.00, 2346: 6.00, 2348: 6.00, 2349: 6.00,
  2351: 6.00, 2352: 6.00, 2354: 6.00, 2358: 6.00, 2360: 6.00,
  2361: 6.00, 2366: 6.00, 2367: 6.00, 12836: 6.00, 17136: 6.00,
  17392: 6.00, 17898: 6.00, 28444: 6.00,
  // P4 - Advanced
  2867: 100.00, 2868: 100.00, 2869: 100.00, 2870: 100.00,
  2871: 100.00, 2872: 100.00, 2875: 100.00, 2876: 100.00,
};

// Default volume for unknown types
const DEFAULT_VOLUME = 0.01;

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
    const cap = STORAGE_PIN_CAPACITIES[pin.type_id];
    if (!cap && !pin.contents?.length) continue;

    if (cap) {
      totalCapacity += cap;
      if (pin.contents?.length) {
        for (const item of pin.contents) {
          const vol = PI_PRODUCT_VOLUMES[item.type_id] || DEFAULT_VOLUME;
          totalUsed += vol * item.amount;
        }
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
    if (p.extractor_details?.expiry_time) {
      if (new Date(p.extractor_details.expiry_time) - Date.now() <= 0) {
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

          {/* Pins table with live countdowns and extraction rates */}
          {pins.length > 0 && (
            <table className="pins-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Pin ID</th>
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
                  const expiry = pin.extractor_details?.expiry_time;
                  const uph = isExtractor ? calcExtractorUPH(pin) : 0;
                  const contents = pin.contents || [];
                  const contentStr = contents.length
                    ? contents.map(c => `${c.type_id}×${c.amount}`).join(', ')
                    : '—';

                  return (
                    <tr key={pin.pin_id || idx}>
                      <td><span className={`badge ${badge}`}>{kind}</span></td>
                      <td style={{ fontFamily: 'monospace', color: '#718096' }}>{pin.pin_id || pin.type_id}</td>
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
              <th>Planet</th>
              <th>Type</th>
              <th className="text-right">Level</th>
              <th className="text-right">Pins</th>
              <th className="text-right">Rate</th>
              <th>Storage</th>
              <th>Expiry</th>
              <th>Status</th>
              <th></th>
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
                .map(p => p.extractor_details?.expiry_time)
                .filter(Boolean);
              const earliestExpiry = extractorExpiries.length > 0
                ? extractorExpiries.sort()[0]
                : colony.expiry_date;

              return (
                <React.Fragment key={colony.planet_id}>
                  <tr className={hasAnyAlert(alerts) ? 'colony-row-alert' : ''}>
                    <td>
                      <span className="planet-dot" style={{ backgroundColor: style.dot, width: 8, height: 8, borderRadius: '50%', display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }} />
                      System {colony.solar_system_id || '—'}
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

// ============== MAIN PLANETS COMPONENT ==============

function Planets({ selectedCharacter, onError }) {
  const [planetData, setPlanetData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alertMode, setAlertMode] = useState(false);

  const loadPlanets = useCallback(async () => {
    setLoading(true);
    try {
      const charId = selectedCharacter?.character_id || null;
      const all = !selectedCharacter;
      const response = await getCharacterPlanets(charId, all);
      setPlanetData(response.data.characters || []);
    } catch (err) {
      console.error('Failed to load planets:', err);
      if (onError) onError('Failed to load planetary data');
    } finally {
      setLoading(false);
    }
  }, [selectedCharacter, onError]);

  useEffect(() => {
    loadPlanets();
  }, [loadPlanets]);

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

  const allEmpty = planetData.every(c => !c.colonies || c.colonies.length === 0);

  return (
    <div className="planets-container">
      {/* Alert mode toggle */}
      {!allEmpty && (
        <div className="pi-toolbar">
          <button
            className={`alert-mode-btn ${alertMode ? 'active' : ''}`}
            onClick={() => setAlertMode(!alertMode)}
            title={alertMode ? 'Show all planets' : 'Show only planets needing attention'}
          >
            <span className="alert-mode-icon">⚠️</span>
            <span>{alertMode ? 'Showing Alerts Only' : 'Alert Mode'}</span>
          </button>
          <div className="pi-toolbar-info">
            <span className="pi-legend-item"><span className="pi-legend-dot" style={{ background: '#AB324A' }}></span> Expired</span>
            <span className="pi-legend-item"><span className="pi-legend-dot" style={{ background: '#765B21' }}></span> &lt;4h</span>
            <span className="pi-legend-item"><span className="pi-legend-dot" style={{ background: '#2C6C2F' }}></span> &lt;12h</span>
            <span className="pi-legend-item"><span className="pi-legend-dot" style={{ background: '#006596' }}></span> OK</span>
          </div>
        </div>
      )}

      {planetData.length === 0 ? (
        <div className="planets-empty">No characters found.</div>
      ) : allEmpty ? (
        <div className="planets-empty">No planet colonies found.</div>
      ) : (
        planetData.map(charData => (
          <CharacterColonies key={charData.character_id} characterData={charData} alertMode={alertMode} />
        ))
      )}
    </div>
  );
}

export default Planets;
