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

  // Color logic based on utilization - high utilization = good (green)
  // In industry, you want to maximize slot usage to earn more ISK
  const getSlotClass = (current, max) => {
    if (max === 0) return 'slot-empty';
    const utilizationPercent = (current / max) * 100;
    if (utilizationPercent >= 80) return 'slot-high';     // 80-100% = green (excellent)
    if (utilizationPercent >= 40) return 'slot-medium';   // 40-79% = yellow (okay)
    return 'slot-low';                                     // 0-39% = red (poor utilization)
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
