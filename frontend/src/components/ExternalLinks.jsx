import React, { useState, useRef, useEffect } from 'react';
import './ExternalLinks.css';

const LINKS = {
  item: (props) => [
    { label: 'Fuzzwork Market', url: `https://market.fuzzwork.co.uk/hub/type/${props.typeId}/` },
    { label: 'EVE Ref', url: `https://everef.net/type/${props.typeId}` },
    { label: 'zKillboard', url: `https://zkillboard.com/ship/${props.typeId}/` },
  ],
  system: (props) => [
    { label: 'Dotlan', url: `https://evemaps.dotlan.net/system/${encodeURIComponent(props.name)}` },
  ],
  character: (props) => [
    { label: 'zKillboard', url: `https://zkillboard.com/character/${props.characterId}/` },
  ],
};

function ExternalLinks({ type, typeId, characterId, name }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const linkFn = LINKS[type];
  if (!linkFn) return null;
  const links = linkFn({ typeId, characterId, name }).filter(l => l.url && !l.url.includes('undefined'));
  if (links.length === 0) return null;

  return (
    <span className="ext-links-wrap" ref={ref}>
      <button className="ext-links-btn" onClick={(e) => { e.stopPropagation(); setOpen(!open); }} title="External links">
        ⇗
      </button>
      {open && (
        <div className="ext-links-dropdown">
          {links.map(link => (
            <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" className="ext-links-item" onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
        </div>
      )}
    </span>
  );
}

export default ExternalLinks;
