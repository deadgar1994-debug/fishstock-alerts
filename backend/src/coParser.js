import fetch from 'node-fetch';
import { parseColoradoStockingHtml } from './coStockingParser.js';
export { parseColoradoStockingHtml } from './coStockingParser.js';

export async function fetchColoradoEvents() {
  const url = process.env.POLL_URL_CO;
  if (!url) throw new Error('Missing POLL_URL_CO in backend environment');
  const res = await fetch(url, {
    headers: { 'User-Agent': process.env.POLL_USER_AGENT || 'FishSense/2.0', Accept: 'text/html' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Colorado source returned ${res.status}`);
  return parseColoradoStockingHtml(await res.text());
}
