import fetch from 'node-fetch';
import { parseDwrFishStockingHtml } from './dwrParser.js';
import { fetchColoradoEvents } from './coParser.js';
import { fetchIdahoEvents } from './idParser.js';
import { getRecentEvents } from './db.js';
import { getSupportedState } from './states.js';

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();
const inFlight = new Map();

async function fetchUtahEvents(year) {
  const base = process.env.POLL_URL_UT || process.env.POLL_URL;
  if (!base) throw new Error('Missing POLL_URL_UT (or POLL_URL) in backend environment');
  const url = new URL(base);
  if (year) url.searchParams.set('y', String(year));
  const res = await fetch(url, {
    headers: { 'User-Agent': process.env.POLL_USER_AGENT || 'FishSense/2.0', Accept: 'text/html' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Utah source returned ${res.status}`);
  return parseDwrFishStockingHtml(await res.text());
}

export async function getEventsForState(rawState, year) {
  const state = getSupportedState(rawState);
  const key = `${state}:${year || 'current'}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_MS) return { events: cached.events, stale: false };
  if (!inFlight.has(key)) {
    const promise = (async () => {
      try {
        const events = state === 'UT' ? await fetchUtahEvents(year)
          : state === 'CO' ? await fetchColoradoEvents() : await fetchIdahoEvents();
        // Do not overwrite a healthy cache with an empty result caused by page changes.
        if (!Array.isArray(events) || (events.length === 0 && state !== 'ID')) throw new Error(`${state} source returned no parsed entries`);
        const normalized = events.map((e) => ({ ...e, state }));
        cache.set(key, { events: normalized, time: Date.now() });
        return { events: normalized, stale: false };
      } catch (error) {
        if (cached) return { events: cached.events, stale: true };
        const dbFallback = getRecentEvents(5000, state);
        if (dbFallback.length) return { events: dbFallback, stale: true };
        throw error;
      }
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
  }
  return inFlight.get(key);
}
