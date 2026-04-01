import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const dropRef = useRef(null);

  const updatePos = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const handleClick = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target) &&
          btnRef.current && !btnRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleScroll = () => setOpen(false);
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open, updatePos]);

  const linkFn = LINKS[type];
  if (!linkFn) return null;
  const links = linkFn({ typeId, characterId, name }).filter(l => l.url && !l.url.includes('undefined'));
  if (links.length === 0) return null;

  return (
    <>
      <button
        ref={btnRef}
        className="ext-links-btn"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        title="External links"
      >
        ⇗
      </button>
      {open && (
        <div ref={dropRef} className="ext-links-dropdown" style={{ top: pos.top, left: pos.left }}>
          {links.map(link => (
            <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" className="ext-links-item" onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
        </div>
      )}
    </>
  );
}

export default ExternalLinks;
