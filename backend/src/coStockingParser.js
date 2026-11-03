import crypto from 'crypto';

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
function dateISO(s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return '';
  const yyyy = Number(m[3]), mm = Number(m[1]), dd = Number(m[2]);
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() + 1 !== mm || d.getUTCDate() !== dd) return '';
  return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}
function textOf(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(?:tr|td|th|p|div|li|h[1-6]|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t\r]+/g, ' ')
    .replace(/\n\s+/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

/** CPW's report date is when a water was added to the report, NOT necessarily stocking day. */
export function parseColoradoStockingHtml(html, now = new Date()) {
  const text = textOf(html);
  const start = text.toLowerCase().indexOf('trout stocking report');
  if (start < 0) return [];
  let section = text.slice(start);
  const stop = section.toLowerCase().indexOf('view stocking report archive');
  if (stop > 0) section = section.slice(0, stop);
  const skip = new Set(['trout stocking report', 'body of water', 'region', 'report date', 'link', 'atlas', 'atlas+']);
  const lines = section.split('\n').map((line) => line.trim()).filter((line) => line && !skip.has(line.toLowerCase()));
  const result = [];
  for (let i = 0; i + 2 < lines.length; i++) {
    const water = lines[i], region = lines[i + 1], reportDate = dateISO(lines[i + 2]);
    if (!reportDate || dateISO(water) || dateISO(region)) continue;
    if (!/^(northeast|northwest|southeast|southwest)$/i.test(region)) continue;
    const county = region.toUpperCase();
    const species = 'TROUT';
    result.push({ id: sha1(`CO|${water}|${county}|${species}|${reportDate}`),
      water_name: water, county, species, quantity: null, avg_length: null,
      date_stocked: reportDate, first_seen_at: now.toISOString() });
    i += 2;
  }
  const seen = new Set();
  return result.filter((e) => !seen.has(e.id) && seen.add(e.id));
}
