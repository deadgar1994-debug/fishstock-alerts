import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMemo, useState } from "react";
import {
  SafeAreaView,
  Text,
  View,
  Pressable,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";

const BG = "#0b1220";
const cardStyle = {
  padding: 12,
  borderRadius: 12,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
} as const;

const LS_KEY = "tools.ruler.px_per_mm.v2";
const CARD_LONG_MM = 85.6;
const CARD_SHORT_MM = 53.98;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function Btn({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderColor: "rgba(255,255,255,0.10)",
        alignItems: "center",
      }}
    >
      <Text style={{ color: "white", fontWeight: "900" }}>{title}</Text>
    </Pressable>
  );
}

export default function RulerCalibrateScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();

  const [calLongPx, setCalLongPx] = useState<number>(() => {
    return Math.min(Math.max(260, height * 0.28), 380);
  });

  const minPx = 200;
  const maxPx = Math.max(280, Math.min(560, height - 240));

  const candidatePxPerMm = useMemo(() => calLongPx / CARD_LONG_MM, [calLongPx]);

  async function save() {
    const val = candidatePxPerMm;
    if (!Number.isFinite(val) || val <= 0) return;
    await AsyncStorage.setItem(LS_KEY, String(val));
    router.back();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      {/* ✅ Make calibration screen scrollable */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={cardStyle}>
          <Text style={{ color: "white", fontSize: 22, fontWeight: "900" }}>
            Calibrate Ruler
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
            Place a credit card vertically and match the box height.
          </Text>
        </View>

        <View style={cardStyle}>
          <Text style={{ color: "rgba(255,255,255,0.7)" }}>
            Candidate scale:{" "}
            <Text style={{ color: "white", fontWeight: "900" }}>
              {candidatePxPerMm.toFixed(3)} px/mm
            </Text>
          </Text>

          <View style={{ alignItems: "center", marginTop: 12 }}>
            <View
              style={{
                height: calLongPx,
                width: (calLongPx * CARD_SHORT_MM) / CARD_LONG_MM,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: "rgba(59,130,246,0.65)",
                backgroundColor: "rgba(59,130,246,0.10)",
              }}
            />
            <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 8, fontSize: 12 }}>
              Target: 85.60 mm tall (standard credit card)
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Btn title="-10" onPress={() => setCalLongPx((v) => clamp(v - 10, minPx, maxPx))} />
            <Btn title="-1" onPress={() => setCalLongPx((v) => clamp(v - 1, minPx, maxPx))} />
            <Btn title="+1" onPress={() => setCalLongPx((v) => clamp(v + 1, minPx, maxPx))} />
            <Btn title="+10" onPress={() => setCalLongPx((v) => clamp(v + 10, minPx, maxPx))} />
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable
              onPress={save}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                borderWidth: 1,
                backgroundColor: "rgba(34,197,94,0.25)",
                borderColor: "rgba(34,197,94,0.45)",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>Save</Text>
            </Pressable>

            <Pressable
              onPress={() => router.back()}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                borderWidth: 1,
                backgroundColor: "rgba(255,255,255,0.06)",
                borderColor: "rgba(255,255,255,0.10)",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>Cancel</Text>
            </Pressable>
          </View>

          <Text style={{ color: "rgba(255,255,255,0.50)", marginTop: 10, fontSize: 12 }}>
            Tip: Use +10/-10 to get close, then +1/-1 to nail it.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
