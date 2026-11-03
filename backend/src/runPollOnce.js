import { insertNewEvents, markStatePolled } from './db.js';
import { getEventsForState } from './eventService.js';
import { SUPPORTED_STATES } from './states.js';

// Stocking reports only. No user subscriptions, push queue, or notifications.
export async function runPollOnce() {
  const results = [];
  for (const state of Object.keys(SUPPORTED_STATES)) {
    try {
      const { events, stale } = await getEventsForState(state);
      if (stale) { results.push({ state, stale: true, skipped: true }); continue; }
      const { insertedCount } = insertNewEvents(events, state);
      markStatePolled(state);
      results.push({ state, parsed: events.length, inserted: insertedCount });
    } catch (error) { results.push({ state, error: error?.message || String(error) }); }
  }
  return { results, notifications: 'disabled' };
}
