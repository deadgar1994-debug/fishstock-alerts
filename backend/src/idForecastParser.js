import crypto from 'crypto';
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const REGIONS = /^(panhandle|clearwater|southwest|magic valley|southeast|upper snake|salmon) region$/i;
const WEEK = /^([a-z]{3})\s+(\d{1,2})\s*[-–]\s*(?:[a-z]{3}\s+)?\d{1,2}(?:\s*,?\s*(\d{4}))?$/i;
const NO_FORECAST = /currently\s+no\s+fish\s+stocking[\s\S]{0,90}scheduled|no\s+(?:fish\s+)?stocking\s+(?:events?\s+)?scheduled/i;
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

export function normalizeIdahoWeek(value, now = new Date()) {
  const match = String(value || '').trim().match(WEEK);
  if (!match) return '';
  const month = MONTHS[match[1].toLowerCase()];
  const day = Number(match[2]);
  if (!month || day < 1 || day > 31) return '';
  // Early winter forecast pages can list January/February of the next year.
  let year = match[3] ? Number(match[3]) : now.getFullYear();
  if (!match[3] && now.getMonth() + 1 >= 11 && month <= 2) year++;
  const test = new Date(Date.UTC(year, month - 1, day));
  if (test.getUTCFullYear() !== year || test.getUTCMonth() + 1 !== month || test.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractText(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(?:tr|td|th|p|div|li|h[1-6]|section|table|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t\r]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{2,}/g, '\n').trim();
}

/** Only current agency forecast weeks are shown, never old stockings as forecasts. */
export function parseIdahoForecastHtml(html, now = new Date()) {
  const text = extractText(html);
  if (NO_FORECAST.test(text)) return [];
  const header = text.search(/fish stocking forecasts/i);
  const display = text.search(/displaying\s+\d/i);
  const start = display >= 0 ? display : header >= 0 ? header : 0;
  let section = text.slice(start);
  const stop = section.search(/(?:subscribe to rss feed|recent regional fishing articles|statewide trout stocking highlights|idaho fishing planner)/i);
  if (stop > 0) section = section.slice(0, stop);

  const lines = section.split('\n').map((v) => v.trim()).filter(Boolean);
  let region = 'IDAHO';
  let pendingWater = '';
  let pendingWeek = '';
  const events = [];
  const headers = new Set(['body of water', 'region', 'week to be stocked', 'number to be stocked', 'atlas', 'link']);
  for (const line of lines) {
    if (REGIONS.test(line)) { region = line.toUpperCase(); pendingWater = ''; pendingWeek = ''; continue; }
    if (headers.has(line.toLowerCase()) || /^displaying\s+\d/i.test(line)) continue;
    if (/^special rules:/i.test(line)) continue;
    if (WEEK.test(line)) { pendingWeek = line; continue; }
    if (/^\d[\d,]*$/.test(line) && pendingWater && pendingWeek) {
      const quantity = Number(line.replace(/,/g, ''));
      const date_stocked = normalizeIdahoWeek(pendingWeek, now);
      if (date_stocked && quantity > 0) {
        const species = 'RAINBOW TROUT'; // Agency page defaults to rainbow unless noted.
        events.push({ id: sha1(`ID|${pendingWater}|${region}|${species}|${date_stocked}|${quantity}`),
          water_name: pendingWater, county: region, species, quantity, avg_length: null, date_stocked,
          first_seen_at: now.toISOString() });
      }
      pendingWater = ''; pendingWeek = '';
      continue;
    }
    // Only recognize a body-of-water candidate before the date/quantity pair.
    if (!pendingWeek && !/^\d+$/.test(line) && !/^fish stocking|^forecasts of |^stocking of all waters|^dates may change|^this report highlights|^unless noted/i.test(line)) {
      pendingWater = line;
    }
  }
  // Page changes should not silently become an empty feed. Empty is valid only
  // when the agency explicitly states that no forecasts are scheduled.
  if (!events.length) throw new Error('Idaho forecast layout changed or no valid forecast rows were found.');
  const seen = new Set();
  return events.filter((e) => !seen.has(e.id) && seen.add(e.id));
}

