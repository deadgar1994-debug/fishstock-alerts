import crypto from "crypto";

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sha1(s) {
  return crypto.createHash("sha1").update(s).digest("hex");
}

export function parseDwrFishStockingHtml(html) {
  const rowMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const events = [];

  for (const row of rowMatches) {
    const tds = row.match(/<td[\s\S]*?<\/td>/gi);
    if (!tds || tds.length < 6) continue;

    const cells = tds.map((td) => stripTags(td));

    const water_name = cells[0] || "";
    const county = cells[1] || "";
    const species = cells[2] || "";
    const quantity = parseInt((cells[3] || "").replace(/[^\d]/g, ""), 10);
    const avg_length = parseFloat((cells[4] || "").replace(/[^\d.]/g, ""));
    const date_stocked = normalizeDate(cells[5] || "");

    if (!water_name || !county || !species || !date_stocked) continue;

    const fingerprint =
      `${water_name}|${county}|${species}|` +
      `${Number.isFinite(quantity) ? quantity : ""}|` +
      `${Number.isFinite(avg_length) ? avg_length : ""}|` +
      `${date_stocked}`;

    const id = sha1(fingerprint);

    events.push({
      id,
      water_name,
      county,
      species,
      quantity: Number.isFinite(quantity) ? quantity : null,
      avg_length: Number.isFinite(avg_length) ? avg_length : null,
      date_stocked,
      first_seen_at: new Date().toISOString(),
    });
  }

  const seen = new Set();
  return events.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}

function normalizeDate(s) {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return "";
  const mm = String(m[1]).padStart(2, "0");
  const dd = String(m[2]).padStart(2, "0");
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}
