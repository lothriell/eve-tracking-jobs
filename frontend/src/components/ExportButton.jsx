import React, { useState, useRef, useEffect } from 'react';
import { exportToCSV, exportToJSON } from '../services/export';
import './ExportButton.css';

function ExportButton({ getData, columns, filename = 'export' }) {
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

  const handleExport = (format) => {
    const data = getData();
    if (format === 'csv') exportToCSV(data, columns, filename);
    else exportToJSON(data, columns, filename);
    setOpen(false);
  };

  return (
    <span className="export-btn-wrap" ref={ref}>
      <button className="export-btn" onClick={() => setOpen(!open)} title="Export data">
        ↓ Export
      </button>
      {open && (
        <div className="export-dropdown">
          <div className="export-dropdown-item" onClick={() => handleExport('csv')}>Export CSV</div>
          <div className="export-dropdown-item" onClick={() => handleExport('json')}>Export JSON</div>
        </div>
      )}
    </span>
  );
}

export default ExportButton;
