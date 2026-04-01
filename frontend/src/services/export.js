// CSV/JSON export utilities — pure client-side, no library needed

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function exportToCSV(data, columns, filename) {
  const header = columns.map(c => escapeCSV(c.label)).join(',');
  const rows = data.map(row =>
    columns.map(c => escapeCSV(row[c.key])).join(',')
  );
  const csv = [header, ...rows].join('\r\n');
  downloadBlob(csv, `${filename}.csv`, 'text/csv;charset=utf-8;');
}

export function exportToJSON(data, columns, filename) {
  // Filter to only the columns specified
  const filtered = data.map(row => {
    const obj = {};
    columns.forEach(c => { obj[c.label || c.key] = row[c.key] ?? null; });
    return obj;
  });
  const json = JSON.stringify(filtered, null, 2);
  downloadBlob(json, `${filename}.json`, 'application/json;charset=utf-8;');
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
