import crypto from 'node:crypto';

const hash = (value) => crypto.createHash('sha1').update(value).digest('hex');

/** Convert an official mm/dd/yyyy date to UTC calendar date (no local-time drift). */
export function idahoDate(value) {
  const match = typeof value === 'string' && /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  const [month, day, year] = [Number(mm), Number(dd), Number(yyyy)];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1967 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/**
 * Parse the actual Idaho Fishing Planner JSON API response, not the HTML shell.
 * API `total` represents its entire historical collection, not the selected year.
 */
export function parseIdahoApiPage(payload) {
  if (!payload || payload.response !== 'success' || !Array.isArray(payload.rows) ||
      !Number.isSafeInteger(Number(payload.total)) || Number(payload.total) < 0) {
    throw new Error('Idaho stocking API returned an unrecognized response.');
  }
  const total = Number(payload.total);
  if (total > 5000000) throw new Error('Idaho stocking API returned an unreasonable total.');
  const rows = payload.rows.map((source) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new Error('Idaho stocking API returned an invalid row.');
    }
    const date_stocked = idahoDate(source.stocked);
    const water_name = typeof source.name === 'string' ? source.name.trim() : '';
    const species = typeof source.spp === 'string' ? source.spp.trim() : '';
    const county = typeof source.loc === 'string' ? source.loc.trim() : '';
    const quantityText = typeof source.n === 'number' ? String(source.n) : String(source.n ?? '').trim();
    const quantity = Number(quantityText.replace(/,/g, ''));
    if (!date_stocked || !water_name || !species || !county || !/^\d{1,12}(,\d{3})*$/.test(quantityText) ||
        !Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new Error('Idaho stocking API row is missing a valid water, county, species, quantity, or date.');
    }
    return {
      water_name, county, species, quantity, date_stocked, avg_length: null,
      size_category: typeof source.len === 'string' ? source.len.trim() || null : null,
      water_source_id: typeof source.id === 'string' ? source.id : String(source.id ?? ''),
    };
  });
  return { total, rows };
}

/**
 * Convert paginated rows to uniquely identified reports. The agency's `id`
 * identifies a WATER and repeats across separate stockings; never use it as
 * the unique stocking-event identifier.
 */
export function collectIdahoReports(rows, { year = new Date().getUTCFullYear(), now = new Date() } = {}) {
  const target = Number(year);
  if (!Number.isInteger(target) || target < 1967 || target > 2100) throw new Error('Invalid Idaho stocking year.');
  const cutoff = now.getTime() + 24 * 60 * 60 * 1000;
  const occurrences = new Map();
  const reports = [];
  for (const row of rows) {
    const stockedTime = Date.parse(`${row.date_stocked}T00:00:00Z`);
    if (Number(row.date_stocked.slice(0, 4)) !== target || !Number.isFinite(stockedTime) || stockedTime > cutoff) continue;
    const identity = [row.water_source_id, row.water_name, row.county, row.species, row.quantity, row.date_stocked, row.size_category || ''].join('|');
    const ordinal = (occurrences.get(identity) ?? 0) + 1;
    occurrences.set(identity, ordinal);
    const { water_source_id, ...data } = row;
    reports.push({ id: hash(`ID|historical|${identity}|${ordinal}`), state: 'ID', ...data });
  }
  return reports;
}
