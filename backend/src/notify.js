import fetch from "node-fetch";

export async function sendExpoPushMessages(messages) {
  if (!messages.length) return { ok: true, sent: 0 };

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Expo push failed: ${res.status} ${JSON.stringify(json)}`);
  }
  return { ok: true, sent: messages.length, response: json };
}

export function formatNotification(event) {
  const qty = event.quantity ? `${Number(event.quantity).toLocaleString()} fish` : "Fish stocked";
  const len = event.avg_length ? ` • ${event.avg_length}" avg` : "";
  return {
    title: `Stocked: ${event.species}`,
    body: `${event.water_name} (${event.county}) — ${qty}${len} — ${event.date_stocked}`,
    data: { eventId: event.id },
  };
}

export function matchesSubscription(event, sub) {
  const evCounty = String(event.county || "").toUpperCase().trim();
  const evSpecies = String(event.species || "").toUpperCase().trim();
  const evWater = String(event.water_name || "").toUpperCase().trim();

  const subCounties = (sub.counties || []).map((x) => String(x).toUpperCase().trim());
  const subSpecies = (sub.species || []).map((x) => String(x).toUpperCase().trim());
  const subWaters = (sub.waters || []).map((x) => String(x).toUpperCase().trim());

  const countyOk = !subCounties.length || subCounties.includes(evCounty);
  const speciesOk = !subSpecies.length || subSpecies.includes(evSpecies);
  const waterOk = !subWaters.length || subWaters.includes(evWater);
  return countyOk && speciesOk && waterOk;
}
