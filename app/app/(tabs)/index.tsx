import { View, Text, TextInput, Button, Alert, SafeAreaView } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useEffect, useState } from "react";

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
    Constants?.easConfig?.projectId;

  const tokenRes = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );

  return tokenRes.data;
}

export default function HomeScreen() {
  const [county, setCounty] = useState("Wasatch");
  const [species, setSpecies] = useState("Rainbow");
  const [statusText, setStatusText] = useState("");

  const testBackend = async () => {
    try {
      const r = await fetch(`${BACKEND_URL}/health`);
      const j = await r.json();
      Alert.alert("Backend reachable ✅", JSON.stringify(j));
    } catch (e: any) {
      Alert.alert("Backend NOT reachable ❌", e.message);
    }
  };

  const subscribe = async () => {
    try {
      setStatusText("Getting push token...");
      const token = await registerForPushToken();

      setStatusText("Saving subscription...");
      const resp = await fetch(`${BACKEND_URL}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expo_push_token: token,
          counties: county ? [county] : [],
          species: species ? [species] : [],
          waters: [],
        }),
      });

      const json = await resp.json();
      if (!json.ok) throw new Error(json.error || "Subscribe failed");

      Alert.alert("Subscribed 🎣", "You’ll get alerts for new fish stockings.");
      setStatusText("Subscribed ✅");
    } catch (e: any) {
      Alert.alert("Error", e.message);
      setStatusText(e.message);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Fish Stock Alerts</Text>

      <Button title="Test backend connection" onPress={testBackend} />

      <View>
        <Text>County</Text>
        <TextInput
          value={county}
          onChangeText={setCounty}
          placeholder="Wasatch"
          style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
        />
      </View>

      <View>
        <Text>Species</Text>
        <TextInput
          value={species}
          onChangeText={setSpecies}
          placeholder="Rainbow"
          style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
        />
      </View>

      <Button title="Enable notifications + Subscribe" onPress={subscribe} />

      {!!statusText && <Text>{statusText}</Text>}
    </SafeAreaView>
  );
}
