import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, SafeAreaView, Text, View, useWindowDimensions } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";

const BG = "#0b1220";

/* ---------- math helpers ---------- */
function wrap360(deg: number) {
  return (deg + 360) % 360;
}
function deltaAngle(next: number, prev: number) {
  return (((next - prev + 540) % 360) - 180);
}
function smoothAngle(raw: number, prev: number, alpha: number) {
  const d = deltaAngle(raw, prev);
  return wrap360(prev + alpha * d);
}
function headingToCardinal(deg: number) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx];
}
function polar(cx: number, cy: number, rr: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + rr * Math.sin(a), y: cy - rr * Math.cos(a) };
}

/* ---------- needle arrow path ---------- */
function needleArrowPath(r: number, yTip: number, yTail: number, halfW: number) {
  return `
    M ${r} ${yTip}
    L ${r + halfW} ${r}
    L ${r} ${yTail}
    L ${r - halfW} ${r}
    Z
  `;
}

/* ---------- photo-like compass rose ---------- */
function Rose({
  cx,
  cy,
  longR,
  midR,
  shortR,
  baseW,
}: {
  cx: number;
  cy: number;
  longR: number;
  midR: number;
  shortR: number;
  baseW: number;
}) {
  const kite = (tipR: number, shoulderR: number, shoulderDeg: number, backR: number) => {
    const tip = polar(cx, cy, tipR, 0);
    const r1 = polar(cx, cy, shoulderR, shoulderDeg);
    const back = polar(cx, cy, backR, 180);
    const r2 = polar(cx, cy, shoulderR, -shoulderDeg);
    return `M ${tip.x} ${tip.y} L ${r1.x} ${r1.y} L ${back.x} ${back.y} L ${r2.x} ${r2.y} Z`;
  };

  const longKite = kite(longR, longR * 0.42, 10, baseW * 0.50);
  const diagKite = kite(midR, midR * 0.45, 10, baseW * 0.52);
  const shortKite = kite(shortR, shortR * 0.55, 14, baseW * 0.58);

  return (
    <G>
      {/* subtle shadow */}
      <G opacity={0.10} transform={`translate(2 2)`}>
        <Path d={longKite} fill="#000" />
        <G transform={`rotate(90 ${cx} ${cy})`}><Path d={longKite} fill="#000" /></G>
        <G transform={`rotate(180 ${cx} ${cy})`}><Path d={longKite} fill="#000" /></G>
        <G transform={`rotate(270 ${cx} ${cy})`}><Path d={longKite} fill="#000" /></G>

        <G transform={`rotate(45 ${cx} ${cy})`}><Path d={diagKite} fill="#000" /></G>
        <G transform={`rotate(135 ${cx} ${cy})`}><Path d={diagKite} fill="#000" /></G>
        <G transform={`rotate(225 ${cx} ${cy})`}><Path d={diagKite} fill="#000" /></G>
        <G transform={`rotate(315 ${cx} ${cy})`}><Path d={diagKite} fill="#000" /></G>
      </G>

      {/* long points */}
      <Path d={longKite} fill="#111" />
      <G transform={`rotate(90 ${cx} ${cy})`}><Path d={longKite} fill="#111" /></G>
      <G transform={`rotate(180 ${cx} ${cy})`}><Path d={longKite} fill="#111" /></G>
      <G transform={`rotate(270 ${cx} ${cy})`}><Path d={longKite} fill="#111" /></G>

      {/* diagonal points */}
      <G opacity={0.85}>
        <G transform={`rotate(45 ${cx} ${cy})`}><Path d={diagKite} fill="#111" /></G>
        <G transform={`rotate(135 ${cx} ${cy})`}><Path d={diagKite} fill="#111" /></G>
        <G transform={`rotate(225 ${cx} ${cy})`}><Path d={diagKite} fill="#111" /></G>
        <G transform={`rotate(315 ${cx} ${cy})`}><Path d={diagKite} fill="#111" /></G>
      </G>

      {/* short in-between points */}
      <G opacity={0.55}>
        <G transform={`rotate(22.5 ${cx} ${cy})`}><Path d={shortKite} fill="#111" /></G>
        <G transform={`rotate(67.5 ${cx} ${cy})`}><Path d={shortKite} fill="#111" /></G>
        <G transform={`rotate(112.5 ${cx} ${cy})`}><Path d={shortKite} fill="#111" /></G>
        <G transform={`rotate(157.5 ${cx} ${cy})`}><Path d={shortKite} fill="#111" /></G>
        <G transform={`rotate(202.5 ${cx} ${cy})`}><Path d={shortKite} fill="#111" /></G>
        <G transform={`rotate(247.5 ${cx} ${cy})`}><Path d={shortKite} fill="#111" /></G>
        <G transform={`rotate(292.5 ${cx} ${cy})`}><Path d={shortKite} fill="#111" /></G>
        <G transform={`rotate(337.5 ${cx} ${cy})`}><Path d={shortKite} fill="#111" /></G>
      </G>

      {/* inner ring */}
      <Circle
        cx={cx}
        cy={cy}
        r={baseW * 1.6}
        fill="transparent"
        stroke="#111"
        strokeOpacity={0.25}
        strokeWidth={2}
      />
    </G>
  );
}

/* ---------- tiny UI helpers ---------- */
function Pill({
  text,
  tone = "neutral",
}: {
  text: string;
  tone?: "neutral" | "good" | "warn" | "bad" | "blue";
}) {
  const style =
    tone === "good"
      ? { bg: "rgba(34,197,94,0.18)", bd: "rgba(34,197,94,0.35)" }
      : tone === "warn"
      ? { bg: "rgba(234,179,8,0.16)", bd: "rgba(234,179,8,0.30)" }
      : tone === "bad"
      ? { bg: "rgba(239,68,68,0.16)", bd: "rgba(239,68,68,0.28)" }
      : tone === "blue"
      ? { bg: "rgba(59,130,246,0.16)", bd: "rgba(59,130,246,0.30)" }
      : { bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.10)" };

  return (
    <View
      style={{
        paddingVertical: 7,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: style.bg,
        borderWidth: 1,
        borderColor: style.bd,
      }}
    >
      <Text style={{ color: "white", fontWeight: "900", fontSize: 12 }}>{text}</Text>
    </View>
  );
}

function SmallCard({ title, body }: { title: string; body: string }) {
  return (
    <View
      style={{
        flex: 1,
        padding: 12,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: "900", marginBottom: 6 }}>
        {title}
      </Text>
      <Text style={{ color: "rgba(255,255,255,0.60)", fontSize: 12, lineHeight: 16 }}>
        {body}
      </Text>
    </View>
  );
}

export default function CompassScreen() {
  const { width, height } = useWindowDimensions();
  const dialSize = Math.min(width - 32, height * 0.62, 420);
  const r = dialSize / 2;

  const [heading, setHeading] = useState(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [using, setUsing] = useState<"true" | "mag">("mag");
  const [perm, setPerm] = useState<"unknown" | "granted" | "denied">("unknown");
  const smoothRef = useRef(0);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;

      if (status !== "granted") {
        setPerm("denied");
        return;
      }
      setPerm("granted");

      sub = await Location.watchHeadingAsync((h) => {
        if (cancelled) return;

        const raw =
          typeof h.trueHeading === "number" && h.trueHeading >= 0 ? h.trueHeading : h.magHeading;

        if (typeof h.accuracy === "number") setAccuracy(h.accuracy);
        setUsing(typeof h.trueHeading === "number" && h.trueHeading >= 0 ? "true" : "mag");

        const prev = smoothRef.current;
        const d = Math.abs(deltaAngle(raw, prev));
        const alpha = d > 25 ? 0.24 : d > 10 ? 0.16 : 0.10;

        const next = smoothAngle(raw, prev, alpha);
        smoothRef.current = next;
        setHeading(next);
      });
    })();

    return () => {
      cancelled = true;
      if (sub) sub.remove();
    };
  }, []);

  const deg = Math.round(heading);
  const card = headingToCardinal(heading);
  const dialRotate = -heading;

  const accuracyTone = useMemo(() => {
    if (perm === "denied") return "bad" as const;
    if (accuracy == null || accuracy < 0) return "neutral" as const;
    if (accuracy <= 10) return "good" as const;
    if (accuracy <= 25) return "warn" as const;
    return "bad" as const;
  }, [accuracy, perm]);

  const accuracyText = useMemo(() => {
    if (perm === "denied") return "Accuracy: —";
    if (accuracy == null) return "Accuracy: —";
    if (accuracy < 0) return "Accuracy: unknown";
    if (accuracy <= 10) return "Accuracy: good";
    if (accuracy <= 25) return "Accuracy: ok";
    return "Accuracy: poor";
  }, [accuracy, perm]);

  // ✅ keep ONLY the permission message; remove the duplicate accuracy sentence
  const permissionLine = useMemo(() => {
    if (perm === "denied") return "Needs permission for device heading. We don’t track/store location.";
    return null;
  }, [perm]);

  const ticks = useMemo(() => {
    const arr: { a: number; len: number; w: number; op: number }[] = [];
    for (let a = 0; a < 360; a += 5) {
      const major = a % 30 === 0;
      const mid = a % 10 === 0;
      arr.push({
        a,
        len: major ? r * 0.10 : mid ? r * 0.065 : r * 0.045,
        w: major ? 3 : mid ? 2 : 1.2,
        op: major ? 0.9 : mid ? 0.65 : 0.38,
      });
    }
    return arr;
  }, [r]);

  const bezelOuter = r;
  const bezelInner = r * 0.90;
  const faceR = r * 0.86;
  const tickOuter = faceR * 0.98;

  const roseLong = faceR * 0.46;
  const roseMid = faceR * 0.30;
  const roseShort = faceR * 0.18;
  const roseBase = faceR * 0.08;

  const needleHalfW = r * 0.095;
  const northTipY = r * 0.18;
  const northTailY = r * 0.92;
  const southTipY = r * 1.82;
  const southTailY = r * 1.08;

  const cardR = faceR * 0.72;
  const north = polar(r, r, cardR, 0);
  const east = polar(r, r, cardR, 90);
  const south = polar(r, r, cardR, 180);
  const west = polar(r, r, cardR, 270);
  const cardSize = r * 0.24;
  const baselineFix = cardSize * 0.35;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ padding: 16, gap: 12, flex: 1 }}>
        {/* Top header */}
        <View
          style={{
            padding: 14,
            borderRadius: 14,
            backgroundColor: "rgba(255,255,255,0.06)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: "white", fontSize: 22, fontWeight: "900" }}>Compass</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pill text={using === "true" ? "True" : "Mag"} tone="blue" />
              <Pill text={accuracyText} tone={accuracyTone} />
            </View>
          </View>

          {/* single authoritative readout */}
          <Text style={{ color: "rgba(255,255,255,0.75)", marginTop: 10, fontSize: 18, fontWeight: "900" }}>
            {deg}° • {card}
          </Text>

          {!!permissionLine && (
            <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 6, fontSize: 12 }}>
              {permissionLine}
            </Text>
          )}
        </View>

        {/* Dial card */}
        <View
          style={{
            padding: 12,
            borderRadius: 14,
            backgroundColor: "rgba(255,255,255,0.06)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View style={{ width: dialSize, height: dialSize }}>
            <Svg width={dialSize} height={dialSize} viewBox={`0 0 ${dialSize} ${dialSize}`}>
              <Defs>
                <RadialGradient id="bezelChrome" cx="50%" cy="35%" r="70%">
                  <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.90} />
                  <Stop offset="20%" stopColor="#d9dce0" stopOpacity={0.95} />
                  <Stop offset="52%" stopColor="#9aa0a8" stopOpacity={0.95} />
                  <Stop offset="80%" stopColor="#5a616b" stopOpacity={0.98} />
                  <Stop offset="100%" stopColor="#2a2f37" stopOpacity={1} />
                </RadialGradient>

                <RadialGradient id="dialWhite" cx="50%" cy="35%" r="80%">
                  <Stop offset="0%" stopColor="#ffffff" />
                  <Stop offset="70%" stopColor="#f6f6f6" />
                  <Stop offset="100%" stopColor="#e9e9e9" />
                </RadialGradient>

                <LinearGradient id="glassSheen" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0%" stopColor="#fff" stopOpacity={0.28} />
                  <Stop offset="35%" stopColor="#fff" stopOpacity={0.10} />
                  <Stop offset="100%" stopColor="#fff" stopOpacity={0} />
                </LinearGradient>

                <LinearGradient id="needleRed" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0%" stopColor="#ff6b6b" />
                  <Stop offset="100%" stopColor="#b60000" />
                </LinearGradient>
                <LinearGradient id="needleBlue" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0%" stopColor="#2bc2ff" />
                  <Stop offset="100%" stopColor="#004db3" />
                </LinearGradient>
              </Defs>

              {/* bezel */}
              <Circle cx={r} cy={r} r={r} fill="url(#bezelChrome)" />
              <Circle cx={r} cy={r} r={r * 0.90} fill="transparent" stroke="#000" strokeOpacity={0.22} strokeWidth={2} />

              {/* face */}
              <Circle cx={r} cy={r} r={faceR} fill="url(#dialWhite)" />
              <Circle cx={r} cy={r} r={faceR} fill="transparent" stroke="#000" strokeOpacity={0.12} strokeWidth={2} />

              {/* rotating face */}
              <G transform={`rotate(${dialRotate} ${r} ${r})`}>
                {ticks.map((t, idx) => {
                  const p1 = polar(r, r, tickOuter, t.a);
                  const p2 = polar(r, r, tickOuter - t.len, t.a);
                  return (
                    <Line
                      key={idx}
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke="#111"
                      strokeOpacity={t.op}
                      strokeWidth={t.w}
                      strokeLinecap="round"
                    />
                  );
                })}

                <Circle cx={r} cy={r} r={faceR * 0.72} fill="transparent" stroke="#111" strokeOpacity={0.16} strokeWidth={2} />
                <Circle cx={r} cy={r} r={faceR * 0.56} fill="transparent" stroke="#111" strokeOpacity={0.10} strokeWidth={2} />

                <Rose cx={r} cy={r} longR={roseLong} midR={roseMid} shortR={roseShort} baseW={roseBase} />

                <SvgText x={north.x} y={north.y + baselineFix} fill="#111" fontSize={cardSize} fontWeight="800" textAnchor="middle">N</SvgText>
                <SvgText x={east.x} y={east.y + baselineFix} fill="#111" fontSize={cardSize} fontWeight="800" textAnchor="middle">E</SvgText>
                <SvgText x={south.x} y={south.y + baselineFix} fill="#111" fontSize={cardSize} fontWeight="800" textAnchor="middle">S</SvgText>
                <SvgText x={west.x} y={west.y + baselineFix} fill="#111" fontSize={cardSize} fontWeight="800" textAnchor="middle">W</SvgText>

                <SvgText x={r * 0.48} y={r * 0.54} fill="#111" opacity={0.45} fontSize={r * 0.12} fontWeight="700" textAnchor="middle" transform={`rotate(-45 ${r * 0.48} ${r * 0.54})`}>NW</SvgText>
                <SvgText x={r * 1.52} y={r * 0.54} fill="#111" opacity={0.45} fontSize={r * 0.12} fontWeight="700" textAnchor="middle" transform={`rotate(45 ${r * 1.52} ${r * 0.54})`}>NE</SvgText>
                <SvgText x={r * 1.52} y={r * 1.50} fill="#111" opacity={0.45} fontSize={r * 0.12} fontWeight="700" textAnchor="middle" transform={`rotate(-45 ${r * 1.52} ${r * 1.50})`}>SE</SvgText>
                <SvgText x={r * 0.48} y={r * 1.50} fill="#111" opacity={0.45} fontSize={r * 0.12} fontWeight="700" textAnchor="middle" transform={`rotate(45 ${r * 0.48} ${r * 1.50})`}>SW</SvgText>
              </G>

              {/* needle shadow */}
              <G opacity={0.20} transform={`translate(${r * 0.02} ${r * 0.03})`}>
                <Path d={needleArrowPath(r, northTipY, northTailY, needleHalfW)} fill="#000" />
                <Path d={needleArrowPath(r, southTipY, southTailY, needleHalfW)} fill="#000" />
              </G>

              {/* needle */}
              <Path d={needleArrowPath(r, northTipY, northTailY, needleHalfW)} fill="url(#needleRed)" />
              <Path d={needleArrowPath(r, southTipY, southTailY, needleHalfW)} fill="url(#needleBlue)" />

              {/* hub */}
              <Circle cx={r} cy={r} r={r * 0.125} fill="#d8d8d8" />
              <Circle cx={r} cy={r} r={r * 0.095} fill="#a0a0a0" />
              <Circle cx={r} cy={r} r={r * 0.060} fill="#f2f2f2" opacity={0.95} />

              {/* glass highlight */}
              <Circle cx={r * 0.62} cy={r * 0.42} r={r * 0.78} fill="url(#glassSheen)" opacity={0.55} />
            </Svg>
          </View>
        </View>

       <View style={{ flexDirection: "row", gap: 10 }}>
  <SmallCard
    title="Sensor Status"
    body={
      perm === "denied"
        ? "Compass access is off. Enable Location permission to use the compass."
        : "Compass sensor active. Heading is read on your device only."
    }
  />
  <SmallCard
    title="Tip"
    body={
      Platform.OS === "android"
        ? "If it drifts, step away from metal/cars and do a slow figure-8."
        : "If it feels off, step away from metal and do a slow figure-8."
    }
  />
</View>

      </View>
    </SafeAreaView>
  );
}
