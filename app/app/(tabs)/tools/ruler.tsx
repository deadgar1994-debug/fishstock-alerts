// app/tools/ruler.tsx
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, SafeAreaView, Text, View } from "react-native";

const BG = "#0b1220";

const cardStyle = {
  padding: 14,
  borderRadius: 16,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.10)",
} as const;

export default function RulerChooserRoute() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ flex: 1, padding: 16, gap: 12 }}>
        <View style={{ gap: 6 }}>
          <Text style={{ color: "white", fontSize: 22, fontWeight: "900" }}>
            Ruler
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "700" }}>
            Choose Live Ruler or Photo Measure
          </Text>
        </View>

        <Pressable
          onPress={() => router.push("/tools/ruler-live")}
          style={({ pressed }) => [
            cardStyle,
            { opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={{ color: "white", fontSize: 18, fontWeight: "900" }}>
            Live Ruler
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
            Use your calibrated on-screen ruler
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/tools/ruler-photo")}
          style={({ pressed }) => [
            cardStyle,
            { opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={{ color: "white", fontSize: 18, fontWeight: "900" }}>
            Photo Measure
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
            Pick a photo, measure, then save to a log
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
