// CSV parser for import functionality

export const parseCSV = (csvText) => {
  const lines = csvText.trim().split('\n');
  if (lines.length === 0) return { headers: [], rows: [] };

  let headers = parseCSVLine(lines[0]);

  // Find and normalize referrer column to lowercase
  const referrerHeaderIdx = headers.findIndex(h => h.toLowerCase() === 'referrer');
  if (referrerHeaderIdx !== -1 && headers[referrerHeaderIdx] !== 'referrer') {
    const originalName = headers[referrerHeaderIdx];
    headers[referrerHeaderIdx] = 'referrer';
  }

  const rows = lines.slice(1).map((line, index) => {
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((header, i) => {
      row[header] = values[i] || '';
    });

    // Copy data from original case variant to lowercase 'referrer' if needed
    if (referrerHeaderIdx !== -1) {
      const originalName = parseCSVLine(lines[0])[referrerHeaderIdx];
      if (originalName !== 'referrer' && originalName && row[originalName] !== undefined) {
        row.referrer = row[originalName];
        delete row[originalName];
      }
    }

    return { ...row, _rowIndex: index + 1 };
  });

  // Ensure referrer column exists (will be empty if not in CSV)
  if (!headers.includes('referrer')) {
    headers = [...headers, 'referrer'];
    rows.forEach(row => {
      row.referrer = '';
    });
  }

  return { headers, rows };
};

const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map(v => v.trim());
};
