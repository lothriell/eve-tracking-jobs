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

// Clipboard copy with a fallback for non-secure contexts. `navigator.clipboard`
// only exists on HTTPS / localhost, so on the internal test HTTP URL it's
// undefined or the writeText call silently rejects. The textarea +
// execCommand path works everywhere the app loads.
export async function copyToClipboard(text) {
  // Preferred path — available on HTTPS and localhost
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // Off-screen but still selectable
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
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
