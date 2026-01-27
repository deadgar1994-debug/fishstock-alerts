import fetch from "node-fetch";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

function sha1(s) {
  return crypto.createHash("sha1").update(s).digest("hex");
}

function normalizeDate(s) {
  const m = String(s || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return "";
  const mm = String(m[1]).padStart(2, "0");
  const dd = String(m[2]).padStart(2, "0");
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * CPW page is not always a clean <tr><td> table.
 * So we parse the *text* in the “Trout Stocking Report” section and extract:
 *   water_name, region, report_date
 */
function extractText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    // keep some structure
    .replace(/<\/(tr|p|div|li|h\d|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t\r]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export async function fetchColoradoEvents() {
  const url = process.env.POLL_URL_CO;
  if (!url) throw new Error("Missing POLL_URL_CO in env");

  const ua = process.env.POLL_USER_AGENT || "FishStockAlerts/0.1";

  const res = await fetch(url, {
    headers: { "User-Agent": ua, Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`CO fetch failed: ${res.status}`);

  const html = await res.text();
  const text = extractText(html);

  // Grab the section after “Trout Stocking Report” and before the archive link area
  const startIdx = text.toLowerCase().indexOf("trout stocking report");
  if (startIdx < 0) return [];

  const tail = text.slice(startIdx);
  const endIdx = tail.toLowerCase().indexOf("view stocking report archive");
  const section = endIdx > 0 ? tail.slice(0, endIdx) : tail;

  // We expect repeating: WaterName ... RegionName ... M/D/YYYY ...
  // The page also contains repeated labels like “Body of Water”, “Region”, “Report Date”.
  const lines = section
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter(
      (l) =>
        !["body of water", "region", "report date", "link", "atlas", "atlas+"].includes(
          l.toLowerCase()
        )
    );

 const isDate = (x) => /\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(String(x || ""));
const bad = new Set([
  "trout stocking report",
  "body of water",
  "region",
  "report date",
  "link",
  "atlas",
  "atlas+",
  "view stocking report archive",
]);

const clean = (s) => String(s || "").trim();
const isBad = (s) => bad.has(clean(s).toLowerCase());

const events = [];
for (let i = 0; i < lines.length - 2; i++) {
  const a = clean(lines[i]);       // water
  const b = clean(lines[i + 1]);   // region
  const c = clean(lines[i + 2]);   // date

  if (!a || !b || !c) continue;
  if (isBad(a) || isBad(b) || isBad(c)) continue;

  // Require exact triple: WATER + REGION + DATE
  if (isDate(a) || isDate(b) || !isDate(c)) continue;

  const water_name = a;
  const region = b;
  const date_stocked = normalizeDate(c);
  if (!date_stocked) continue;

  const county = region.toUpperCase();
  const species = "TROUT";
  const id = sha1(`CO|${water_name}|${county}|${species}|${date_stocked}`);

  events.push({
    id,
    water_name,
    county,
    species,
    quantity: null,
    avg_length: null,
    date_stocked,
    first_seen_at: new Date().toISOString(),
  });

  i += 2; // consume the triple
}

// dedup
const seen = new Set();
return events.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}