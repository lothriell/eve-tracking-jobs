import React, { useEffect, useState, useCallback } from 'react';
import { getCharacterPlanets, getColonyLayout, getAllCharacters } from '../services/api';
import './Planets.css';

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

function getPlanetStyle(type) {
  return PLANET_COLORS[(type || '').toLowerCase()] || {
    bg: 'rgba(90,106,122,0.15)', border: 'rgba(90,106,122,0.4)', dot: '#5a6a7a'
  };
}

function formatExpiry(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  const diff = d - Date.now();
  if (diff < 0) return { label: 'Expired', cls: 'expiry-expired' };
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const label = h > 48 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
  const cls = h < 24 ? 'expiry-warning' : 'expiry-ok';
  return { label, cls };
}

function UpgradeStars({ level }) {
  const max = 5;
  return (
    <span className="upgrade-stars">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < level ? '' : 'upgrade-star-empty'}>
          {i < level ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}

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

  const extractors = pins.filter(p => p.extractor_details).length;
  const factories  = pins.filter(p => p.factory_details).length;
  const withContents = pins.filter(p => p.contents && p.contents.length > 0).length;

  const style = getPlanetStyle(planetType);

  return (
    <div className="colony-detail-panel">
      <div className="colony-detail-header">
        <span
          className="planet-dot"
          style={{ backgroundColor: style.dot, width: 10, height: 10, borderRadius: '50%', display: 'inline-block' }}
        />
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
          <div className="colony-stats-grid">
            <div className="colony-stat-box">
              <div className="colony-stat-label">Extractors</div>
              <div className="colony-stat-value extractors">{extractors}</div>
            </div>
            <div className="colony-stat-box">
              <div className="colony-stat-label">Factories</div>
              <div className="colony-stat-value factories">{factories}</div>
            </div>
            <div className="colony-stat-box">
              <div className="colony-stat-label">With Contents</div>
              <div className="colony-stat-value contents">{withContents}</div>
            </div>
          </div>

          {pins.length > 0 && (
            <table className="pins-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Pin ID</th>
                  <th>Expiry</th>
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
                  const expiryInfo = expiry ? formatExpiry(expiry) : null;
                  const contents = pin.contents || [];
                  const contentStr = contents.length
                    ? contents.map(c => `${c.type_id}×${c.amount}`).join(', ')
                    : '—';

                  return (
                    <tr key={pin.pin_id || idx}>
                      <td><span className={`badge ${badge}`}>{kind}</span></td>
                      <td style={{ fontFamily: 'monospace', color: '#718096' }}>{pin.pin_id || pin.type_id}</td>
                      <td>
                        {expiryInfo
                          ? <span className={expiryInfo.cls}>{expiryInfo.label}</span>
                          : <span className="date-muted">—</span>
                        }
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

function CharacterColonies({ characterData }) {
  const [openColony, setOpenColony] = useState(null);

  const { character_id, character_name, colonies, error: charError } = characterData;

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
    return (
      <div className="planets-empty" style={{ padding: '20px', textAlign: 'left' }}>
        No colonies found for {character_name}.
      </div>
    );
  }

  return (
    <div className="character-colonies-section">
      <div className="colonies-card">
        <div className="colonies-card-header">
          <span className="colonies-card-title">
            {character_name} — {colonies.length} {colonies.length === 1 ? 'Colony' : 'Colonies'}
          </span>
          <span className="badge badge-green">{colonies.length} active</span>
        </div>

        <table className="colonies-table">
          <thead>
            <tr>
              <th>Planet</th>
              <th>Type</th>
              <th className="text-right">Level</th>
              <th className="text-right">Pins</th>
              <th>Last Update</th>
              <th>Expiry</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {colonies.map(colony => {
              const style = getPlanetStyle(colony.planet_type);
              const expiryInfo = formatExpiry(colony.expiry_date);

              return (
                <React.Fragment key={colony.planet_id}>
                  <tr>
                    <td>
                      <span
                        className="planet-dot"
                        style={{ backgroundColor: style.dot, width: 8, height: 8, borderRadius: '50%', display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }}
                      />
                      System {colony.solar_system_id || '—'}
                    </td>
                    <td>
                      <span
                        className="planet-type-badge"
                        style={{ backgroundColor: style.bg, borderColor: style.border, color: style.dot }}
                      >
                        {(colony.planet_type || 'unknown').charAt(0).toUpperCase() + (colony.planet_type || '').slice(1)}
                      </span>
                    </td>
                    <td className="text-right">
                      <UpgradeStars level={colony.upgrade_level || 0} />
                    </td>
                    <td className="text-right" style={{ color: '#a0aec0' }}>{colony.num_pins || '—'}</td>
                    <td>
                      <span className="date-muted">
                        {colony.last_update ? new Date(colony.last_update).toLocaleDateString() : '—'}
                      </span>
                    </td>
                    <td>
                      {expiryInfo
                        ? <span className={expiryInfo.cls}>{expiryInfo.label}</span>
                        : <span className="date-muted">—</span>
                      }
                    </td>
                    <td>
                      <button
                        className="detail-btn"
                        onClick={() => toggleColony(colony.planet_id)}
                      >
                        {openColony === colony.planet_id ? 'Hide' : 'Detail'}
                      </button>
                    </td>
                  </tr>
                  {openColony === colony.planet_id && (
                    <tr>
                      <td colSpan={7} style={{ padding: '4px 8px 8px' }}>
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

function Planets({ selectedCharacter, onError }) {
  const [planetData, setPlanetData] = useState([]);
  const [loading, setLoading] = useState(true);

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
      {planetData.length === 0 ? (
        <div className="planets-empty">No characters found.</div>
      ) : allEmpty ? (
        <div className="planets-empty">No planet colonies found.</div>
      ) : (
        planetData.map(charData => (
          <CharacterColonies key={charData.character_id} characterData={charData} />
        ))
      )}
    </div>
  );
}

export default Planets;
