import { Stack } from "expo-router";

export default function LogsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitleAlign: "center",
        headerStyle: { backgroundColor: "#0b1220" },
        headerTintColor: "#fff",
        headerShadowVisible: true,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Logs" }} />
    </Stack>
  );
}
