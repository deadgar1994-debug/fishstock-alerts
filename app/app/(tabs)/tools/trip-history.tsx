import AsyncStorage from "@react-native-async-storage/async-storage";
import { ResizeMode, Video } from "expo-av";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    FlatList,
    Image,
    Keyboard,
    Modal,
    Pressable,
    SafeAreaView,
    Text,
    View,
} from "react-native";

type FishLogEntry = {
  id: string;
  createdAt: string; // ISO date
  water: string;
  species: string;
  lengthIn?: string;
  notes?: string;
  photoUri?: string;
  videoUri?: string;
};

const STORAGE_KEY = "fish_log_v1";

const BG = "#0b1220";
const cardStyle = {
  padding: 12,
  borderRadius: 12,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
} as const;

const pill = (active: boolean) =>
  ({
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: active ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: active ? "rgba(34,197,94,0.45)" : "rgba(255,255,255,0.12)",
    alignItems: "center",
    flex: 1,
  } as const);

type Mode = "water" | "species";

function formatShortDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function TripHistoryScreen() {
  const [items, setItems] = useState<FishLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<Mode>("water");
  const [selected, setSelected] = useState<string | null>(null);

  // Viewer modal
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerKind, setViewerKind] = useState<"photo" | "video">("photo");
  const [viewerUri, setViewerUri] = useState<string | undefined>(undefined);

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
      const parsed = raw ? (JSON.parse(raw) as FishLogEntry[]) : [];
      setItems(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      console.warn("TripHistory load error", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Build list of options
  const options = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      const v = mode === "water" ? it.water : it.species;
      if (v?.trim()) set.add(v.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items, mode]);

  const filtered = useMemo(() => {
    if (!selected) return [];
    const want = selected.toLowerCase();
    return items.filter((it) => {
      const v = (mode === "water" ? it.water : it.species) ?? "";
      return v.trim().toLowerCase() === want;
    });
  }, [items, mode, selected]);

  // --- Premium-feel summary strip (simple counts) ---
  const summary = useMemo(() => {
    if (!selected) return null;
    const trips = filtered.length;
    const photos = filtered.reduce((acc, x) => acc + (x.photoUri ? 1 : 0), 0);
    const clips = filtered.reduce((acc, x) => acc + (x.videoUri ? 1 : 0), 0);

    // "Last" should be most recent date
    const mostRecent = [...filtered].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];

    const last = mostRecent?.createdAt ? formatShortDate(mostRecent.createdAt) : "—";
    return { trips, photos, clips, last };
  }, [filtered, selected]);

  const headerLabel = mode === "water" ? "Pick a water" : "Pick a species";
  const title = selected ? `${selected}` : headerLabel;

  // ==============================
  // Timeline Replay Mode (oldest → newest)
  // ==============================
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);

  // EXACT 10s per slide. Automatic transition. Smooth fade.
  const SLIDE_MS = 10_000;
  const FADE_OUT_MS = 450;
  const FADE_IN_MS = 650;

  const fade = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<Video | null>(null);

  type ReplaySlide = {
    key: string;
    kind: "photo" | "video";
    uri: string;
    entry: FishLogEntry;
  };

  // Slides: photo then video for each entry, skip entries with no media
  const replaySlides = useMemo<ReplaySlide[]>(() => {
    if (!selected) return [];
    const ordered = [...filtered].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const slides: ReplaySlide[] = [];
    for (const entry of ordered) {
      if (entry.photoUri) {
        slides.push({ key: `${entry.id}_photo`, kind: "photo", uri: entry.photoUri, entry });
      }
      if (entry.videoUri) {
        slides.push({ key: `${entry.id}_video`, kind: "video", uri: entry.videoUri, entry });
      }
    }
    return slides;
  }, [filtered, selected]);

  const replaySlide = replaySlides[replayIndex];

  function hardStopTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  const runFadeToIndex = (nextIndex: number) => {
    Animated.timing(fade, {
      toValue: 0,
      duration: FADE_OUT_MS,
      useNativeDriver: true,
    }).start(async ({ finished }) => {
      if (!finished) return;

      // stop current video instantly during transition
      try {
        await videoRef.current?.stopAsync();
      } catch {}

      setReplayIndex(nextIndex);

      Animated.timing(fade, {
        toValue: 1,
        duration: FADE_IN_MS,
        useNativeDriver: true,
      }).start();
    });
  };

  const goNext = () => {
    if (replayIndex >= replaySlides.length - 1) {
      setReplayPlaying(false);
      return;
    }
    runFadeToIndex(replayIndex + 1);
  };

  const goPrev = () => {
    if (replayIndex <= 0) return;
    runFadeToIndex(replayIndex - 1);
  };

  function openReplay() {
    if (!replaySlides.length) return;
    Keyboard.dismiss();
    setReplayIndex(0);
    setReplayOpen(true);
    setReplayPlaying(true); // AUTO start
  }

  async function closeReplay() {
    setReplayPlaying(false);
    setReplayOpen(false);
    hardStopTimer();
    try {
      await videoRef.current?.stopAsync();
    } catch {}
  }

  // When slide changes, autoplay video if needed
  useEffect(() => {
    if (!replayOpen) return;

    (async () => {
      try {
        if (replaySlide?.kind === "video") {
          await videoRef.current?.setPositionAsync(0);
          if (replayPlaying) await videoRef.current?.playAsync();
          else await videoRef.current?.pauseAsync();
        } else {
          await videoRef.current?.stopAsync();
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayIndex, replayOpen]);

  // Keep video playing/paused in sync with replayPlaying
  useEffect(() => {
    if (!replayOpen) return;
    (async () => {
      try {
        if (replaySlide?.kind === "video") {
          if (replayPlaying) await videoRef.current?.playAsync();
          else await videoRef.current?.pauseAsync();
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayPlaying]);

  // ✅ Auto-advance every slide automatically (no tapping)
  // ✅ LAST SLIDE: still stops at exactly 10s (or earlier if short video ends)
  useEffect(() => {
    hardStopTimer();
    if (!replayOpen || !replayPlaying) return;
    if (!replaySlides.length) return;

    const isLast = replayIndex >= replaySlides.length - 1;

    // ✅ If last slide, still stop after 10s
    if (isLast) {
      timerRef.current = setTimeout(async () => {
        try {
          if (replaySlide?.kind === "video") {
            await videoRef.current?.pauseAsync();
          }
        } catch {}
        setReplayPlaying(false);
      }, SLIDE_MS);

      return () => hardStopTimer();
    }

    // normal case: schedule next slide (fade-out then next)
    timerRef.current = setTimeout(() => {
      goNext();
    }, Math.max(0, SLIDE_MS - FADE_OUT_MS));

    return () => hardStopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayOpen, replayPlaying, replayIndex, replaySlides.length, replaySlide?.kind]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <FlatList
        data={selected ? filtered : options}
        keyExtractor={(x) => (typeof x === "string" ? x : x.id)}
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
                My Trips
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.65)" }}>
                Filter your logs by water or species
              </Text>
            </View>

            {/* Mode toggle */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => {
                  setMode("water");
                  setSelected(null);
                }}
                style={pill(mode === "water")}
              >
                <Text style={{ color: "white", fontWeight: "900" }}>By Water</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setMode("species");
                  setSelected(null);
                }}
                style={pill(mode === "species")}
              >
                <Text style={{ color: "white", fontWeight: "900" }}>By Species</Text>
              </Pressable>
            </View>

            {/* Breadcrumb row + buttons */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text
                style={{ color: "rgba(255,255,255,0.55)", fontWeight: "800" }}
                numberOfLines={1}
              >
                {title}
              </Text>

              {selected ? (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={openReplay}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.12)",
                      opacity: replaySlides.length ? 1 : 0.5,
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "900" }}>▶ Replay</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setSelected(null)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.12)",
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "900" }}>
                      ← All {mode === "water" ? "Waters" : "Species"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            {/* Summary strip */}
            {summary ? (
              <View
                style={{
                  ...cardStyle,
                  paddingVertical: 10,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.55)",
                      fontSize: 12,
                      fontWeight: "800",
                    }}
                  >
                    Trips
                  </Text>
                  <Text
                    style={{
                      color: "white",
                      fontSize: 16,
                      fontWeight: "900",
                      marginTop: 2,
                    }}
                  >
                    {summary.trips}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.55)",
                      fontSize: 12,
                      fontWeight: "800",
                    }}
                  >
                    Photos
                  </Text>
                  <Text
                    style={{
                      color: "white",
                      fontSize: 16,
                      fontWeight: "900",
                      marginTop: 2,
                    }}
                  >
                    {summary.photos}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.55)",
                      fontSize: 12,
                      fontWeight: "800",
                    }}
                  >
                    Clips
                  </Text>
                  <Text
                    style={{
                      color: "white",
                      fontSize: 16,
                      fontWeight: "900",
                      marginTop: 2,
                    }}
                  >
                    {summary.clips}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.55)",
                      fontSize: 12,
                      fontWeight: "800",
                    }}
                  >
                    Last
                  </Text>
                  <Text
                    style={{
                      color: "white",
                      fontSize: 14,
                      fontWeight: "900",
                      marginTop: 2,
                    }}
                    numberOfLines={1}
                  >
                    {summary.last}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <Text style={{ color: "rgba(255,255,255,0.6)" }}>Loading…</Text>
          ) : selected ? (
            <Text style={{ color: "rgba(255,255,255,0.6)" }}>
              No trips found for this {mode}.
            </Text>
          ) : (
            <Text style={{ color: "rgba(255,255,255,0.6)" }}>
              No logs yet. Add a log first.
            </Text>
          )
        }
        renderItem={({ item }) => {
          if (typeof item === "string") {
            return (
              <Pressable onPress={() => setSelected(item)} style={cardStyle}>
                <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>
                  {item}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 6 }}>
                  Tap to view trips
                </Text>
              </Pressable>
            );
          }

          return (
            <Pressable onPress={() => Keyboard.dismiss()} style={cardStyle}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>
                    {item.species} • {item.water}
                  </Text>

                  <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
                    {new Date(item.createdAt).toLocaleString()}
                    {item.lengthIn ? ` • ${item.lengthIn} in` : ""}
                  </Text>

                  {item.notes ? (
                    <Text
                      style={{ color: "rgba(255,255,255,0.75)", marginTop: 6 }}
                      numberOfLines={3}
                    >
                      {item.notes}
                    </Text>
                  ) : null}

                  {item.photoUri || item.videoUri ? (
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 10,
                        marginTop: 10,
                        flexWrap: "wrap",
                      }}
                    >
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
                          <Text style={{ color: "white", fontWeight: "800" }}>
                            View Photo
                          </Text>
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
                          <Text style={{ color: "white", fontWeight: "800" }}>
                            Play Clip
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>

                {item.photoUri ? (
                  <Pressable
                    onPress={() => openViewer("photo", item.photoUri)}
                    style={{ alignSelf: "flex-start" }}
                  >
                    <Image
                      source={{ uri: item.photoUri }}
                      style={{
                        width: 74,
                        height: 74,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.10)",
                      }}
                    />
                  </Pressable>
                ) : item.videoUri ? (
                  <Pressable
                    onPress={() => openViewer("video", item.videoUri)}
                    style={{
                      width: 74,
                      height: 74,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      backgroundColor: "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "900" }}>🎥</Text>
                    <Text
                      style={{
                        color: "rgba(255,255,255,0.7)",
                        fontSize: 12,
                        marginTop: 4,
                      }}
                    >
                      Clip
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />

      {/* Timeline Replay Modal */}
      <Modal visible={replayOpen} transparent animationType="fade" onRequestClose={closeReplay}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.88)" }}>
          <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: "white", fontSize: 20, fontWeight: "900" }}>
                Timeline Replay
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
                {selected ?? ""} • {replaySlides.length ? replayIndex + 1 : 0}/{replaySlides.length}
              </Text>
            </View>

            {replaySlide ? (
              <Animated.View style={{ ...cardStyle, opacity: fade }}>
                <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>
                  {replaySlide.entry.species} • {replaySlide.entry.water}
                </Text>

                <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
                  {new Date(replaySlide.entry.createdAt).toLocaleString()}
                  {replaySlide.entry.lengthIn ? ` • ${replaySlide.entry.lengthIn} in` : ""}
                </Text>

                {replaySlide.entry.notes ? (
                  <Text style={{ color: "rgba(255,255,255,0.75)", marginTop: 10 }} numberOfLines={6}>
                    {replaySlide.entry.notes}
                  </Text>
                ) : null}

                <View
                  style={{
                    marginTop: 12,
                    borderRadius: 14,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                  }}
                >
                  {replaySlide.kind === "photo" ? (
                    <Image source={{ uri: replaySlide.uri }} style={{ width: "100%", height: 340 }} resizeMode="contain" />
                  ) : (
                    <Video
                      ref={(r) => (videoRef.current = r)}
                      source={{ uri: replaySlide.uri }}
                      style={{ width: "100%", height: 340 }}
                      resizeMode={ResizeMode.CONTAIN}
                      shouldPlay={replayPlaying}
                      isLooping={false}
                      useNativeControls={false}
                      onPlaybackStatusUpdate={(status: any) => {
                        if (!status) return;
                        if (status.didJustFinish) {
                          hardStopTimer();

                          const isLast = replayIndex >= replaySlides.length - 1;

                          // if last slide video ends early, stop slideshow right away
                          if (isLast) {
                            setReplayPlaying(false);
                            return;
                          }

                          // otherwise go next immediately
                          goNext();
                        }
                      }}
                    />
                  )}
                </View>

                <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 10, fontWeight: "800" }}>
                  Auto-advancing every 10 seconds
                </Text>
              </Animated.View>
            ) : (
              <View style={{ ...cardStyle }}>
                <Text style={{ color: "rgba(255,255,255,0.7)" }}>
                  No photos or videos in this selection to replay.
                </Text>
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Pressable
                onPress={goPrev}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: "rgba(255,255,255,0.08)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  alignItems: "center",
                  opacity: replayIndex === 0 ? 0.5 : 1,
                }}
              >
                <Text style={{ color: "white", fontWeight: "900" }}>⏮ Prev</Text>
              </Pressable>

              <Pressable
                onPress={() => setReplayPlaying((p) => !p)}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: "rgba(34,197,94,0.20)",
                  borderWidth: 1,
                  borderColor: "rgba(34,197,94,0.35)",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "900" }}>
                  {replayPlaying ? "⏸ Pause" : "▶ Play"}
                </Text>
              </Pressable>

              <Pressable
                onPress={goNext}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: "rgba(255,255,255,0.08)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  alignItems: "center",
                  opacity: replayIndex >= replaySlides.length - 1 ? 0.5 : 1,
                }}
              >
                <Text style={{ color: "white", fontWeight: "900" }}>⏭ Next</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={closeReplay}
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
          </View>
        </SafeAreaView>
      </Modal>

      {/* Full-screen Viewer */}
      <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={() => setViewerOpen(false)}>
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
                <Image source={{ uri: viewerUri }} style={{ width: "100%", height: 420 }} resizeMode="contain" />
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
