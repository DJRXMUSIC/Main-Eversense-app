import { v4 as uuidv4 } from 'uuid';

const TIMESTAMP_COLUMNS = ['date', 'timestamp', 'start', 'startdate', 'start date'];
const GLUCOSE_COLUMNS = ['value', 'qty', 'quantity', 'blood glucose', 'glucose', 'blood glucose (mg/dl)'];

export function parseGlucoseCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) {
    return { readings: [], errors: 0 };
  }

  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const timestampIdx = headers.findIndex(h => TIMESTAMP_COLUMNS.includes(h));
  const glucoseIdx = headers.findIndex(h => GLUCOSE_COLUMNS.includes(h));

  if (timestampIdx === -1 || glucoseIdx === -1) {
    throw new Error(
      `Could not find required columns. Found: [${headers.join(', ')}]. ` +
      `Need a timestamp column (${TIMESTAMP_COLUMNS.join('/')}) and ` +
      `a glucose column (${GLUCOSE_COLUMNS.join('/')}).`
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
  let date = new Date(str);
  if (!isNaN(date.getTime())) return date;

  const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i);
  if (usMatch) {
    let [, month, day, year, hours, minutes, seconds, ampm] = usMatch;
    hours = parseInt(hours);
    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && hours !== 12) hours += 12;
      if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    }
    date = new Date(year, month - 1, day, hours, parseInt(minutes), parseInt(seconds || 0));
    if (!isNaN(date.getTime())) return date;
  }

  return null;
}
