import AsyncStorage from "@react-native-async-storage/async-storage";
import { ResizeMode, Video } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  View,
} from "react-native";

type FishLogEntry = {
  id: string;
  createdAt: string; // ISO date
  water: string;
  species: string;
  lengthIn?: string;
  notes?: string;
  weather?: string; // ✅ new
  photoUri?: string;
  videoUri?: string;
};

const STORAGE_KEY = "fish_log_v1";

function nowId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const BG = "#0b1220";
const cardStyle = {
  padding: 12,
  borderRadius: 12,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
} as const;

const INPUT_STYLE = {
  color: "white",
  padding: 12,
  borderRadius: 10,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
} as const;

const GREEN_BG = "rgba(34,197,94,0.25)";
const GREEN_BORDER = "rgba(34,197,94,0.45)";

// ✅ quick weather chips
const WEATHER_OPTIONS = ["Sunny", "Cloudy", "Windy", "Rain", "Snow", "Fog"] as const;

export default function LogScreen() {
  const listRef = useRef<FlatList<FishLogEntry>>(null);
  const waterRef = useRef<TextInput>(null);

  const [weather, setWeather] = useState(""); // ✅ new (moved to top)
  const [water, setWater] = useState("");
  const [species, setSpecies] = useState("");
  const [lengthIn, setLengthIn] = useState("");
  const [notes, setNotes] = useState("");

  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [videoUri, setVideoUri] = useState<string | undefined>(undefined);

  const [items, setItems] = useState<FishLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Collapsible form
  const [showForm, setShowForm] = useState(false);

  // Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const isEditing = editingId !== null;

  // Viewer modal
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerKind, setViewerKind] = useState<"photo" | "video">("photo");
  const [viewerUri, setViewerUri] = useState<string | undefined>(undefined);

  const total = useMemo(() => items.length, [items]);

  function openViewer(kind: "photo" | "video", uri?: string) {
    if (!uri) return;
    Keyboard.dismiss();
    setViewerKind(kind);
    setViewerUri(uri);
    setViewerOpen(true);
  }

  async function load() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setItems([]);
        return;
      }
      const parsed = JSON.parse(raw) as FishLogEntry[];
      setItems(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      console.warn("load error", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function persist(next: FishLogEntry[]) {
    setItems(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.warn("persist error", e);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setEditingId(null);
    setWeather(""); // ✅ new
    setWater("");
    setSpecies("");
    setLengthIn("");
    setNotes("");
    setPhotoUri(undefined);
    setVideoUri(undefined);
    Keyboard.dismiss();
  }

  function openForm() {
    setShowForm(true);
    setTimeout(() => waterRef.current?.focus(), 50);
  }

  function startEdit(entry: FishLogEntry) {
    Keyboard.dismiss();
    setEditingId(entry.id);
    setWeather(entry.weather ?? ""); // ✅ new
    setWater(entry.water);
    setSpecies(entry.species);
    setLengthIn(entry.lengthIn ?? "");
    setNotes(entry.notes ?? "");
    setPhotoUri(entry.photoUri);
    setVideoUri(entry.videoUri);
    openForm();
  }

  async function pickPhoto() {
    Keyboard.dismiss();
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to attach a photo.");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });

    if (res.canceled) return;
    const uri = res.assets?.[0]?.uri;
    if (!uri) return;

    setPhotoUri(uri);
  }

  async function pickVideo() {
    Keyboard.dismiss();
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to attach a video clip.");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 1,
    });

    if (res.canceled) return;
    const uri = res.assets?.[0]?.uri;
    if (!uri) return;

    setVideoUri(uri);
  }

  async function addEntry() {
    Keyboard.dismiss();

    if (!water.trim() || !species.trim()) {
      Alert.alert("Missing info", "Please enter Water and Species.");
      return;
    }

    if (isEditing) {
      const next = items.map((it) =>
        it.id === editingId
          ? {
              ...it,
              weather: weather.trim() ? weather.trim() : undefined, // ✅ new
              water: water.trim(),
              species: species.trim(),
              lengthIn: lengthIn.trim() ? lengthIn.trim() : undefined,
              notes: notes.trim() ? notes.trim() : undefined,
              photoUri,
              videoUri,
            }
          : it
      );
      await persist(next);
    } else {
      const entry: FishLogEntry = {
        id: nowId(),
        createdAt: new Date().toISOString(),
        weather: weather.trim() ? weather.trim() : undefined, // ✅ new
        water: water.trim(),
        species: species.trim(),
        lengthIn: lengthIn.trim() ? lengthIn.trim() : undefined,
        notes: notes.trim() ? notes.trim() : undefined,
        photoUri,
        videoUri,
      };

      await persist([entry, ...items]);
    }

    resetForm();
    setShowForm(false);

    requestAnimationFrame(() =>
      listRef.current?.scrollToOffset({ offset: 0, animated: true })
    );
  }

  async function removeEntry(id: string) {
    Keyboard.dismiss();
    Alert.alert("Delete entry?", "This can’t be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const next = items.filter((x) => x.id !== id);
          await persist(next);
          if (editingId === id) resetForm();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            {/* Header */}
            <View style={{ gap: 4 }}>
              <Text style={{ color: "white", fontSize: 22, fontWeight: "900" }}>
                My Logs
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.65)" }}>
                Track catches, notes, and media.
              </Text>
            </View>

            {/* Toggle Add Log */}
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setShowForm((v) => !v);
                if (!showForm) openForm();
                if (showForm) resetForm(); // closing clears edit mode
              }}
              style={{
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.18)",
                paddingVertical: 10,
                borderRadius: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>
                {showForm ? (isEditing ? "Hide Edit" : "Hide Add Log") : "+ Add Log"}
              </Text>
            </Pressable>

            {/* Collapsible Form */}
            {showForm && (
              <View style={{ gap: 10 }}>
                {/* ✅ Weather selections at the top */}
                <View style={{ gap: 8 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "800" }}>
                      Weather (optional)
                    </Text>

                    {weather ? (
                      <Pressable
                        onPress={() => setWeather("")}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          backgroundColor: "rgba(255,255,255,0.06)",
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.12)",
                        }}
                      >
                        <Text
                          style={{
                            color: "rgba(255,255,255,0.85)",
                            fontWeight: "800",
                            fontSize: 12,
                          }}
                        >
                          Clear
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {WEATHER_OPTIONS.map((opt) => {
                      const active = weather.trim().toLowerCase() === opt.toLowerCase();
                      return (
                        <Pressable
                          key={opt}
                          onPress={() => setWeather(active ? "" : opt)}
                          style={{
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 999,
                            backgroundColor: active
                              ? "rgba(59,130,246,0.25)"
                              : "rgba(255,255,255,0.06)",
                            borderWidth: 1,
                            borderColor: active
                              ? "rgba(59,130,246,0.45)"
                              : "rgba(255,255,255,0.10)",
                          }}
                        >
                          <Text style={{ color: "white", fontWeight: "800" }}>{opt}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <TextInput
                  ref={waterRef}
                  value={water}
                  onChangeText={setWater}
                  placeholder="Water (lake/river/pond)"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  style={INPUT_STYLE}
                  returnKeyType="next"
                  blurOnSubmit={false}
                />

                <TextInput
                  value={species}
                  onChangeText={setSpecies}
                  placeholder="Species (trout, bass, etc.)"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  style={INPUT_STYLE}
                  returnKeyType="next"
                  blurOnSubmit={false}
                />

                <TextInput
                  value={lengthIn}
                  onChangeText={setLengthIn}
                  placeholder="Length (inches) — optional"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  keyboardType="numeric"
                  style={INPUT_STYLE}
                  returnKeyType="done"
                />

                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Notes — optional"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  multiline
                  style={{
                    ...INPUT_STYLE,
                    minHeight: 80,
                    textAlignVertical: "top",
                  }}
                />

                {/* Media row */}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={pickPhoto}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 10,
                      backgroundColor: "rgba(59,130,246,0.25)",
                      borderWidth: 1,
                      borderColor: "rgba(59,130,246,0.4)",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "800" }}>
                      {photoUri ? "Photo ✓" : "Add Photo"}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={pickVideo}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 10,
                      backgroundColor: "rgba(168,85,247,0.25)",
                      borderWidth: 1,
                      borderColor: "rgba(168,85,247,0.4)",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "800" }}>
                      {videoUri ? "Clip ✓" : "Add Clip"}
                    </Text>
                  </Pressable>
                </View>

                {/* Previews */}
                {photoUri ? (
                  <Pressable onPress={() => openViewer("photo", photoUri)}>
                    <Image
                      source={{ uri: photoUri }}
                      style={{ width: "100%", height: 160, borderRadius: 12, marginTop: 6 }}
                    />
                    <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 6 }}>
                      Tap photo to view
                    </Text>
                  </Pressable>
                ) : null}

                {videoUri ? (
                  <Pressable
                    onPress={() => openViewer("video", videoUri)}
                    style={{
                      ...cardStyle,
                      marginTop: 6,
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "800" }}>🎥 Video attached</Text>
                    <Text style={{ color: "rgba(255,255,255,0.7)" }}>Tap to play</Text>
                  </Pressable>
                ) : null}

                {/* Save + Close row */}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={addEntry}
                    style={{
                      flex: 1,
                      padding: 14,
                      borderRadius: 12,
                      backgroundColor: GREEN_BG,
                      borderWidth: 1,
                      borderColor: GREEN_BORDER,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "900" }}>
                      {isEditing ? "Save Changes" : "Save Entry"}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      resetForm();
                      setShowForm(false);
                    }}
                    style={{
                      width: 90,
                      padding: 14,
                      borderRadius: 12,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "800" }}>Close</Text>
                    </Pressable>
                </View>
              </View>
            )}

            {/* ✅ Section label row: Saved logs + count (plain text) */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginTop: 4,
              }}
            >
              <Text style={{ color: "rgba(255,255,255,0.45)", fontWeight: "800" }}>
                Saved logs
              </Text>

              <Text style={{ color: "rgba(255,255,255,0.55)", fontWeight: "800", fontSize: 12 }}>
                {total} entries
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <Text style={{ color: "rgba(255,255,255,0.6)" }}>Loading…</Text>
          ) : (
            <Text style={{ color: "rgba(255,255,255,0.6)" }}>
              No logs yet. Tap “+ Add Log” to create your first entry.
            </Text>
          )
        }
        ListFooterComponent={
          <Text
            style={{
              color: "rgba(255,255,255,0.35)",
              marginTop: 10,
              fontSize: 12,
              textAlign: "center",
            }}
          >
            Tip: Tap an item to edit • Long-press to delete
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => startEdit(item)}
            onLongPress={() => removeEntry(item.id)}
            style={cardStyle}
          >
            <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>
              {item.species} • {item.water}
            </Text>

            <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
              {new Date(item.createdAt).toLocaleString()}
              {item.lengthIn ? ` • ${item.lengthIn} in` : ""}
            </Text>

            {/* ✅ Weather display */}
            {item.weather ? (
              <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
                ☁️ {item.weather}
              </Text>
            ) : null}

            {item.notes ? (
              <Text style={{ color: "rgba(255,255,255,0.75)", marginTop: 6 }}>
                {item.notes}
              </Text>
            ) : null}

            {item.photoUri || item.videoUri ? (
              <View style={{ flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                {item.photoUri ? (
                  <Pressable
                    onPress={() => openViewer("photo", item.photoUri)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      borderRadius: 10,
                      backgroundColor: "rgba(59,130,246,0.22)",
                      borderWidth: 1,
                      borderColor: "rgba(59,130,246,0.35)",
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "800" }}>View Photo</Text>
                  </Pressable>
                ) : null}

                {item.videoUri ? (
                  <Pressable
                    onPress={() => openViewer("video", item.videoUri)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      borderRadius: 10,
                      backgroundColor: "rgba(168,85,247,0.22)",
                      borderWidth: 1,
                      borderColor: "rgba(168,85,247,0.35)",
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "800" }}>Play Clip</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </Pressable>
        )}
      />

      {/* Full-screen Viewer */}
      <Modal
        visible={viewerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.85)",
            padding: 16,
            justifyContent: "center",
          }}
          onPress={() => setViewerOpen(false)}
        >
          <Pressable onPress={() => {}} style={{ width: "100%" }}>
            <View
              style={{
                borderRadius: 14,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.06)",
              }}
            >
              {viewerKind === "photo" ? (
                <Image
                  source={{ uri: viewerUri }}
                  style={{ width: "100%", height: 420 }}
                  resizeMode="contain"
                />
              ) : (
                <Video
                  source={{ uri: viewerUri ?? "" }}
                  style={{ width: "100%", height: 420 }}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                />
              )}
            </View>

            <Pressable
              onPress={() => setViewerOpen(false)}
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                backgroundColor: "rgba(255,255,255,0.08)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
