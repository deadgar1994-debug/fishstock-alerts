import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Image,
    Pressable,
    SafeAreaView,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";

const BG = "#0b1220";
const STORAGE_KEY = "fish_log_v1";

const CARD_MM = 85.6;     // credit card width (mm)
const QUARTER_MM = 24.26; // US quarter diameter (mm)

type FishLogEntry = {
  id: string;
  createdAt: string;
  water: string;
  species: string;
  lengthIn?: string;
  notes?: string;
  photoUri?: string;
  videoUri?: string;
};

type Pt = { x: number; y: number };

function dist(a?: Pt, b?: Pt) {
  if (!a || !b) return 0;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function mmToIn(mm: number) {
  return mm / 25.4;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function RulerPhotoScreen() {
  const [logs, setLogs] = useState<FishLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // image display box size (we measure in THIS coordinate space)
  const [boxW, setBoxW] = useState(1);
  const [boxH, setBoxH] = useState(1);

  const [mode, setMode] = useState<"scale" | "measure">("scale");

  // Scale points (known object)
  const [scaleA, setScaleA] = useState<Pt | null>(null);
  const [scaleB, setScaleB] = useState<Pt | null>(null);

  // Measure points (fish length)
  const [measA, setMeasA] = useState<Pt | null>(null);
  const [measB, setMeasB] = useState<Pt | null>(null);

  // Known real length for scale segment
  const [knownMmText, setKnownMmText] = useState(String(CARD_MM));
  const knownMm = Number(knownMmText);

  // log selection
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  // tap placement alternates between A and B for whichever mode
  const nextTapRef = useRef<"A" | "B">("A");

  async function loadLogs() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as FishLogEntry[]) : [];
      setLogs(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      console.warn("RulerPhoto load logs error", e);
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  const selectedLog = useMemo(
    () => logs.find((x) => x.id === selectedLogId) ?? null,
    [logs, selectedLogId]
  );

  // only logs with photos (for “pick existing log photo” flow)
  const photoLogs = useMemo(() => {
    return logs
      .filter((x) => !!x.photoUri)
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [logs]);

  const hasScale = useMemo(() => {
    return (
      dist(scaleA ?? undefined, scaleB ?? undefined) > 1 &&
      Number.isFinite(knownMm) &&
      knownMm > 0
    );
  }, [scaleA, scaleB, knownMm]);

  // mm per overlay-pixel (in the displayed image box coordinate space)
  const mmPerPx = useMemo(() => {
    const px = dist(scaleA ?? undefined, scaleB ?? undefined);
    if (!hasScale || px <= 0) return null;
    return knownMm / px;
  }, [hasScale, knownMm, scaleA, scaleB]);

  const measuredMm = useMemo(() => {
    const px = dist(measA ?? undefined, measB ?? undefined);
    if (!mmPerPx || px <= 0) return null;
    return px * mmPerPx;
  }, [mmPerPx, measA, measB]);

  const measuredIn = useMemo(() => {
    if (!measuredMm) return null;
    return mmToIn(measuredMm);
  }, [measuredMm]);

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission needed",
        "Please allow photo library access to use Photo Measure."
      );
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (res.canceled) return;

    const uri = res.assets?.[0]?.uri;
    if (!uri) return;

    setPhotoUri(uri);

    // reset points whenever new photo picked
    setScaleA(null);
    setScaleB(null);
    setMeasA(null);
    setMeasB(null);
    setMode("scale");
    nextTapRef.current = "A";
  }

  function useSelectedLogPhoto() {
    if (!selectedLog) {
      Alert.alert("Pick a log", "Select a log that has a photo.");
      return;
    }
    if (!selectedLog.photoUri) {
      Alert.alert("No photo on this log", "That log doesn’t have a photo to measure.");
      return;
    }

    setPhotoUri(selectedLog.photoUri);

    // reset points whenever we switch photo source
    setScaleA(null);
    setScaleB(null);
    setMeasA(null);
    setMeasB(null);
    setMode("scale");
    nextTapRef.current = "A";
  }

  function resetPoints(which: "scale" | "measure" | "all") {
    if (which === "scale" || which === "all") {
      setScaleA(null);
      setScaleB(null);
    }
    if (which === "measure" || which === "all") {
      setMeasA(null);
      setMeasB(null);
    }
    nextTapRef.current = "A";
  }

  function onTapBox(evt: any) {
    if (!photoUri) return;

    const x = clamp(evt.nativeEvent.locationX, 0, boxW);
    const y = clamp(evt.nativeEvent.locationY, 0, boxH);

    const which = nextTapRef.current;

    if (mode === "scale") {
      if (which === "A") setScaleA({ x, y });
      else setScaleB({ x, y });
    } else {
      if (which === "A") setMeasA({ x, y });
      else setMeasB({ x, y });
    }

    nextTapRef.current = which === "A" ? "B" : "A";
  }

  async function saveToLog() {
    if (!selectedLogId) {
      Alert.alert("Pick a log", "Select the trip log you want to attach this measurement to.");
      return;
    }
    if (!measuredIn || !Number.isFinite(measuredIn)) {
      Alert.alert(
        "No measurement yet",
        "Switch to Measure mode and place 2 points to measure the fish."
      );
      return;
    }

    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as FishLogEntry[]) : [];
      const arr = Array.isArray(parsed) ? parsed : [];

      const inches = measuredIn;
      const inchesStr = inches >= 10 ? inches.toFixed(1) : inches.toFixed(2);

      const next = arr.map((it) => {
        if (it.id !== selectedLogId) return it;
        const prevNotes = it.notes?.trim() ? it.notes.trim() + "\n" : "";
        return {
          ...it,
          lengthIn: inchesStr,
          notes: `${prevNotes}📏 Photo measured: ${inchesStr} in`,
        };
      });

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setLogs(next);

      Alert.alert("Saved", `Saved ${inchesStr} in to that log.`);
    } catch (e) {
      console.warn("saveToLog error", e);
      Alert.alert("Error", "Could not save measurement to log.");
    }
  }

  const card = {
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  } as const;

  const pill = (active: boolean) =>
    ({
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: active ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.06)",
      borderWidth: 1,
      borderColor: active ? "rgba(59,130,246,0.45)" : "rgba(255,255,255,0.12)",
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
    } as const);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ gap: 6 }}>
          <Text style={{ color: "white", fontSize: 22, fontWeight: "900" }}>
            Photo Measure
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "700" }}>
            Pick a log photo or choose a photo, set scale, then measure.
          </Text>
        </View>

        {/* Actions */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Pressable
            onPress={pickPhoto}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 14,
              backgroundColor: "rgba(34,197,94,0.22)",
              borderWidth: 1,
              borderColor: "rgba(34,197,94,0.35)",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>Pick Photo</Text>
          </Pressable>

          <Pressable
            onPress={() => resetPoints("all")}
            style={{
              padding: 12,
              borderRadius: 14,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>Reset</Text>
          </Pressable>
        </View>

        {/* Mode toggle */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Pressable
            onPress={() => {
              setMode("scale");
              nextTapRef.current = "A";
            }}
            style={pill(mode === "scale")}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>1) Scale</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (!hasScale) {
                Alert.alert(
                  "Set scale first",
                  "In Scale mode, tap 2 points on a known object first."
                );
                return;
              }
              setMode("measure");
              nextTapRef.current = "A";
            }}
            style={pill(mode === "measure")}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>2) Measure</Text>
          </Pressable>
        </View>

        {/* Scale controls */}
        <View style={{ ...card, marginTop: 12 }}>
          <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>
            Scale (known length)
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
            Tap 2 points on a known object in the photo (card width or quarter).
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10, alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "800", fontSize: 12 }}>
                Known length (mm)
              </Text>
              <TextInput
                value={knownMmText}
                onChangeText={setKnownMmText}
                keyboardType="decimal-pad"
                placeholder={String(CARD_MM)}
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={{
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  color: "white",
                  backgroundColor: "rgba(0,0,0,0.20)",
                }}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => setKnownMmText(String(CARD_MM))}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "900" }}>Card</Text>
                <Text style={{ color: "rgba(255,255,255,0.55)", fontWeight: "800", fontSize: 11, marginTop: 2 }}>
                  {CARD_MM}mm
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setKnownMmText(String(QUARTER_MM))}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "900" }}>Quarter</Text>
                <Text style={{ color: "rgba(255,255,255,0.55)", fontWeight: "800", fontSize: 11, marginTop: 2 }}>
                  {QUARTER_MM}mm
                </Text>
              </Pressable>
            </View>
          </View>

          <Text
            style={{
              color: hasScale ? "rgba(34,197,94,0.9)" : "rgba(255,255,255,0.5)",
              marginTop: 10,
              fontWeight: "800",
            }}
          >
            {hasScale ? `Scale set ✅  (${(mmPerPx ?? 0).toFixed(4)} mm/px)` : "Scale not set yet"}
          </Text>
        </View>

        {/* Image box */}
        <View
          style={{
            marginTop: 12,
            borderRadius: 16,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        >
          <Pressable
            onPress={onTapBox}
            onLayout={(e) => {
              setBoxW(Math.max(1, e.nativeEvent.layout.width));
              setBoxH(Math.max(1, e.nativeEvent.layout.height));
            }}
            style={{
              width: "100%",
              height: 380,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {!photoUri ? (
              <Text style={{ color: "rgba(255,255,255,0.55)", fontWeight: "800" }}>
                Pick a log photo below or pick a photo to start
              </Text>
            ) : (
              <>
                <Image
                  source={{ uri: photoUri }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="contain"
                />

                {/* Points overlay */}
                <View
                  pointerEvents="none"
                  style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}
                >
                  {/* Scale points */}
                  {scaleA ? <Dot x={scaleA.x} y={scaleA.y} label="S1" color="rgba(59,130,246,0.95)" /> : null}
                  {scaleB ? <Dot x={scaleB.x} y={scaleB.y} label="S2" color="rgba(59,130,246,0.95)" /> : null}
                  {scaleA && scaleB ? <LineOverlay a={scaleA} b={scaleB} color="rgba(59,130,246,0.75)" /> : null}

                  {/* Measure points */}
                  {measA ? <Dot x={measA.x} y={measA.y} label="M1" color="rgba(168,85,247,0.95)" /> : null}
                  {measB ? <Dot x={measB.x} y={measB.y} label="M2" color="rgba(168,85,247,0.95)" /> : null}
                  {measA && measB ? <LineOverlay a={measA} b={measB} color="rgba(168,85,247,0.75)" /> : null}
                </View>

                {/* Mode hint */}
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: 10,
                    right: 10,
                    bottom: 10,
                    padding: 10,
                    borderRadius: 14,
                    backgroundColor: "rgba(0,0,0,0.45)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "900" }}>
                    {mode === "scale"
                      ? `Scale: tap ${nextTapRef.current === "A" ? "first" : "second"} point`
                      : `Measure: tap ${nextTapRef.current === "A" ? "first" : "second"} point`}
                  </Text>

                  {measuredIn ? (
                    <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "800", marginTop: 4 }}>
                      Result: {measuredIn.toFixed(2)} in ({measuredMm?.toFixed(1)} mm)
                    </Text>
                  ) : null}
                </View>
              </>
            )}
          </Pressable>
        </View>

        {/* Log picker (photo logs only) */}
        <View style={{ ...card, marginTop: 12 }}>
          <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>
            Pick an existing log photo
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
            Select a log that already has a photo, then load it here to measure.
          </Text>

          <View style={{ marginTop: 10 }}>
            {!loadingLogs && photoLogs.length === 0 ? (
              <Text style={{ color: "rgba(255,255,255,0.55)", fontWeight: "800" }}>
                No logs with photos found yet.
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {photoLogs.slice(0, 20).map((it) => {
                  const active = selectedLogId === it.id;
                  return (
                    <Pressable
                      key={it.id}
                      onPress={() => setSelectedLogId(it.id)}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 14,
                        backgroundColor: active ? "rgba(34,197,94,0.22)" : "rgba(255,255,255,0.06)",
                        borderWidth: 1,
                        borderColor: active ? "rgba(34,197,94,0.35)" : "rgba(255,255,255,0.12)",
                        minWidth: 190,
                      }}
                    >
                      <Text style={{ color: "white", fontWeight: "900" }}>
                        {it.species} • {it.water}
                      </Text>
                      <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                        {formatDate(it.createdAt)}
                      </Text>
                      <Text style={{ color: "rgba(255,255,255,0.45)", marginTop: 6, fontWeight: "800", fontSize: 12 }}>
                        {active ? "Selected" : "Tap to select"}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          <Pressable
            onPress={useSelectedLogPhoto}
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 16,
              backgroundColor: selectedLog?.photoUri ? "rgba(34,197,94,0.22)" : "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: selectedLog?.photoUri ? "rgba(34,197,94,0.35)" : "rgba(255,255,255,0.12)",
              alignItems: "center",
              opacity: selectedLog?.photoUri ? 1 : 0.7,
            }}
          >
            <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>
              Use selected log’s photo
            </Text>
          </Pressable>

          {selectedLog ? (
            <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 10, fontWeight: "800" }}>
              Selected: {selectedLog.species} • {selectedLog.water}
            </Text>
          ) : null}
        </View>

        {/* Save to log */}
        <View style={{ ...card, marginTop: 12 }}>
          <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>
            Save measurement to selected log
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
            This writes the measured inches into that log’s length and notes.
          </Text>

          <Pressable
            onPress={saveToLog}
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 16,
              backgroundColor: measuredIn ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: measuredIn ? "rgba(59,130,246,0.45)" : "rgba(255,255,255,0.12)",
              alignItems: "center",
              opacity: measuredIn ? 1 : 0.7,
            }}
          >
            <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>
              Save measurement
            </Text>
          </Pressable>

          <Text style={{ color: "rgba(255,255,255,0.45)", fontWeight: "800", marginTop: 10 }}>
            Tip: Card or Quarter → tap 2 points → Measure → tap 2 points → Save.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- tiny overlay helpers ---------- */

function Dot({ x, y, label, color }: { x: number; y: number; label: string; color: string }) {
  return (
    <View style={{ position: "absolute", left: x - 10, top: y - 10, alignItems: "center" }}>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: color,
          borderWidth: 2,
          borderColor: "rgba(255,255,255,0.9)",
        }}
      />
      <View
        style={{
          marginTop: 4,
          paddingVertical: 2,
          paddingHorizontal: 8,
          borderRadius: 999,
          backgroundColor: "rgba(0,0,0,0.45)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
        }}
      >
        <Text style={{ color: "white", fontWeight: "900", fontSize: 11 }}>{label}</Text>
      </View>
    </View>
  );
}

function LineOverlay({ a, b, color }: { a: { x: number; y: number }; b: { x: number; y: number }; color: string }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;

  return (
    <View
      style={{
        position: "absolute",
        left: a.x,
        top: a.y,
        width: len,
        height: 3,
        backgroundColor: color,
        transform: [{ rotate: `${ang}deg` }],
        borderRadius: 2,
      }}
    />
  );
}
