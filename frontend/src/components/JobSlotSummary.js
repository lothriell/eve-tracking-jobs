import React from 'react';
import './JobSlotSummary.css';

function JobSlotSummary({ slots, loading }) {
  if (loading) {
    return (
      <div className="job-slot-summary loading">
        <div className="spinner-small"></div>
      </div>
    );
  }

  const getSlotClass = (current, max) => {
    if (max === 0) return 'slot-empty';
    const ratio = current / max;
    if (ratio >= 1) return 'slot-full';
    if (ratio >= 0.8) return 'slot-warning';
    return 'slot-available';
  };

  return (
    <div className="job-slot-summary">
      <div className={`slot-item ${getSlotClass(slots.manufacturing?.current, slots.manufacturing?.max)}`}>
        <span className="slot-label">Manufacturing jobs</span>
        <span className="slot-value">
          <span className="slot-current">{slots.manufacturing?.current || 0}</span>
          <span className="slot-separator">/</span>
          <span className="slot-max">{slots.manufacturing?.max || 0}</span>
        </span>
      </div>
      
      <div className={`slot-item ${getSlotClass(slots.science?.current, slots.science?.max)}`}>
        <span className="slot-label">Science jobs</span>
        <span className="slot-value">
          <span className="slot-current">{slots.science?.current || 0}</span>
          <span className="slot-separator">/</span>
          <span className="slot-max">{slots.science?.max || 0}</span>
        </span>
      </div>
      
      <div className={`slot-item ${getSlotClass(slots.reactions?.current, slots.reactions?.max)}`}>
        <span className="slot-label">Reactions</span>
        <span className="slot-value">
          <span className="slot-current">{slots.reactions?.current || 0}</span>
          <span className="slot-separator">/</span>
          <span className="slot-max">{slots.reactions?.max || 0}</span>
        </span>
      </div>
    </div>
  );
}

export default JobSlotSummary;
