import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getEventsForState } from './eventService.js';
import { getSupportedState, SUPPORTED_STATES } from './states.js';
import { deleteSubscription, recordStateRequest, listStateRequests } from './db.js';
import { requestedState } from './stateRequests.js';
import { runPollOnce } from './runPollOnce.js';
dotenv.config();

const app = express();
app.disable('x-powered-by');
app.use(cors()); // Native mobile clients may not send Origin.
app.use(express.json({ limit: '16kb' }));

function failure(res, error) {
  const status = error?.status || 503;
  console.error('[API]', error?.message || error);
  return res.status(status).json({ ok: false, error: error?.message || 'Data temporarily unavailable' });
}
function yearFrom(req) {
  if (req.query.year === undefined) return undefined;
  const year = Number(req.query.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    const error = new Error('Invalid year'); error.status = 400; throw error;
  }
  return year;
}
function pagination(req) {
  return {
    limit: Math.max(1, Math.min(Number.parseInt(String(req.query.limit || '50'), 10) || 50, 500)),
    offset: Math.max(0, Number.parseInt(String(req.query.offset || '0'), 10) || 0),
  };
}
function safeFilters(body) {
  const normalize = (value) => [...new Set((Array.isArray(value) ? value : [])
    .slice(0, 60).map((v) => String(v).trim().toUpperCase().slice(0, 120)).filter(Boolean))];
  return {
    states: normalize(body.states?.length ? body.states : ['UT']).map(getSupportedState),
    counties: normalize(body.counties),
    species: normalize(body.species),
    waters: normalize(body.waters),
  };
}
function validateToken(token) {
  return typeof token === 'string' && token.length < 250 &&
    /^(Expo(nent)?PushToken)\[[\w-]+\]$/.test(token);
}
function adminOnly(req, res, next) {
  const configured = process.env.CRON_KEY;
  const supplied = req.get('x-admin-key') || req.query.key;
  if (!configured || supplied !== configured) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  next();
}
// Bound writes on public token-registration routes; production should also use hosting/WAF throttling.
const hits = new Map();
function limitWrites(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const hit = hits.get(ip);
  if (!hit || now > hit.reset) hits.set(ip, { count: 1, reset: now + 60_000 });
  else if (++hit.count > 30) return res.status(429).json({ ok: false, error: 'Too many requests' });
  if (hits.size > 5000) hits.clear();
  next();
}

app.get('/health', (_, res) => res.json({ ok: true }));
app.get('/version', (_, res) => res.json({ ok: true, version: 'fishsense-2.0.0' }));
app.get('/meta/states', (_, res) => res.json({ ok: true, states: Object.values(SUPPORTED_STATES) }));

// Older releases may still attempt to subscribe; this feature has been retired.
app.post('/subscribe', (_req, res) => res.status(410).json({ ok: false, error: 'Stocking alerts have been discontinued.' }));

// One simple selection; no account, message body, or contact details are collected.
const requestLimits = new Map();
app.post('/state-requests', limitWrites, (req, res) => {
  const state = requestedState(req.body?.state);
  if (!state) return res.status(400).json({ ok: false, error: 'Choose a state that is not already supported.' });
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const last = requestLimits.get(ip);
  if (last && last.expires > now && last.count >= 5)
    return res.status(429).json({ ok: false, error: 'Too many requests today. Please try again later.' });
  try {
    recordStateRequest(state);
    if (!last || last.expires < now) requestLimits.set(ip, { count: 1, expires: now + 24 * 3600_000 });
    else last.count++;
    if (requestLimits.size > 5000) requestLimits.clear();
    res.json({ ok: true, state });
  } catch (error) { failure(res, error); }
});
app.get('/admin/state-requests', adminOnly, (_req, res) => res.json({ ok: true, requests: listStateRequests() }));

app.post('/unsubscribe', limitWrites, (req, res) => {
  const token = req.body?.expo_push_token;
  if (!validateToken(token)) return res.status(400).json({ ok: false, error: 'Valid token required' });
  deleteSubscription(token);
  res.json({ ok: true });
});

app.post('/run-poller', adminOnly, async (_, res) => {
  try { res.json({ ok: true, result: await runPollOnce() }); }
  catch (error) { failure(res, error); }
});
app.get('/events/recent', async (req, res) => {
  try {
    const state = getSupportedState(req.query.state);
    const { events, stale } = await getEventsForState(state, yearFrom(req));
    const { limit } = pagination(req);
    res.json({ ok: true, state, stale, feed_type: SUPPORTED_STATES[state].feed_type,
      events: [...events].sort((a, b) => String(b.date_stocked).localeCompare(String(a.date_stocked))).slice(0, limit) });
  } catch (error) { failure(res, error); }
});
app.get('/events', async (req, res) => {
  try {
    const state = getSupportedState(req.query.state);
    const { events, stale } = await getEventsForState(state, yearFrom(req));
    const county = String(req.query.county || '').trim().toUpperCase();
    const species = String(req.query.species || '').trim().toUpperCase();
    const water = String(req.query.water || '').trim().toUpperCase();
    const filtered = events.filter((e) =>
      (!county || String(e.county).toUpperCase() === county) &&
      (!species || String(e.species).toUpperCase() === species) &&
      (!water || String(e.water_name).toUpperCase().includes(water)));
    filtered.sort((a, b) => String(b.date_stocked).localeCompare(String(a.date_stocked)));
    const { limit, offset } = pagination(req);
    res.json({ ok: true, state, stale, feed_type: SUPPORTED_STATES[state].feed_type,
      total: filtered.length, limit, offset, events: filtered.slice(offset, offset + limit) });
  } catch (error) { failure(res, error); }
});
for (const [route, key] of [['counties', 'county'], ['species', 'species'], ['waters', 'water_name']]) {
  app.get(`/meta/${route}`, async (req, res) => {
    try {
      const state = getSupportedState(req.query.state);
      const { events, stale } = await getEventsForState(state, yearFrom(req));
      const county = String(req.query.county || '').trim().toUpperCase();
      const values = [...new Set(events.filter((e) => key !== 'water_name' || !county ||
        String(e.county).toUpperCase() === county).map((e) => String(e[key] || '').trim()).filter(Boolean))].sort();
      res.json({ ok: true, state, stale, [route]: values });
    } catch (error) { failure(res, error); }
  });
}
app.use((error, _, res, next) => {
  if (res.headersSent) return next(error);
  return res.status(error?.status || 400).json({ ok: false, error: error?.message || 'Invalid request' });
});
const port = Number.parseInt(process.env.PORT || '8787', 10);
app.listen(port, () => console.log(`[FishSense] API listening on ${port}`));
