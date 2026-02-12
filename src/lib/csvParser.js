import { v4 as uuidv4 } from 'uuid';

/**
 * Parse a CSV file from Health Auto Export and extract glucose readings.
 * Uses fuzzy/substring matching to handle the wide variety of column names
 * that Health Auto Export and Apple Health exports can produce.
 */

// Patterns to match timestamp columns (checked via substring/includes)
const TIMESTAMP_PATTERNS = ['date', 'timestamp', 'start', 'time'];
// Patterns to match glucose value columns
const GLUCOSE_PATTERNS = ['glucose', 'value', 'qty', 'quantity', 'bg'];

/**
 * Find a column index by fuzzy matching against patterns.
 * Tries exact match first, then substring match.
 */
function findColumnIndex(headers, patterns) {
  // First pass: exact match
  for (const pattern of patterns) {
    const idx = headers.findIndex(h => h === pattern);
    if (idx !== -1) return idx;
  }
  // Second pass: header contains pattern
  for (const pattern of patterns) {
    const idx = headers.findIndex(h => h.includes(pattern));
    if (idx !== -1) return idx;
  }
  return -1;
}

export function parseGlucoseCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) {
    return { readings: [], errors: 0 };
  }

  const rawHeaders = parseCSVLine(lines[0]);
  const headers = rawHeaders.map(h => h.trim().toLowerCase().replace(/[()]/g, ''));
  const timestampIdx = findColumnIndex(headers, TIMESTAMP_PATTERNS);
  const glucoseIdx = findColumnIndex(headers, GLUCOSE_PATTERNS);

  if (timestampIdx === -1 || glucoseIdx === -1) {
    // Show a concise error with just the first few column names
    const preview = rawHeaders.slice(0, 6).map(h => h.trim()).join(', ');
    const extra = rawHeaders.length > 6 ? ` (+${rawHeaders.length - 6} more)` : '';
    const missing = [];
    if (timestampIdx === -1) missing.push('timestamp/date');
    if (glucoseIdx === -1) missing.push('glucose/value');
    throw new Error(
      `Could not find ${missing.join(' or ')} column. ` +
      `Columns found: ${preview}${extra}`
    );
  }

  const readings = [];
  let errors = 0;

  for (let i = 1; i < lines.length; i++) {
    try {
      const fields = parseCSVLine(lines[i]);
      if (fields.length <= Math.max(timestampIdx, glucoseIdx)) {
        errors++;
        continue;
      }

      const rawTimestamp = fields[timestampIdx].trim();
      const rawValue = fields[glucoseIdx].trim();

      if (!rawTimestamp || !rawValue) {
        errors++;
        continue;
      }

      const timestamp = parseTimestamp(rawTimestamp);
      const value = parseFloat(rawValue);

      if (!timestamp || isNaN(value) || value < 20 || value > 600) {
        errors++;
        continue;
      }

      readings.push({
        id: uuidv4(),
        timestamp: timestamp.toISOString(),
        date: timestamp.toISOString().split('T')[0],
        value: Math.round(value),
        source: 'import',
      });
    } catch {
      errors++;
    }
  }

  return { readings, errors };
}

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function parseTimestamp(str) {
  // Try ISO 8601 first
  let date = new Date(str);
  if (!isNaN(date.getTime())) return date;

  // Try US format: MM/DD/YYYY HH:MM:SS AM/PM
  const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i);
  if (usMatch) {
    let [, month, day, year, hours, minutes, seconds, ampm] = usMatch;
    if (year.length === 2) year = '20' + year;
    hours = parseInt(hours);
    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && hours !== 12) hours += 12;
      if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    }
    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), hours, parseInt(minutes), parseInt(seconds || 0));
    if (!isNaN(date.getTime())) return date;
  }

  // Try: YYYY-MM-DD HH:MM (no T separator)
  const isoishMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (isoishMatch) {
    const [, y, m, d, h, min, sec] = isoishMatch;
    date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min), parseInt(sec || 0));
    if (!isNaN(date.getTime())) return date;
  }

  return null;
}
