import fetch from 'node-fetch';
import { parseIdahoForecastHtml } from './idForecastParser.js';
export { parseIdahoForecastHtml, normalizeIdahoWeek } from './idForecastParser.js';

export async function fetchIdahoEvents() {
  const url = process.env.POLL_URL_ID;
  if (!url) throw new Error('Missing POLL_URL_ID in backend environment');
  const res = await fetch(url, {
    headers: { 'User-Agent': process.env.POLL_USER_AGENT || 'FishSense/2.0', Accept: 'text/html' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Idaho source returned ${res.status}`);
  return parseIdahoForecastHtml(await res.text());
}
