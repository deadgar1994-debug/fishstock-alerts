import { Stack } from "expo-router";

export default function ToolsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: "#0b1220" },
        headerTintColor: "white",
        contentStyle: { backgroundColor: "#0b1220" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Tools" }} />
      <Stack.Screen name="compass" options={{ title: "Compass" }} />
      <Stack.Screen name="ruler" options={{ title: "Ruler" }} />
      <Stack.Screen name="ruler-calibrate" options={{ title: "Calibrate Ruler" }} />
      <Stack.Screen name="gear" options={{ title: "Gear" }} />
      <Stack.Screen name="trip-history" options={{ title: "Trip History" }} />

      {/* ✅ NEW TOOL */}
      <Stack.Screen
        name="smart-log-analyzer"
        options={{ title: "Catch Insights" }}
      />
    </Stack>
  );
}
