import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Defs, G, Line, LinearGradient, Rect, Stop, Text as SvgText } from "react-native-svg";

const BG = "#0b1220";
const LS_KEY = "tools.ruler.px_per_mm.v2";

function inToMm(inches: number) {
  return inches * 25.4;
}

/* ---------- UI ---------- */
function Pill({
  title,
  onPress,
  active,
}: {
  title: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        backgroundColor: active ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.06)",
        borderColor: active ? "rgba(59,130,246,0.45)" : "rgba(255,255,255,0.10)",
      }}
    >
      <Text style={{ color: "white", fontWeight: "900", fontSize: 13 }}>{title}</Text>
    </Pressable>
  );
}

/* ---------- SIMPLE VIEWPORT RULER ---------- */
const SimpleRulerViewport = React.memo(function SimpleRulerViewport({
  width,
  height,
  pxPerMm,
  unit,
  topPad,
  mmMax,
  inchesMax,
  scrollY,
}: {
  width: number;
  height: number;
  pxPerMm: number;
  unit: "mm" | "in";
  topPad: number;
  mmMax: number;
  inchesMax: number;
  scrollY: number;
}) {
  const r = 18;
  const railW = 18;

  const faceTop = "#e2e7ee";
  const faceMid = "#cfd6df";
  const faceBot = "#b9c2cd";
  const ink = "rgba(10,14,20,0.88)";

  const edgeLo = "rgba(0,0,0,0.22)";

  // simple tick lengths
  const L_MAJOR = width * 0.88; // inch or 1cm
  const L_MID = width * 0.55;   // 5mm or 1/2"
  const L_MINOR = width * 0.34; // 1/8"

  const tickX1 = railW;

  const Tick = React.useCallback(
    ({ y, len, w, op }: { y: number; len: number; w: number; op: number }) => (
      <G>
        <Line
          x1={tickX1}
          y1={y + 0.9}
          x2={tickX1 + len}
          y2={y + 0.9}
          stroke="rgba(0,0,0,0.22)"
          strokeWidth={w + 0.7}
          strokeLinecap="round"
        />
        <Line
          x1={tickX1}
          y1={y}
          x2={tickX1 + len}
          y2={y}
          stroke={ink}
          strokeOpacity={op}
          strokeWidth={w}
          strokeLinecap="round"
        />
      </G>
    ),
    [tickX1, ink]
  );

  const Label = React.useCallback(
    ({ y, text, big }: { y: number; text: string; big?: boolean }) => (
      <G>
        <Rect
          x={width - 78}
          y={y - (big ? 20 : 16)}
          width={72}
          height={big ? 24 : 20}
          rx={12}
          fill="rgba(255,255,255,0.28)"
          stroke="rgba(0,0,0,0.10)"
        />
        <SvgText
          x={width - 12}
          y={y - 3}
          fill={ink}
          fontSize={big ? 16 : 13}
          fontWeight="900"
          textAnchor="end"
        >
          {text}
        </SvgText>
      </G>
    ),
    [width, ink]
  );

  const yMin = scrollY - 120;
  const yMax = scrollY + height + 120;

  const marks = useMemo(() => {
    const out: React.ReactNode[] = [];

    if (unit === "mm") {
      // ✅ SIMPLE mm: ONLY every 5mm, label every 10mm (cm)
      const step = 5;

      const mmStartRaw = Math.floor((yMin - topPad) / pxPerMm);
      const mmEndRaw = Math.ceil((yMax - topPad) / pxPerMm);

      // snap to nearest step
      const mmStart = Math.max(0, Math.floor(mmStartRaw / step) * step - step * 2);
      const mmEnd = Math.min(mmMax, Math.ceil(mmEndRaw / step) * step + step * 2);

      for (let mm = mmStart; mm <= mmEnd; mm += step) {
        const worldY = topPad + mm * pxPerMm;
        const y = worldY - scrollY;

        const is10 = mm % 10 === 0;

        const len = is10 ? L_MAJOR : L_MID;
        const w = is10 ? 2.6 : 1.9;
        const op = is10 ? 0.85 : 0.55;

        out.push(
          <G key={`mm_${mm}`}>
            <Tick y={y} len={len} w={w} op={op} />
            {is10 ? <Label y={y} text={`${mm / 10} cm`} /> : null}
          </G>
        );
      }
    } else {
      // inches: 1/8" ticks, label each inch (unchanged)
      const mmPerEighth = inToMm(1 / 8);

      const idxStart = Math.max(
        0,
        Math.floor((yMin - topPad) / (pxPerMm * mmPerEighth)) - 8
      );
      const idxEnd = Math.min(
        inchesMax * 8,
        Math.ceil((yMax - topPad) / (pxPerMm * mmPerEighth)) + 8
      );

      for (let idx = idxStart; idx <= idxEnd; idx += 1) {
        const frac = idx % 8;
        const inches = idx / 8;

        const worldMm = inToMm(inches);
        const worldY = topPad + worldMm * pxPerMm;
        const y = worldY - scrollY;

        const isWhole = frac === 0;
        const isHalf = frac === 4;

        const len = isWhole ? L_MAJOR : isHalf ? L_MID : L_MINOR;
        const w = isWhole ? 3 : isHalf ? 2.2 : 1.2;
        const op = isWhole ? 0.9 : isHalf ? 0.65 : 0.38;

        out.push(
          <G key={`in_${idx}`}>
            <Tick y={y} len={len} w={w} op={op} />
            {isWhole ? <Label y={y} text={`${Math.round(inches)}"`} big /> : null}
          </G>
        );
      }
    }

    return out;
  }, [unit, yMin, yMax, topPad, pxPerMm, scrollY, mmMax, inchesMax, L_MAJOR, L_MID, L_MINOR, Tick, Label]);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient id="tapeFace" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={faceTop} />
          <Stop offset="0.55" stopColor={faceMid} />
          <Stop offset="1" stopColor={faceBot} />
        </LinearGradient>

        <LinearGradient id="rail" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1f2a37" stopOpacity={0.95} />
          <Stop offset="1" stopColor="#0b1220" stopOpacity={0.95} />
        </LinearGradient>

        <LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#fff" stopOpacity={0.20} />
          <Stop offset="0.35" stopColor="#fff" stopOpacity={0.06} />
          <Stop offset="1" stopColor="#fff" stopOpacity={0} />
        </LinearGradient>
      </Defs>

      {/* body */}
      <Rect x={0} y={0} width={width} height={height} rx={r} fill="url(#tapeFace)" />
      <Rect x={2} y={2} width={width - 4} height={height - 4} rx={r - 2} fill="transparent" stroke={edgeLo} />

      {/* left rail */}
      <Rect x={0} y={0} width={railW} height={height} rx={r} fill="url(#rail)" />
      <Line x1={railW} y1={0} x2={railW} y2={height} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />

      {/* sheen */}
      <Rect x={railW} y={8} width={width - railW - 10} height={18} rx={10} fill="url(#sheen)" />

      {/* baseline */}
      <Line
        x1={0}
        y1={topPad - scrollY}
        x2={width}
        y2={topPad - scrollY}
        stroke="rgba(0,0,0,0.22)"
        strokeWidth={2}
      />

      {marks}
    </Svg>
  );
});

/* ---------- SCREEN ---------- */
export default function RulerScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const [pxPerMm, setPxPerMm] = useState<number | null>(null);
  const [unit, setUnit] = useState<"mm" | "in">("in");
  const [scrollY, setScrollY] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(LS_KEY);
        if (!alive) return;
        if (raw) {
          const val = Number(raw);
          if (Number.isFinite(val) && val > 0) setPxPerMm(val);
        }
      } catch {
        // ignore
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const isCalibrated = !!pxPerMm;

  const tapeW = width - 12;
  const topPad = 18;

  const inchesMax = 36;
  const mmMax = Math.round(inToMm(inchesMax));

  const ppm = pxPerMm ?? 3;
  const contentHeight = topPad + mmMax * ppm + 140;

  // fills more screen
  const viewportH = Math.min(contentHeight, Math.max(560, Math.floor(height * 0.86)));

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollY(e.nativeEvent.contentOffset.y);
  };

  const hudStyle = {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.38)",
    borderColor: "rgba(255,255,255,0.12)",
  } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ flex: 1, padding: 6 }}>
        <View
          style={{
            flex: 1,
            borderRadius: 22,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(0,0,0,0.18)",
          }}
        >
          {/* Calibrate */}
          <Pressable
            onPress={() => router.push("/tools/ruler-calibrate")}
            style={{ position: "absolute", top: 10, left: 10, zIndex: 50, ...hudStyle }}
          >
            <Text style={{ color: "rgba(255,255,255,0.92)", fontWeight: "900", fontSize: 12 }}>
              Calibrate
            </Text>
          </Pressable>

          {/* px/mm badge */}
          {loaded && isCalibrated ? (
            <View style={{ position: "absolute", top: 10, right: 10, zIndex: 50, ...hudStyle }}>
              <Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: "900", fontSize: 12 }}>
                {pxPerMm!.toFixed(2)} px/mm
              </Text>
            </View>
          ) : null}

          {!loaded ? (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.60)", fontWeight: "800" }}>
                Loading ruler…
              </Text>
            </View>
          ) : !isCalibrated ? (
            <View style={{ flex: 1, justifyContent: "center", padding: 18 }}>
              <Text style={{ color: "white", fontSize: 22, fontWeight: "900" }}>
                Calibrate to use the ruler
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.70)", marginTop: 10, lineHeight: 20 }}>
                One-time calibration with a credit card makes the ruler accurate.
              </Text>

              <Pressable
                onPress={() => router.push("/tools/ruler-calibrate")}
                style={{
                  marginTop: 16,
                  padding: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  backgroundColor: "rgba(34,197,94,0.25)",
                  borderColor: "rgba(34,197,94,0.45)",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>
                  Calibrate Ruler →
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* scroll driver only */}
              <ScrollView
                onScroll={onScroll}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews
                contentContainerStyle={{
                  paddingTop: 6,
                  paddingHorizontal: 6,
                  paddingBottom: 76,
                }}
              >
                <View style={{ width: tapeW, height: contentHeight, borderRadius: 22, overflow: "hidden" }} />
              </ScrollView>

              {/* viewport overlay */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 6,
                  left: 6,
                  right: 6,
                  height: viewportH,
                  borderRadius: 22,
                  overflow: "hidden",
                }}
              >
                <SimpleRulerViewport
                  width={tapeW}
                  height={viewportH}
                  pxPerMm={pxPerMm!}
                  unit={unit}
                  topPad={topPad}
                  mmMax={mmMax}
                  inchesMax={inchesMax}
                  scrollY={scrollY}
                />
              </View>

              {/* unit toggle */}
              <View
                style={{
                  position: "absolute",
                  left: 10,
                  right: 10,
                  bottom: 10,
                  zIndex: 60,
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 10,
                  padding: 10,
                  borderRadius: 18,
                  backgroundColor: "rgba(0,0,0,0.34)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                }}
              >
                <Pill title="in" onPress={() => setUnit("in")} active={unit === "in"} />
                <Pill title="mm" onPress={() => setUnit("mm")} active={unit === "mm"} />
              </View>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
