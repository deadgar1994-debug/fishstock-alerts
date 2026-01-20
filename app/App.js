import React, { useEffect, useState } from "react";
import { Alert, Button, SafeAreaView, Text, TextInput, View } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

const BACKEND_URL = "http://192.168.86.36:8787";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerForPushToken() {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;

  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") throw new Error("Notification permission not granted");

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    undefined;

  const tokenRes = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );

  return tokenRes.data;
}

export default function App() {
  const [token, setToken] = useState("");
  const [county, setCounty] = useState("Wasatch");
  const [species, setSpecies] = useState("Rainbow");
  const [statusText, setStatusText] = useState("");

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      console.log("notification received", n);
    });
    return () => sub.remove();
  }, []);

  const testBackend = async () => {
    try {
      const r = await fetch(`${BACKEND_URL}/health`);
      const j = await r.json();
      Alert.alert("Backend reachable ✅", JSON.stringify(j));
    } catch (e) {
      Alert.alert("Backend NOT reachable ❌", e.message);
    }
  };

  const subscribe = async () => {
    try {
      setStatusText("Getting push token...");
      const t = await registerForPushToken();
      setToken(t);

      setStatusText("Sending subscription to backend...");
      const resp = await fetch(`${BACKEND_URL}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expo_push_token: t,
          counties: county ? [county] : [],
          species: species ? [species] : [],
          waters: [],
        }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!json.ok) throw new Error(json.error || "Subscribe failed");

      setStatusText("Subscribed ✅ Now run the poller on your PC.");
      Alert.alert("Subscribed!", "You’ll get alerts when a new stocking matches your filters.");
    } catch (e) {
      setStatusText(`Error: ${e.message}`);
      Alert.alert("Error", e.message);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Fish Stock Alerts (MVP)</Text>

      <Button title="Test backend connection" onPress={testBackend} />

      <View style={{ marginTop: 8 }}>
        <Text style={{ fontWeight: "600" }}>County</Text>
        <TextInput
          value={county}
          onChangeText={setCounty}
          placeholder="Wasatch"
          autoCapitalize="words"
          style={{ borderWidth: 1, borderColor: "#ccc", padding: 10, borderRadius: 8, marginTop: 6 }}
        />
      </View>

      <View>
        <Text style={{ fontWeight: "600" }}>Species</Text>
        <TextInput
          value={species}
          onChangeText={setSpecies}
          placeholder="Rainbow"
          autoCapitalize="words"
          style={{ borderWidth: 1, borderColor: "#ccc", padding: 10, borderRadius: 8, marginTop: 6 }}
        />
      </View>

      <Button title="Enable notifications + Subscribe" onPress={subscribe} />

      {!!token && <Text style={{ fontSize: 12 }}>Token saved ✅</Text>}
      {!!statusText && <Text>{statusText}</Text>}
    </SafeAreaView>
  );
}
