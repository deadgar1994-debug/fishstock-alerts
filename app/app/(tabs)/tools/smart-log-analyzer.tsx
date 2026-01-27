// app/(tabs)/tools/smart-log-analyzer.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    Dimensions,
    FlatList,
    Image,
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type FishLogEntry = {
  id: string;
  createdAt: string; // ISO date
  water: string;
  species: string;
  lengthIn?: string;
  notes?: string;
  weather?: string;
  photoUri?: string;
  videoUri?: string;
};

const STORAGE_KEY = "fish_log_v1";

const BG = "#0b1220";

const cardStyle = {
  padding: 12,
  borderRadius: 14,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
} as const;

const modalCard = {
  borderRadius: 16,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.10)",
} as const;

/* ---------------- tiny helpers ---------------- */

function norm(s?: string) {
  return (s ?? "").trim();
}
function low(s?: string) {
  return norm(s).toLowerCase();
}
function safeDate(s?: string) {
  const t = Date.parse(s ?? "");
  return Number.isNaN(t) ? null : new Date(t);
}
function parseLengthIn(v?: string): number | null {
  const s = norm(v);
  if (!s) return null;
  const m = s.match(/(\d+(\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function bucketTimeOfDay(d: Date) {
  const h = d.getHours();
  if (h >= 5 && h < 11) return "Morning";
  if (h >= 11 && h < 16) return "Afternoon";
  if (h >= 16 && h < 21) return "Evening";
  return "Night";
}

function monthLabel(d: Date) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  return `${y}-${m}`;
}

// Simple/consistent season bucket (Northern Hemisphere)
function seasonOf(d: Date) {
  const m = d.getMonth() + 1;
  if (m === 12 || m === 1 || m === 2) return "Winter";
  if (m >= 3 && m <= 5) return "Spring";
  if (m >= 6 && m <= 8) return "Summer";
  return "Fall";
}

type Row = { key: string; count: number };

function countBy(items: FishLogEntry[], pick: (x: FishLogEntry) => string) {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = norm(pick(it));
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

function uniqSorted(items: FishLogEntry[], pick: (x: FishLogEntry) => string) {
  const set = new Set<string>();
  for (const it of items) {
    const k = norm(pick(it));
    if (k) set.add(k);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/* ---------------- filters ---------------- */

type Filters = {
  water?: string;
  species?: string;
  weather?: string;
};

function applyFilters(items: FishLogEntry[], f: Filters) {
  const w = low(f.water);
  const sp = low(f.species);
  const we = low(f.weather);

  return items.filter((it) => {
    if (w && low(it.water) !== w) return false;
    if (sp && low(it.species) !== sp) return false;
    if (we && low(it.weather) !== we) return false;
    return true;
  });
}

/* ---------------- analyzer (Catch Insights) ---------------- */

type Analyzer = {
  totalAll: number;
  totalFiltered: number;

  topWaters: Row[];
  topSpecies: Row[];
  topWeather: Row[];

  bestTimeOfDay?: Row;
  bestDayOfWeek?: Row;

  lengthCount: number;
  avgLen?: number;
  maxLen?: number;
  bestSpeciesByAvgLen?: { species: string; avg: number; n: number };
  bestWeatherByAvgLen?: { weather: string; avg: number; n: number };

  topCombos3: { label: string; count: number }[];
  topCombos2: { label: string; count: number }[];

  last7: number;
  prev7: number;
  last30: number;
  prev30: number;
  longestStreakDays: number;

  topMonth?: { label: string; count: number };
  seasons: { winter: number; spring: number; summer: number; fall: number };
  topSeason?: { label: "Winter" | "Spring" | "Summer" | "Fall"; count: number };

  weatherTaggedCount: number;
};

function analyze(allItems: FishLogEntry[], filters: Filters): Analyzer {
  const totalAll = allItems.length;
  const items = applyFilters(allItems, filters);
  const totalFiltered = items.length;

  const topWaters = countBy(items, (x) => x.water).slice(0, 6);
  const topSpecies = countBy(items, (x) => x.species).slice(0, 6);
  const topWeather = countBy(items, (x) => x.weather ?? "").slice(0, 10);

  const todMap = new Map<string, number>();
  const dowMap = new Map<string, number>();

  const monthMap = new Map<string, number>();
  const seasonCounts = { winter: 0, spring: 0, summer: 0, fall: 0 };

  for (const it of items) {
    const d = safeDate(it.createdAt);
    if (!d) continue;

    const tod = bucketTimeOfDay(d);
    todMap.set(tod, (todMap.get(tod) ?? 0) + 1);

    const dow = DOW[d.getDay()];
    dowMap.set(dow, (dowMap.get(dow) ?? 0) + 1);

    const ml = monthLabel(d);
    monthMap.set(ml, (monthMap.get(ml) ?? 0) + 1);

    const s = seasonOf(d);
    if (s === "Winter") seasonCounts.winter++;
    else if (s === "Spring") seasonCounts.spring++;
    else if (s === "Summer") seasonCounts.summer++;
    else seasonCounts.fall++;
  }

  const bestTimeOfDay = Array.from(todMap.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)[0];

  const bestDayOfWeek = Array.from(dowMap.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)[0];

  // size stats
  let lengthCount = 0;
  let sumLen = 0;
  let maxLen = -Infinity;

  const bySpeciesLen = new Map<string, { sum: number; n: number }>();
  const byWeatherLen = new Map<string, { sum: number; n: number }>();

  let weatherTaggedCount = 0;

  for (const it of items) {
    if (norm(it.weather)) weatherTaggedCount++;

    const n = parseLengthIn(it.lengthIn);
    if (n == null) continue;

    lengthCount++;
    sumLen += n;
    if (n > maxLen) maxLen = n;

    const sp = norm(it.species);
    if (sp) {
      const cur = bySpeciesLen.get(sp) ?? { sum: 0, n: 0 };
      cur.sum += n;
      cur.n += 1;
      bySpeciesLen.set(sp, cur);
    }

    const we = norm(it.weather);
    if (we) {
      const cur = byWeatherLen.get(we) ?? { sum: 0, n: 0 };
      cur.sum += n;
      cur.n += 1;
      byWeatherLen.set(we, cur);
    }
  }

  const avgLen = lengthCount ? sumLen / lengthCount : undefined;
  const maxLenOut = lengthCount ? maxLen : undefined;

  const bestSpeciesByAvgLen = Array.from(bySpeciesLen.entries())
    .map(([species, v]) => ({ species, avg: v.sum / v.n, n: v.n }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.avg - a.avg)[0];

  const bestWeatherByAvgLen = Array.from(byWeatherLen.entries())
    .map(([weather, v]) => ({ weather, avg: v.sum / v.n, n: v.n }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.avg - a.avg)[0];

  // clusters
  const combo3 = new Map<string, number>(); // Species • Weather • Water
  const combo2 = new Map<string, number>(); // Species • Water

  for (const it of items) {
    const sp = norm(it.species);
    const wa = norm(it.water);
    if (!sp || !wa) continue;

    const label2 = `${sp} • ${wa}`;
    combo2.set(label2, (combo2.get(label2) ?? 0) + 1);

    const we = norm(it.weather);
    if (we) {
      const label3 = `${sp} • ${we} • ${wa}`;
      combo3.set(label3, (combo3.get(label3) ?? 0) + 1);
    }
  }

  const topCombos3 = Array.from(combo3.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  const topCombos2 = Array.from(combo2.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  // trends
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const startLast7 = now - 7 * dayMs;
  const startPrev7 = now - 14 * dayMs;
  const startLast30 = now - 30 * dayMs;
  const startPrev30 = now - 60 * dayMs;

  let last7 = 0,
    prev7 = 0,
    last30 = 0,
    prev30 = 0;

  const dateSet = new Set<string>();

  for (const it of items) {
    const t = Date.parse(it.createdAt);
    if (Number.isNaN(t)) continue;

    if (t >= startLast7) last7++;
    else if (t >= startPrev7) prev7++;

    if (t >= startLast30) last30++;
    else if (t >= startPrev30) prev30++;

    const d = new Date(t);
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const key = `${y}-${m}-${`${d.getDate()}`.padStart(2, "0")}`;
    dateSet.add(key);
  }

  let longestStreakDays = 0;
  if (dateSet.size) {
    const dates = Array.from(dateSet)
      .map((s) => Date.parse(s))
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => a - b);

    let cur = 1;
    longestStreakDays = 1;
    for (let i = 1; i < dates.length; i++) {
      const diff = (dates[i] - dates[i - 1]) / dayMs;
      if (Math.abs(diff - 1) < 0.01) cur++;
      else cur = 1;
      if (cur > longestStreakDays) longestStreakDays = cur;
    }
  }

  const topMonthEntry = Array.from(monthMap.entries()).sort((a, b) => b[1] - a[1])[0];
  const topMonth = topMonthEntry ? { label: topMonthEntry[0], count: topMonthEntry[1] } : undefined;

  const topSeasonEntry = [
    { label: "Winter" as const, count: seasonCounts.winter },
    { label: "Spring" as const, count: seasonCounts.spring },
    { label: "Summer" as const, count: seasonCounts.summer },
    { label: "Fall" as const, count: seasonCounts.fall },
  ].sort((a, b) => b.count - a.count)[0];

  const topSeason = topSeasonEntry?.count ? topSeasonEntry : undefined;

  return {
    totalAll,
    totalFiltered,
    topWaters,
    topSpecies,
    topWeather,
    bestTimeOfDay,
    bestDayOfWeek,
    lengthCount,
    avgLen,
    maxLen: maxLenOut,
    bestSpeciesByAvgLen,
    bestWeatherByAvgLen,
    topCombos3,
    topCombos2,
    last7,
    prev7,
    last30,
    prev30,
    longestStreakDays,
    topMonth,
    seasons: seasonCounts,
    topSeason,
    weatherTaggedCount,
  };
}

/* ---------------- Yearly Recap builder ---------------- */

type YearRecap = {
  year: number;
  total: number;
  topSpecies?: { key: string; count: number };
  topWater?: { key: string; count: number };
  topMonth?: { key: string; count: number };
  topSeason?: { key: "Winter" | "Spring" | "Summer" | "Fall"; count: number };
  seasons: { Winter: number; Spring: number; Summer: number; Fall: number };
  biggest?: { species?: string; water?: string; len: number; when?: string; photoUri?: string };

  photos: string[];
};

function topEntry(map: Map<string, number>) {
  const arr = Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
  return arr[0];
}

function buildYearRecaps(all: FishLogEntry[]): YearRecap[] {
  const byYear = new Map<number, FishLogEntry[]>();

  for (const it of all) {
    const d = safeDate(it.createdAt);
    if (!d) continue;
    const y = d.getFullYear();
    const arr = byYear.get(y) ?? [];
    arr.push(it);
    byYear.set(y, arr);
  }

  const years = Array.from(byYear.keys()).sort((a, b) => b - a);

  return years.map((year) => {
    const items = byYear.get(year) ?? [];

    const speciesMap = new Map<string, number>();
    const waterMap = new Map<string, number>();
    const monthMap = new Map<string, number>();

    const seasonCounts = { Winter: 0, Spring: 0, Summer: 0, Fall: 0 };

    let biggestLen = -Infinity;
    let biggestMeta: YearRecap["biggest"] | undefined;

    const photos: string[] = [];

    for (const it of items) {
      const sp = norm(it.species);
      const wa = norm(it.water);
      if (sp) speciesMap.set(sp, (speciesMap.get(sp) ?? 0) + 1);
      if (wa) waterMap.set(wa, (waterMap.get(wa) ?? 0) + 1);

      const d = safeDate(it.createdAt);
      if (d) {
        const ml = monthLabel(d);
        monthMap.set(ml, (monthMap.get(ml) ?? 0) + 1);

        const s = seasonOf(d) as "Winter" | "Spring" | "Summer" | "Fall";
        seasonCounts[s] += 1;
      }

      const len = parseLengthIn(it.lengthIn);
      if (len != null && len > biggestLen) {
        biggestLen = len;
        biggestMeta = {
  len,
  species: sp || undefined,
  water: wa || undefined,
  when: it.createdAt,
  photoUri: it.photoUri || undefined,
};

      }

      if (it.photoUri) photos.push(it.photoUri);
    }

    const topMonth = topEntry(monthMap);
    const topSeason = (Object.entries(seasonCounts) as Array<
      [keyof typeof seasonCounts, number]
    >)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)[0];

    return {
      year,
      total: items.length,
      topSpecies: topEntry(speciesMap),
      topWater: topEntry(waterMap),
      topMonth: topMonth ? { key: topMonth.key, count: topMonth.count } : undefined,
      topSeason: topSeason?.count ? { key: topSeason.key as any, count: topSeason.count } : undefined,
      seasons: seasonCounts,
      biggest: biggestLen > 0 ? biggestMeta : undefined,
      photos: photos.slice(0, 8),
    };
  });
}

/* ---------------- UI components ---------------- */

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: active ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: active ? "rgba(59,130,246,0.45)" : "rgba(255,255,255,0.10)",
      }}
    >
      <Text style={{ color: "white", fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}

function SegButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: active ? "rgba(34,197,94,0.20)" : "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: active ? "rgba(34,197,94,0.40)" : "rgba(255,255,255,0.10)",
      }}
    >
      <Text style={{ color: "white", fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
      }}
    >
      <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "800", fontSize: 12 }}>
        {label}
      </Text>
      <Text style={{ color: "white", fontWeight: "900", marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
      <Text style={{ color: "rgba(255,255,255,0.70)", fontWeight: "800" }}>{label}</Text>
      <Text style={{ color: "white", fontWeight: "900" }}>{value}</Text>
    </View>
  );
}

/* ---------------- Screen ---------------- */

export default function CatchInsightsTool() {
  const [allItems, setAllItems] = useState<FishLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState<Filters>({});
  const [minPatternCount, setMinPatternCount] = useState(2);
  const [showFilters, setShowFilters] = useState(true);

  // Yearly recap modal
  const [recapOpen, setRecapOpen] = useState(false);
  const recapListRef = useRef<FlatList<any>>(null);

  const { width } = Dimensions.get("window");
 const slideW = width; // paging must match screen width


  async function load() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setAllItems([]);
        return;
      }
      const parsed = JSON.parse(raw) as FishLogEntry[];
      setAllItems(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      console.warn("catch insights load error", e);
      setAllItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const waterOptions = useMemo(() => uniqSorted(allItems, (x) => x.water), [allItems]);
  const speciesOptions = useMemo(() => uniqSorted(allItems, (x) => x.species), [allItems]);
  const weatherOptions = useMemo(() => uniqSorted(allItems, (x) => x.weather ?? ""), [allItems]);

  const insights = useMemo(() => analyze(allItems, filters), [allItems, filters]);
  const hasFilters = Boolean(filters.water || filters.species || filters.weather);

  const combos3 = useMemo(() => {
    return insights.topCombos3.filter((x) => x.count >= minPatternCount).slice(0, 8);
  }, [insights.topCombos3, minPatternCount]);

  const combos2 = useMemo(() => {
    return insights.topCombos2.filter((x) => x.count >= minPatternCount).slice(0, 8);
  }, [insights.topCombos2, minPatternCount]);

  const recurring3 = combos3[0];
  const recurring2 = combos2[0];

  // Recap data
  const recaps = useMemo(() => buildYearRecaps(allItems), [allItems]);
  const years = useMemo(() => recaps.map((r) => r.year), [recaps]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedYear && years.length) setSelectedYear(years[0]);
  }, [years, selectedYear]);

  const recap = useMemo(() => {
    if (!recaps.length) return null;
    const y = selectedYear ?? recaps[0].year;
    return recaps.find((r) => r.year === y) ?? recaps[0];
  }, [recaps, selectedYear]);

  function openRecap() {
    setRecapOpen(true);
    requestAnimationFrame(() =>
      recapListRef.current?.scrollToOffset({ offset: 0, animated: false })
    );
  }

  const slides = useMemo(() => {
    if (!recap) return [];

    const fmtDate = (iso?: string) => {
      const d = safeDate(iso);
      return d ? d.toLocaleDateString() : "";
    };

    return [
      {
        key: "cover",
        title: `${recap.year} Recap`,
        subtitle: "A clean snapshot of your logged catches.",
        render: () => (
          <View style={{ ...modalCard, padding: 16 }}>
            <Text style={{ color: "white", fontSize: 26, fontWeight: "900" }}>
              {recap.year} Recap
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 8 }}>
              Swipe → for highlights.
            </Text>

            <View style={{ marginTop: 16, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              <View style={{ ...modalCard, padding: 12 }}>
                <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "800" }}>
                  Catches
                </Text>
                <Text style={{ color: "white", fontWeight: "900", fontSize: 22, marginTop: 4 }}>
                  {recap.total}
                </Text>
              </View>

              <View style={{ ...modalCard, padding: 12 }}>
                <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "800" }}>
                  Top season
                </Text>
                <Text style={{ color: "white", fontWeight: "900", fontSize: 22, marginTop: 4 }}>
                  {recap.topSeason ? recap.topSeason.key : "—"}
                </Text>
              </View>
            </View>

            <Text style={{ color: "rgba(255,255,255,0.45)", marginTop: 14, fontSize: 12 }}>
              Based on your logs only.
            </Text>
          </View>
        ),
      },
      {
        key: "where-what",
        title: "Where & What",
        subtitle: "Most frequent water + species.",
        render: () => (
          <View style={{ ...modalCard, padding: 16 }}>
            <Text style={{ color: "white", fontSize: 18, fontWeight: "900" }}>Where & What</Text>
            <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
              These show up the most in your catches.
            </Text>

            <StatRow
              label="Top water"
              value={recap.topWater ? `${recap.topWater.key} (${recap.topWater.count})` : "—"}
            />
            <StatRow
              label="Top species"
              value={
                recap.topSpecies ? `${recap.topSpecies.key} (${recap.topSpecies.count})` : "—"
              }
            />
          </View>
        ),
      },
      {
        key: "season-month",
        title: "Season & Month",
        subtitle: "When your catches show up across the year.",
        render: () => (
          <View style={{ ...modalCard, padding: 16 }}>
            <Text style={{ color: "white", fontSize: 18, fontWeight: "900" }}>
              Season & Month
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
              Pure counts — no guessing.
            </Text>

            <View style={{ marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              {(["Winter", "Spring", "Summer", "Fall"] as const).map((s) => (
                <View key={s} style={{ ...modalCard, padding: 12, minWidth: 120 }}>
                  <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "800" }}>{s}</Text>
                  <Text style={{ color: "white", fontWeight: "900", fontSize: 18, marginTop: 4 }}>
                    {recap.seasons[s]}
                  </Text>
                </View>
              ))}
            </View>

            <StatRow
              label="Top month"
              value={recap.topMonth ? `${recap.topMonth.key} (${recap.topMonth.count})` : "—"}
            />
            <StatRow
              label="Top season"
              value={recap.topSeason ? `${recap.topSeason.key} (${recap.topSeason.count})` : "—"}
            />
          </View>
        ),
      },
      {
        key: "biggest",
        title: "Biggest Fish",
        subtitle: "Largest recorded length this year.",
        render: () => (
          <View style={{ ...modalCard, padding: 16 }}>
            <Text style={{ color: "white", fontSize: 18, fontWeight: "900" }}>
              Biggest Fish
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
              Only uses catches where length was recorded.
            </Text>

            {recap.biggest ? (
  <View style={{ ...modalCard, padding: 14, marginTop: 14 }}>
    {recap.biggest.photoUri ? (
      <Image
  source={{ uri: recap.biggest.photoUri }}
  resizeMode="cover"
  style={{
    width: "100%",
    height: Math.min(320, Math.round(slideW * 0.7)),
    borderRadius: 16,
    marginBottom: 12,
  }}
/>

    ) : null}

    <Text style={{ color: "white", fontWeight: "900", fontSize: 26 }}>
      {recap.biggest.len.toFixed(1)}"
    </Text>

    <Text style={{ color: "rgba(255,255,255,0.75)", marginTop: 6 }}>
      {recap.biggest.species ? `Species: ${recap.biggest.species}` : "Species: —"}
    </Text>

    <Text style={{ color: "rgba(255,255,255,0.75)", marginTop: 4 }}>
      {recap.biggest.water ? `Water: ${recap.biggest.water}` : "Water: —"}
    </Text>

    <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 8, fontSize: 12 }}>
      {recap.biggest.when ? `Date: ${fmtDate(recap.biggest.when)}` : ""}
    </Text>

    {!recap.biggest.photoUri ? (
      <Text style={{ color: "rgba(255,255,255,0.45)", marginTop: 10, fontSize: 12 }}>
        No photo attached to this catch.
      </Text>
    ) : null}
  </View>
) : (
  <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 14 }}>
    No length entries found for this year.
  </Text>
)}

          </View>
        ),
      },
      {
        key: "photos",
        title: "Photo Highlights",
        subtitle: "Up to 8 attached photos from this year.",
        render: () => (
          <View style={{ ...modalCard, padding: 16 }}>
            <Text style={{ color: "white", fontSize: 18, fontWeight: "900" }}>
              Photo Highlights
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
              Quick scrollable highlights.
            </Text>

            {recap.photos.length ? (
              <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {recap.photos.map((uri) => (
                  <Image
                    key={uri}
                    source={{ uri }}
                    style={{
                      width: (slideW - 16 * 2 - 10) / 2,
                      height: 120,
                      borderRadius: 12,
                    }}
                  />
                ))}
              </View>
            ) : (
              <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 14 }}>
                No photos attached for this year.
              </Text>
            )}
          </View>
        ),
      },
    ];
  }, [recap, slideW]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 44 }}>
        {/* Header */}
        <View style={{ gap: 6 }}>
          <Text style={{ color: "white", fontSize: 22, fontWeight: "900" }}>
            Catch Insights
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.65)" }}>
            Built from your catches — what repeats when you land fish.
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            <Pressable
              onPress={load}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 12,
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
              }}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>↻ Refresh</Text>
            </Pressable>

            <Pressable
              onPress={() => setShowFilters((v) => !v)}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 12,
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
              }}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>
                {showFilters ? "Hide Filters" : "Show Filters"}
              </Text>
            </Pressable>

            {/* Yearly Recap button (in Catch Insights) */}
            <Pressable
              onPress={openRecap}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 12,
                backgroundColor: "rgba(59,130,246,0.18)",
                borderWidth: 1,
                borderColor: "rgba(59,130,246,0.30)",
              }}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>Yearly Recap</Text>
            </Pressable>

            {hasFilters ? (
              <Pressable
                onPress={() => setFilters({})}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  backgroundColor: "rgba(239,68,68,0.14)",
                  borderWidth: 1,
                  borderColor: "rgba(239,68,68,0.30)",
                }}
              >
                <Text style={{ color: "white", fontWeight: "900" }}>Clear Filters</Text>
              </Pressable>
            ) : null}
          </View>

          {hasFilters ? (
            <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 6, fontSize: 12 }}>
              Active:{" "}
              <Text style={{ color: "white", fontWeight: "900" }}>
                {filters.water ? `Water=${filters.water} ` : ""}
                {filters.species ? `Species=${filters.species} ` : ""}
                {filters.weather ? `Weather=${filters.weather}` : ""}
              </Text>
            </Text>
          ) : null}
        </View>

        {/* Filters */}
        {showFilters ? (
          <View style={{ ...cardStyle, marginTop: 12 }}>
            <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>Filters</Text>

            <View style={{ marginTop: 12, gap: 8 }}>
              <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "900" }}>Water</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {waterOptions.length ? (
                  waterOptions.slice(0, 18).map((w) => (
                    <Chip
                      key={w}
                      label={w}
                      active={low(filters.water) === low(w)}
                      onPress={() =>
                        setFilters((f) => ({
                          ...f,
                          water: low(f.water) === low(w) ? undefined : w,
                        }))
                      }
                    />
                  ))
                ) : (
                  <Text style={{ color: "rgba(255,255,255,0.45)" }}>No waters yet</Text>
                )}
              </View>
            </View>

            <View style={{ marginTop: 14, gap: 8 }}>
              <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "900" }}>Species</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {speciesOptions.length ? (
                  speciesOptions.slice(0, 18).map((s) => (
                    <Chip
                      key={s}
                      label={s}
                      active={low(filters.species) === low(s)}
                      onPress={() =>
                        setFilters((f) => ({
                          ...f,
                          species: low(f.species) === low(s) ? undefined : s,
                        }))
                      }
                    />
                  ))
                ) : (
                  <Text style={{ color: "rgba(255,255,255,0.45)" }}>No species yet</Text>
                )}
              </View>
            </View>

            <View style={{ marginTop: 14, gap: 8 }}>
              <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "900" }}>Weather</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {weatherOptions.length ? (
                  weatherOptions.slice(0, 18).map((w) => (
                    <Chip
                      key={w}
                      label={w}
                      active={low(filters.weather) === low(w)}
                      onPress={() =>
                        setFilters((f) => ({
                          ...f,
                          weather: low(f.weather) === low(w) ? undefined : w,
                        }))
                      }
                    />
                  ))
                ) : (
                  <Text style={{ color: "rgba(255,255,255,0.45)" }}>
                    No weather yet — add weather to make this useful.
                  </Text>
                )}
              </View>
            </View>
          </View>
        ) : null}

        {/* Insights */}
        <View style={{ marginTop: 12, gap: 12 }}>
          {loading ? (
            <Text style={{ color: "rgba(255,255,255,0.6)" }}>Loading…</Text>
          ) : insights.totalAll === 0 ? (
            <View style={cardStyle}>
              <Text style={{ color: "white", fontWeight: "900" }}>No logs yet</Text>
              <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 6 }}>
                Add catches first, then Catch Insights becomes your dashboard.
              </Text>
            </View>
          ) : insights.totalFiltered === 0 ? (
            <View style={cardStyle}>
              <Text style={{ color: "white", fontWeight: "900" }}>No matches</Text>
              <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 6 }}>
                Your current filters return 0 catches. Clear one filter to continue.
              </Text>
            </View>
          ) : (
            <>
              {/* Season + Month */}
              <View style={cardStyle}>
                <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>
                  Season & Month
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                  When your catches show up across the year.
                </Text>

                <View style={{ marginTop: 10, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                  <StatPill label="Winter" value={`${insights.seasons.winter}`} />
                  <StatPill label="Spring" value={`${insights.seasons.spring}`} />
                  <StatPill label="Summer" value={`${insights.seasons.summer}`} />
                  <StatPill label="Fall" value={`${insights.seasons.fall}`} />
                </View>

                <View style={{ marginTop: 10, gap: 6 }}>
                  <Text style={{ color: "rgba(255,255,255,0.75)" }}>
                    Top season:{" "}
                    <Text style={{ color: "white", fontWeight: "900" }}>
                      {insights.topSeason ? insights.topSeason.label : "—"}
                    </Text>
                    {insights.topSeason ? (
                      <Text style={{ color: "rgba(255,255,255,0.55)" }}>
                        {" "}
                        ({insights.topSeason.count})
                      </Text>
                    ) : null}
                  </Text>

                  <Text style={{ color: "rgba(255,255,255,0.75)" }}>
                    Top month:{" "}
                    <Text style={{ color: "white", fontWeight: "900" }}>
                      {insights.topMonth ? insights.topMonth.label : "—"}
                    </Text>
                    {insights.topMonth ? (
                      <Text style={{ color: "rgba(255,255,255,0.55)" }}>
                        {" "}
                        ({insights.topMonth.count})
                      </Text>
                    ) : null}
                  </Text>

                  <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 2, fontSize: 12 }}>
                    Based on {insights.totalFiltered} catches
                  </Text>
                </View>
              </View>

              {/* Recurring Conditions */}
              <View style={cardStyle}>
                <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>
                  Recurring Conditions
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                  What repeats in your logged catches.
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "900" }}>
                    Min count:
                  </Text>
                  <SegButton label="2+" active={minPatternCount === 2} onPress={() => setMinPatternCount(2)} />
                  <SegButton label="3+" active={minPatternCount === 3} onPress={() => setMinPatternCount(3)} />
                  <SegButton label="5+" active={minPatternCount === 5} onPress={() => setMinPatternCount(5)} />
                </View>

                <View style={{ marginTop: 10, gap: 10 }}>
                  {recurring3 ? (
                    <View style={{ gap: 4 }}>
                      <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "900" }}>
                        Most common (Species • Weather • Water)
                      </Text>
                      <Text style={{ color: "white", fontWeight: "900", fontSize: 15 }}>
                        {recurring3.label}{" "}
                        <Text style={{ color: "rgba(255,255,255,0.55)" }}>
                          ({recurring3.count})
                        </Text>
                      </Text>
                    </View>
                  ) : (
                    <Text style={{ color: "rgba(255,255,255,0.55)" }}>
                      Not enough weather-tagged catches to show a 3-part combo.
                    </Text>
                  )}

                  {recurring2 ? (
                    <View style={{ gap: 4 }}>
                      <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "900" }}>
                        Most common (Species • Water)
                      </Text>
                      <Text style={{ color: "white", fontWeight: "900", fontSize: 15 }}>
                        {recurring2.label}{" "}
                        <Text style={{ color: "rgba(255,255,255,0.55)" }}>
                          ({recurring2.count})
                        </Text>
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Momentum */}
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                <StatPill label="Catches" value={`${insights.totalFiltered} / ${insights.totalAll}`} />
                <StatPill label="Last 7 days" value={`${insights.last7} (prev ${insights.prev7})`} />
                <StatPill label="Last 30 days" value={`${insights.last30} (prev ${insights.prev30})`} />
                <StatPill
                  label="Longest streak"
                  value={`${insights.longestStreakDays} day${insights.longestStreakDays === 1 ? "" : "s"}`}
                />
              </View>

              {/* Size context */}
              <View style={cardStyle}>
                <Text style={{ color: "white", fontWeight: "900" }}>Size context</Text>
                <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                  Only uses catches where you recorded length.
                </Text>

                <View style={{ marginTop: 10, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                  <StatPill label="Length logs" value={`${insights.lengthCount}`} />
                  <StatPill
                    label="Avg length"
                    value={insights.avgLen != null ? `${insights.avgLen.toFixed(1)}"` : "—"}
                  />
                  <StatPill
                    label="Max length"
                    value={insights.maxLen != null ? `${insights.maxLen.toFixed(1)}"` : "—"}
                  />
                </View>

                <View style={{ marginTop: 10, gap: 8 }}>
                  {insights.bestSpeciesByAvgLen ? (
                    <Text style={{ color: "rgba(255,255,255,0.78)" }}>
                      Largest average species:{" "}
                      <Text style={{ color: "white", fontWeight: "900" }}>
                        {insights.bestSpeciesByAvgLen.species}
                      </Text>{" "}
                      <Text style={{ color: "rgba(255,255,255,0.55)" }}>
                        {insights.bestSpeciesByAvgLen.avg.toFixed(1)}" (n={insights.bestSpeciesByAvgLen.n})
                      </Text>
                    </Text>
                  ) : null}

                  {insights.bestWeatherByAvgLen ? (
                    <Text style={{ color: "rgba(255,255,255,0.78)" }}>
                      Largest average weather:{" "}
                      <Text style={{ color: "white", fontWeight: "900" }}>
                        {insights.bestWeatherByAvgLen.weather}
                      </Text>{" "}
                      <Text style={{ color: "rgba(255,255,255,0.55)" }}>
                        {insights.bestWeatherByAvgLen.avg.toFixed(1)}" (n={insights.bestWeatherByAvgLen.n})
                      </Text>
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Weather summary */}
              <View style={cardStyle}>
                <Text style={{ color: "white", fontWeight: "900" }}>
                  Most common weather in catches
                </Text>

                {insights.topWeather.length ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                    {insights.topWeather.map((x) => (
                      <View
                        key={x.key}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          backgroundColor: "rgba(59,130,246,0.18)",
                          borderWidth: 1,
                          borderColor: "rgba(59,130,246,0.30)",
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "800" }}>
                          {x.key}{" "}
                          <Text style={{ color: "rgba(255,255,255,0.75)" }}>
                            ({x.count})
                          </Text>
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 10 }}>
                    No weather data yet — add weather to make this useful.
                  </Text>
                )}

                <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 10, fontSize: 12 }}>
                  Weather present in {insights.weatherTaggedCount} / {insights.totalFiltered} catches
                </Text>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* ---------------- Yearly Recap Modal ---------------- */}
      <Modal
        visible={recapOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setRecapOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)" }}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={{ padding: 16, paddingBottom: 10 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white", fontSize: 22, fontWeight: "900" }}>
                  Yearly Recap
                </Text>

                <Pressable
                  onPress={() => setRecapOpen(false)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: "rgba(255,255,255,0.08)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "900" }}>Close</Text>
                </Pressable>
              </View>

              <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
                Swipe through your highlights.
              </Text>

              {/* Year chips */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {years.length ? (
                  years.map((y) => (
                    <Chip
                      key={y}
                      label={`${y}`}
                      active={selectedYear === y}
                      onPress={() => {
                        setSelectedYear(y);
                        requestAnimationFrame(() =>
                          recapListRef.current?.scrollToOffset({ offset: 0, animated: false })
                        );
                      }}
                    />
                  ))
                ) : (
                  <Text style={{ color: "rgba(255,255,255,0.55)" }}>No logs yet.</Text>
                )}
              </View>
            </View>

           <FlatList
  ref={recapListRef}
  data={slides}
  keyExtractor={(s) => s.key}
  horizontal
  pagingEnabled
  snapToInterval={slideW}
  decelerationRate="fast"
  showsHorizontalScrollIndicator={false}
  contentContainerStyle={{ paddingBottom: 20 }} // no horizontal padding for paging
  onMomentumScrollEnd={(e) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / slideW);
    // optional: if you want the page counter back, add state and set it here
    // setPage(i + 1);
  }}
  renderItem={({ item }) => (
    <View style={{ width: slideW, paddingHorizontal: 16 }}>
      <View style={{ marginBottom: 10 }}>
        <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>
          {item.title}
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 3 }}>
          {item.subtitle}
        </Text>
      </View>
      {item.render()}
    </View>
  )}
  ListEmptyComponent={
    <View style={{ width: slideW, paddingHorizontal: 16 }}>
      <View style={{ ...modalCard, padding: 16 }}>
        <Text style={{ color: "white", fontWeight: "900" }}>No recap available</Text>
        <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
          Add catches + photos, then your recap becomes your highlight reel.
        </Text>
      </View>
    </View>
  }
/>

          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
