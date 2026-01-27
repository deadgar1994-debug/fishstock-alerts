// app/_layout.tsx
import { useColorScheme } from "@/hooks/use-color-scheme";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import * as NavigationBar from "expo-navigation-bar";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { Platform, View } from "react-native";
import "react-native-reanimated";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const BG = "#0b1220";

export const unstable_settings = { anchor: "(tabs)" };

function makeTheme(base: typeof DarkTheme) {
  return {
    ...base,
    colors: {
      ...base.colors,
      background: BG,
      card: BG,
      border: "rgba(255,255,255,0.10)",
    },
  };
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";

  useEffect(() => {
    // Paint the native window behind React (prevents white/blue flashes)
    SystemUI.setBackgroundColorAsync(BG).catch(() => {});

    // Android-only: force system nav bar to match the app
    if (Platform.OS === "android") {
      NavigationBar.setBackgroundColorAsync(BG).catch(() => {});
      NavigationBar.setButtonStyleAsync("light").catch(() => {});
    }
  }, []);

  return (
    <SafeAreaProvider>
      {/* These paint the NOTCH + HOME-INDICATOR areas dark consistently */}
      <SafeAreaView edges={["top"]} style={{ backgroundColor: BG }} />
      <SafeAreaView edges={["bottom"]} style={{ backgroundColor: BG }} />

      {/* Main app */}
      <View style={{ flex: 1, backgroundColor: BG }}>
        <ThemeProvider value={makeTheme(isDark ? DarkTheme : DefaultTheme)}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: BG },
            }}
          >
            <Stack.Screen name="(tabs)" />
          </Stack>

          {/* Keep it stable: light icons, transparent so BG shows */}
          <StatusBar style="light" translucent backgroundColor="transparent" />
        </ThemeProvider>
      </View>
    </SafeAreaProvider>
  );
}
