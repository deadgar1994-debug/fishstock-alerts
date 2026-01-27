import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, SafeAreaView, Text, View } from "react-native";

const BG = "#0b1220";

function ToolCard({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: 14,
        borderRadius: 14,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: "rgba(255,255,255,0.08)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={22} color="white" />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: "white", fontSize: 18, fontWeight: "900" }}>
          {title}
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
          {subtitle}
        </Text>
        <Text
          style={{
            color: "rgba(255,255,255,0.45)",
            marginTop: 6,
            fontSize: 12,
          }}
        >
          Tap to open →
        </Text>
      </View>
    </Pressable>
  );
}

export default function ToolScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ padding: 16, gap: 12 }}>
        <ToolCard
          title="Compass"
          subtitle="Full compass dial + needle"
          icon="compass"
          onPress={() => router.push("/tools/compass")}
        />

        <ToolCard
          title="Ruler"
          subtitle="Measure tools"
          icon="resize-outline"
          onPress={() => router.push("/tools/ruler-live")}
        />

        <ToolCard
          title="Gear"
          subtitle="Track lures, rods, reels, line"
          icon="fish-outline"
          onPress={() => router.push("/tools/gear")}
        />

        <ToolCard
          title="Trip History"
          subtitle="Browse logs by water or species"
          icon="time-outline"
          onPress={() => router.push("/tools/trip-history")}
        />

        {/* 🧠 NEW TOOL */}
        <ToolCard
           title="Catch Insights"
          subtitle="Insights from your fishing logs"
          icon="analytics-outline"
          onPress={() => router.push("/tools/smart-log-analyzer")}
        />
      </View>
    </SafeAreaView>
  );
}
