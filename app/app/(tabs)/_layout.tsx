import { Tabs } from "expo-router";
import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

const BG = "#0b1220";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,

        tabBarBackground: () => (
          <View style={{ flex: 1, backgroundColor: BG }} />
        ),

        // ✅ Thin, native-height tab bar
        tabBarStyle: {
          backgroundColor: BG,
          borderTopColor: "rgba(255,255,255,0.10)",
          height: 56,              // ← native iOS height
          paddingBottom: 6,        // ← small breathing room ONLY
        },

        // ✅ Gentle downward nudge (not exaggerated)
        tabBarIconStyle: {
          transform: [{ translateY: 2 }],
        },
        tabBarLabelStyle: {
          transform: [{ translateY: 2 }],
        },
      }}
    >
      <Tabs.Screen
        name="restocks"
        options={{
          title: "Restocks",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="fish.fill" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="logs"
        options={{
          title: "Logs",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="list.bullet" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="tools"
        options={{
          title: "Tools",
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={28}
              name="wrench.and.screwdriver.fill"
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
