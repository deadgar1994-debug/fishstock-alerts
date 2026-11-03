
const BATCH_SIZE = 100;
export function matchesSubscription(event, sub) {
  const normalize = (x) => String(x || '').toUpperCase().trim();
  const matches = (values, field) => !values?.length || values.some((v) => normalize(v) === normalize(field));
  return matches(sub.states || ['UT'], event.state || 'UT')
    && matches(sub.counties, event.county)
    && matches(sub.species, event.species)
    && matches(sub.waters, event.water_name);
}

export function formatNotification(event) {
  const forecast = event.state === 'ID';
  const quantity = Number(event.quantity) > 0 ? `${Number(event.quantity).toLocaleString()} fish` : 'Fish';
  const length = Number(event.avg_length) > 0 ? ` • ${event.avg_length}\" avg` : '';
  return {
    title: forecast ? `Forecast: ${event.species}` : `New stocking: ${event.species}`,
    body: `${event.water_name} (${event.state}) • ${quantity}${length} • ${event.date_stocked}${forecast ? ' (planned week)' : ''}`,
    data: { kind: 'stocking', state: event.state, eventId: event.id, forecast },
  };
}

export async function sendExpoPushMessages(messages) {
  let accepted = 0;
  const errors = [];
  const acceptedIndices = [];
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
      signal: AbortSignal.timeout(20000),
    });
    const response = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Expo push service returned ${res.status}`);
    const tickets = Array.isArray(response.data) ? response.data : [];
    tickets.forEach((ticket, index) => {
      if (ticket.status === 'ok') { accepted++; acceptedIndices.push(i + index); }
      else errors.push(ticket.message || 'Push rejected');
    });
    if (!tickets.length) errors.push('Expo returned no push tickets');
  }
  // Acceptance is not confirmation of delivery. Receipt checking can be added later.
  return { accepted, attempted: messages.length, acceptedIndices, errors: errors.slice(0, 10) };
}
