import AsyncStorage from "@react-native-async-storage/async-storage";
import { Picker } from "@react-native-picker/picker";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

import { BACKEND_URL } from "@/src/config";

type StockEvent = {
  id: string;
  water_name: string;
  county: string;
  species: string;
  quantity: number | null;
  avg_length: number | null;
  date_stocked: string; // YYYY-MM-DD
  first_seen_at?: string;
};

function normalize(s: string) {
  return String(s || "").trim().toUpperCase();
}

function formatQty(q: number | null) {
  if (!q) return "—";
  try {
    return q.toLocaleString();
  } catch {
    return String(q);
  }
}

async function apiGet(path: string) {
  const url = `${BACKEND_URL}${path}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Request failed: ${res.status}`);
  }
  return json;
}

async function fetchCounties(state: string): Promise<string[]> {
  const st = normalize(state) || "UT";
  const json = await apiGet(`/meta/counties?state=${encodeURIComponent(st)}`);
  return (json.counties ?? []).map((x: any) => String(x));
}

async function fetchSpecies(state: string): Promise<string[]> {
  const st = normalize(state) || "UT";
  const json = await apiGet(`/meta/species?state=${encodeURIComponent(st)}`);
  return (json.species ?? []).map((x: any) => String(x));
}

async function fetchWaters(state: string, county: string): Promise<string[]> {
  const st = normalize(state) || "UT";
  const c = normalize(county);
  if (!c) return [];
  const json = await apiGet(
    `/meta/waters?state=${encodeURIComponent(st)}&county=${encodeURIComponent(c)}`
  );
  return (json.waters ?? []).map((x: any) => String(x));
}

async function fetchEvents(params: {
  state: string;
  county?: string;
  species?: string;
  water?: string;
  limit?: number;
  offset?: number;
}): Promise<{ events: StockEvent[]; total: number; limit: number; offset: number }> {
  const q = new URLSearchParams();
  const st = normalize(params.state) || "UT";
  q.set("state", st);
  if (params.county) q.set("county", params.county);
  if (params.species) q.set("species", params.species);
  if (params.water) q.set("water", params.water);
  q.set("limit", String(params.limit ?? 50));
  q.set("offset", String(params.offset ?? 0));

  const json = await apiGet(`/events?${q.toString()}`);
  return {
    events: json.events ?? [],
    total: json.total ?? 0,
    limit: json.limit ?? (params.limit ?? 50),
    offset: json.offset ?? (params.offset ?? 0),
  };
}

/* ---------- theme ---------- */
const BG = "#0b1220";
const PICKER_HEIGHT = 96;

const PAGE_PAD = 16;
const pagePadStyle = { paddingHorizontal: PAGE_PAD } as const;

const cardStyle = {
  padding: 12,
  borderRadius: 12,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
} as const;

const labelStyle = {
  color: "rgba(255,255,255,0.75)",
  marginBottom: 6,
  marginTop: 10,
  fontWeight: "700",
} as const;

const pillBase = {
  paddingVertical: 12,
  paddingHorizontal: 12,
  borderRadius: 12,
  borderWidth: 1,
  alignItems: "center" as const,
  justifyContent: "center" as const,
} as const;

function PillButton({
  title,
  onPress,
  variant = "neutral",
}: {
  title: string;
  onPress: () => void;
  variant?: "neutral" | "blue" | "green" | "purple" | "danger";
}) {
  const style =
    variant === "blue"
      ? {
          ...pillBase,
          backgroundColor: "rgba(59,130,246,0.25)",
          borderColor: "rgba(59,130,246,0.4)",
        }
      : variant === "green"
      ? {
          ...pillBase,
          backgroundColor: "rgba(34,197,94,0.25)",
          borderColor: "rgba(34,197,94,0.45)",
        }
      : variant === "purple"
      ? {
          ...pillBase,
          backgroundColor: "rgba(168,85,247,0.25)",
          borderColor: "rgba(168,85,247,0.45)",
        }
      : variant === "danger"
      ? {
          ...pillBase,
          backgroundColor: "rgba(239,68,68,0.20)",
          borderColor: "rgba(239,68,68,0.35)",
        }
      : {
          ...pillBase,
          backgroundColor: "rgba(255,255,255,0.06)",
          borderColor: "rgba(255,255,255,0.10)",
        };

  return (
    <Pressable onPress={onPress} style={style}>
      <Text style={{ color: "white", fontWeight: "800" }}>{title}</Text>
    </Pressable>
  );
}

/* ---------- tiny svg “tag” icon ---------- */
function TagIcon({ kind }: { kind: "fish" | "qty" | "date" }) {
  const stroke = "rgba(255,255,255,0.85)";
  const faint = "rgba(255,255,255,0.35)";

  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      {kind === "fish" ? (
        <G fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M4 12c3-4 7-6 12-6 1 2 2 4 4 6-2 2-3 4-4 6-5 0-9-2-12-6z" />
          <Circle cx="14.5" cy="10.5" r="0.8" fill={stroke} stroke="none" />
          <Path d="M4 12l-2-2m2 2l-2 2" stroke={faint} />
        </G>
      ) : kind === "qty" ? (
        <G fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Rect x="6" y="6" width="12" height="12" rx="3" />
          <Path d="M9 12h6" />
          <Path d="M12 9v6" stroke={faint} />
        </G>
      ) : (
        <G fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Rect x="5" y="6" width="14" height="14" rx="3" />
          <Path d="M8 4v4M16 4v4" />
          <Path d="M7 11h10" stroke={faint} />
        </G>
      )}
    </Svg>
  );
}

function TagPill({ icon, text }: { icon: "fish" | "qty" | "date"; text: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 7,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: "rgba(0,0,0,0.18)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
      }}
    >
      <TagIcon kind={icon} />
      <Text style={{ color: "rgba(255,255,255,0.88)", fontWeight: "800", fontSize: 12 }}>
        {text}
      </Text>
    </View>
  );
}

function daysSince(yyyyMmDd: string) {
  const d = new Date(yyyyMmDd + "T00:00:00");
  const now = new Date();
  const ms = now.getTime() - d.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function RecencyDot({ date }: { date: string }) {
  const d = daysSince(date);

  const bg =
    d <= 7
      ? "rgba(34,197,94,0.90)"
      : d <= 30
      ? "rgba(234,179,8,0.90)"
      : "rgba(239,68,68,0.90)";

  return (
    <Svg width={10} height={10} viewBox="0 0 10 10">
      <Circle cx={5} cy={5} r={4} fill={bg} />
      <Circle
        cx={5}
        cy={5}
        r={4}
        fill="transparent"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={1}
      />
    </Svg>
  );
}

function EventCard({ ev }: { ev: StockEvent }) {
  return (
    <View style={cardStyle}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <RecencyDot date={ev.date_stocked} />
        <Text style={{ color: "white", fontSize: 16, fontWeight: "800", flex: 1 }}>
          {ev.water_name}
        </Text>
      </View>

      <Text style={{ color: "rgba(255,255,255,0.70)", marginTop: 6 }}>{ev.county}</Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <TagPill icon="fish" text={ev.species} />
        <TagPill icon="qty" text={`${formatQty(ev.quantity)} fish`} />
        <TagPill icon="date" text={`${ev.date_stocked}${ev.avg_length ? ` • ${ev.avg_length}" avg` : ""}`} />
      </View>
    </View>
  );
}

const LS_KEY = "fishstock.filters.v2";
const STATES = [
  { code: "UT", label: "UTAH" },
  { code: "CO", label: "COLORADO" },
  { code: "MT", label: "MONTANA" },
  { code: "ID", label: "IDAHO" },
];

export default function RestocksScreen() {
  const [stateCode, setStateCode] = useState<string>("UT");

  // defaults for UT; will auto-clear on state change for multi-state
  const [county, setCounty] = useState<string>("WASATCH");
  const [species, setSpecies] = useState<string>("RAINBOW");
  const [water, setWater] = useState<string>("");

  const [counties, setCounties] = useState<string[]>([]);
  const [speciesList, setSpeciesList] = useState<string[]>([]);
  const [waters, setWaters] = useState<string[]>([]);

  const [events, setEvents] = useState<StockEvent[]>([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusText, setStatusText] = useState("");

  const [filtersOpen, setFiltersOpen] = useState(true);

  const stateNorm = useMemo(() => normalize(stateCode), [stateCode]);
  const countyNorm = useMemo(() => normalize(county), [county]);
  const speciesNorm = useMemo(() => normalize(species), [species]);
  const waterNorm = useMemo(() => String(water || "").trim(), [water]);

  const saveFilters = async (next?: {
    stateCode?: string;
    county?: string;
    species?: string;
    water?: string;
  }) => {
    const payload = {
      stateCode: next?.stateCode ?? stateNorm,
      county: next?.county ?? countyNorm,
      species: next?.species ?? speciesNorm,
      water: next?.water ?? waterNorm,
    };
    await AsyncStorage.setItem(LS_KEY, JSON.stringify(payload));
  };

  const loadSavedFilters = async () => {
    try {
      const raw = await AsyncStorage.getItem(LS_KEY);
      if (!raw) return;
      const j = JSON.parse(raw);

      if (typeof j?.stateCode === "string") setStateCode(j.stateCode);
      if (typeof j?.county === "string") setCounty(j.county);
      if (typeof j?.species === "string") setSpecies(j.species);
      if (typeof j?.water === "string") setWater(j.water);
    } catch {}
  };

  const loadMeta = async (st: string) => {
    const [c, s] = await Promise.all([fetchCounties(st), fetchSpecies(st)]);
    setCounties(c);
    setSpeciesList(s);
  };

  const loadWatersForCounty = async (st: string, c: string) => {
    const cNorm = normalize(c);
    if (!cNorm) {
      setWaters([]);
      return;
    }
    const w = await fetchWaters(st, cNorm);
    setWaters(w);
  };

  const loadEvents = async (st: string) => {
    const { events: ev, total: t } = await fetchEvents({
      state: st,
      county: countyNorm || undefined,
      species: speciesNorm || undefined,
      water: waterNorm || undefined,
      limit: 80,
      offset: 0,
    });
    setEvents(ev);
    setTotal(t);
  };

  // Initial load
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await loadSavedFilters();
        // meta/events will be loaded by effects below once stateNorm resolves
      } catch (e: any) {
        setStatusText(e?.message || "Failed to load filters");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  

 // Load meta + events when state changes
useEffect(() => {
  (async () => {
    try {
      if (!stateNorm) return;

      // IMPORTANT: clear in-memory filters so UT filters don't block CO data
      setCounty("");
      setSpecies("");
      setWater("");
      setWaters([]); // clears water dropdown

      // Persist cleared filters too
      await saveFilters({ stateCode: stateNorm, county: "", species: "", water: "" });

      // Load fresh meta + events for the new state (no filters)
      await loadMeta(stateNorm);
      await fetchEvents({ state: stateNorm, limit: 80, offset: 0 }).then(({ events: ev, total: t }) => {
        setEvents(ev);
        setTotal(t);
      });

      setStatusText("");
    } catch (e: any) {
      setStatusText(e?.message || "State load failed");
    }
  })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [stateNorm]);

useEffect(() => {
  (async () => {
    try {
      if (!stateNorm) return;
      if (!countyNorm) {
        setWaters([]);
        return;
      }

      await loadWatersForCounty(stateNorm, countyNorm);

      // If current water is no longer valid under this county, clear it
      if (waterNorm) {
        const w = await fetchWaters(stateNorm, countyNorm);
        if (!w.includes(waterNorm)) setWater("");
      }

      await loadEvents(stateNorm);
      await saveFilters();
      setStatusText("");
    } catch (e: any) {
      setStatusText(e?.message || "Load failed");
    }
  })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [countyNorm]);

  // When species or water changes, reload events (state-aware)
  useEffect(() => {
    (async () => {
      try {
        if (!stateNorm) return;
        await loadEvents(stateNorm);
        await saveFilters();
        setStatusText("");
      } catch (e: any) {
        setStatusText(e?.message || "Load failed");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speciesNorm, waterNorm]);

  const testBackend = async () => {
    try {
      const url = `${BACKEND_URL}/version`;
      const r = await fetch(url);
      const txt = await r.text();
      Alert.alert("Backend response", txt);
    } catch (e: any) {
      Alert.alert("Network failed", e?.message ?? String(e));
    }
  };

  const clearFilters = async () => {
    setStateCode("UT");
    setCounty("");
    setSpecies("");
    setWater("");
    await saveFilters({ stateCode: "UT", county: "", species: "", water: "" });
  };

  const headerLine =
    `Showing ${events.length} of ${total}` +
    (stateNorm ? ` • ${stateNorm}` : "") +
    (countyNorm ? ` • ${countyNorm}` : "") +
    (speciesNorm ? ` • ${speciesNorm}` : "") +
    (waterNorm ? ` • ${waterNorm}` : "");

  const ListHeader = (
    <View style={{ gap: 8 }}>
      <View style={cardStyle}>
        <Text style={{ fontSize: 22, fontWeight: "900", color: "white" }}>
          Recent Restocks
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 6 }}>
          Local results • pull to refresh
        </Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <PillButton title="Test backend" onPress={testBackend} variant="blue" />
          </View>
          <View style={{ flex: 1 }}>
            <PillButton
              title={filtersOpen ? "Hide filters ▲" : "Show filters ▼"}
              onPress={() => setFiltersOpen((v) => !v)}
              variant="neutral"
            />
          </View>
        </View>
      </View>

      {filtersOpen && (
        <View style={{ ...cardStyle, gap: 10 }}>
          <Text style={labelStyle}>State</Text>
          <View
            style={{
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              borderRadius: 12,
              overflow: "hidden",
              height: PICKER_HEIGHT,
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          >
            <Picker
              selectedValue={stateCode}
              onValueChange={(v) => setStateCode(String(v))}
              dropdownIconColor="#fff"
              style={{ color: "white", height: PICKER_HEIGHT }}
              itemStyle={{ height: PICKER_HEIGHT }}
            >
              {STATES.map((s) => (
                <Picker.Item key={s.code} label={s.label} value={s.code} />
              ))}
            </Picker>
          </View>

          <Text style={labelStyle}>County</Text>
          <View
            style={{
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              borderRadius: 12,
              overflow: "hidden",
              height: PICKER_HEIGHT,
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          >
            <Picker
              selectedValue={countyNorm}
              onValueChange={(v) => setCounty(String(v))}
              dropdownIconColor="#fff"
              style={{ color: "white", height: PICKER_HEIGHT }}
              itemStyle={{ height: PICKER_HEIGHT }}
            >
              <Picker.Item label="ALL COUNTIES" value="" />
              {counties.map((c) => (
                <Picker.Item key={c} label={c} value={c} />
              ))}
            </Picker>
          </View>

          <Text style={labelStyle}>Species</Text>
          <View
            style={{
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              borderRadius: 12,
              overflow: "hidden",
              height: PICKER_HEIGHT,
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          >
            <Picker
              selectedValue={speciesNorm}
              onValueChange={(v) => setSpecies(String(v))}
              dropdownIconColor="#fff"
              style={{ color: "white", height: PICKER_HEIGHT }}
              itemStyle={{ height: PICKER_HEIGHT }}
            >
              <Picker.Item label="ALL SPECIES" value="" />
              {speciesList.map((s) => (
                <Picker.Item key={s} label={s} value={s} />
              ))}
            </Picker>
          </View>

          <Text style={labelStyle}>Water (optional)</Text>
          <View
            style={{
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              borderRadius: 12,
              overflow: "hidden",
              height: PICKER_HEIGHT,
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.04)",
              opacity: countyNorm ? 1 : 0.6,
            }}
          >
            <Picker
              selectedValue={waterNorm}
              onValueChange={(v) => setWater(String(v))}
              dropdownIconColor="#fff"
              style={{ color: "white", height: PICKER_HEIGHT }}
              itemStyle={{ height: PICKER_HEIGHT }}
              enabled={!!countyNorm}
            >
              <Picker.Item label={countyNorm ? "ALL WATERS" : "Pick a county first"} value="" />
              {waters.map((w) => (
                <Picker.Item key={w} label={w} value={w} />
              ))}
            </Picker>
          </View>

          <PillButton title="Clear filters" onPress={clearFilters} variant="danger" />

          {!!statusText && (
            <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
              {statusText}
            </Text>
          )}
        </View>
      )}

      <View style={[cardStyle, { marginBottom: 8 }]}>
        <Text style={{ color: "rgba(255,255,255,0.70)" }}>{headerLine}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView
      edges={["left", "right"]}
      style={{ flex: 1, backgroundColor: BG, paddingTop: 16 }}
    >
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#fff" />
          <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 10 }}>
            Loading…
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 16 }}
          ListHeaderComponent={<View style={pagePadStyle}>{ListHeader}</View>}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <View style={pagePadStyle}>
              <EventCard ev={item} />
            </View>
          )}
          refreshControl={
            <RefreshControl
              tintColor="#fff"
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                try {
                  await loadMeta(stateNorm);
                  await loadWatersForCounty(stateNorm, countyNorm);
                  await loadEvents(stateNorm);
                  setStatusText("");
                } catch (e: any) {
                  setStatusText(e?.message || "Refresh failed");
                } finally {
                  setRefreshing(false);
                }
              }}
            />
          }
          ListEmptyComponent={
            <View style={[pagePadStyle, { marginTop: 10 }]}>
              <View style={cardStyle}>
                <Text style={{ color: "rgba(255,255,255,0.70)" }}>
                  No results. Try clearing filters.
                </Text>
              </View>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
