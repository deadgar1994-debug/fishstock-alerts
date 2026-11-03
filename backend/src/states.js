// Feed coverage must be explicit. Never show one state's data for another.
export const SUPPORTED_STATES = Object.freeze({
  UT: { code: 'UT', name: 'Utah', feed_type: 'reported', date_label: 'Stocked' },
  CO: { code: 'CO', name: 'Colorado', feed_type: 'reported', date_label: 'Reported' },
  ID: { code: 'ID', name: 'Idaho', feed_type: 'reported', date_label: 'Stocked' },
});

export function getSupportedState(raw) {
  const state = String(raw || 'UT').trim().toUpperCase();
  if (!Object.hasOwn(SUPPORTED_STATES, state)) {
    const err = new Error(`Stocking coverage for ${state || 'this state'} is not available yet.`);
    err.status = 400;
    throw err;
  }
  return state;
}
