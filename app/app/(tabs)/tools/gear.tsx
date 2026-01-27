import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    FlatList,
    Keyboard,
    Pressable,
    SafeAreaView,
    Text,
    TextInput,
    View,
} from "react-native";
import Svg, { G, Line, Path, Rect } from "react-native-svg";

/* ---------- types ---------- */
// NEW Option A types
type GearType = "terminal" | "tackle" | "gear" | "tools" | "other";

// Back-compat: old saved types
type LegacyGearType = "lure" | "rod" | "reel" | "line" | "other";
type AnyGearType = GearType | LegacyGearType;

type GearItem = {
  id: string;
  createdAt: string; // ISO
  name: string;
  type: AnyGearType; // ✅ allows old saved values
  qty?: number;
  notes?: string;
};

const STORAGE_KEY = "gear_v1";

/* ---------- theme ---------- */
const BG = "#0b1220";
const CARD = "rgba(255,255,255,0.05)";
const CARD_BORDER = "rgba(255,255,255,0.08)";
const INPUT_BG = "rgba(255,255,255,0.06)";
const INPUT_BORDER = "rgba(255,255,255,0.10)";
const TXT_MUTED = "rgba(255,255,255,0.65)";
const TXT_FAINT = "rgba(255,255,255,0.45)";
const GREEN_BG = "rgba(34,197,94,0.18)";
const GREEN_BORDER = "rgba(34,197,94,0.45)";

function nowId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/* ---------- Option A mapping (back compatible) ---------- */
function normalizeType(t: AnyGearType): GearType {
  // legacy -> new
  if (t === "lure") return "terminal";
  if (t === "rod" || t === "reel") return "gear";
  if (t === "line") return "tackle";
  // already new or other
  if (t === "terminal" || t === "tackle" || t === "gear" || t === "tools")
    return t;
  return "other";
}

function prettyType(tAny: AnyGearType) {
  const t = normalizeType(tAny);
  if (t === "terminal") return "Terminal";
  if (t === "tackle") return "Tackle";
  if (t === "gear") return "Gear";
  if (t === "tools") return "Tools";
  return "Other";
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

/* ---------- minimal svg icon badge ---------- */
function GearIcon({ type: typeAny }: { type: AnyGearType }) {
  const type = normalizeType(typeAny);
  const stroke = "rgba(255,255,255,0.82)";
  const faint = "rgba(255,255,255,0.28)";

  return (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
      }}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24">
        {/* TERMINAL (lures/hooks/weights/rigs) */}
        {type === "terminal" ? (
          <G
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Line x1="7" y1="4" x2="17" y2="10" />
            <Line x1="7" y1="10" x2="17" y2="4" />
            <Line x1="12" y1="10" x2="12" y2="18" />
            <Line x1="10" y1="18" x2="14" y2="18" />
            <Line x1="11" y1="18" x2="9" y2="21" />
            <Line x1="13" y1="18" x2="15" y2="21" />
          </G>
        ) : /* TACKLE (line/leader/swivels/snaps) */ type === "tackle" ? (
          <G
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Rect x="7" y="6" width="10" height="12" rx="3" />
            <Line x1="9" y1="9" x2="15" y2="9" />
            <Line x1="9" y1="12" x2="15" y2="12" />
            <Line x1="9" y1="15" x2="13" y2="15" />
          </G>
        ) : /* GEAR (rods/reels/nets/gaff) */ type === "gear" ? (
          <G
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Line x1="6" y1="20" x2="18" y2="4" />
            <Line x1="16" y1="6" x2="18.5" y2="6.5" />
            <Path d="M18.5 6.5c-2.5 1.5-3.8 3.4-3.9 5.9" stroke={faint} />
          </G>
        ) : /* TOOLS (pliers/cutters/scale/tape) */ type === "tools" ? (
          <G
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* simple wrench-ish tool */}
            <Path d="M14.5 5.8a3.5 3.5 0 0 0-4.7 4.7l-4.6 4.6a2 2 0 0 0 2.8 2.8l4.6-4.6a3.5 3.5 0 0 0 4.7-4.7l-2 2-2.2-2.2 2-2z" />
          </G>
        ) : (
          /* OTHER */
          <G
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Rect x="6.5" y="7" width="11" height="11" rx="2.5" />
            <Line x1="6.5" y1="11" x2="17.5" y2="11" />
            <Line x1="10" y1="7" x2="10" y2="18" stroke={faint} />
          </G>
        )}
      </Svg>
    </View>
  );
}

export default function GearScreen() {
  const listRef = useRef<FlatList<GearItem>>(null);
  const nameRef = useRef<TextInput>(null);

  const [items, setItems] = useState<GearItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<GearType>("terminal"); // ✅ default Option A
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [showForm, setShowForm] = useState(false);

  const isEditing = editingId !== null;

  async function load() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed: GearItem[] = raw ? JSON.parse(raw) : [];
      // ✅ normalize in-memory only (no storage rewrite)
      setItems(
        parsed.map((it) => ({ ...it, type: normalizeType(it.type) }))
      );
    } catch {
      setItems([]);
    }
  }

  async function persist(next: GearItem[]) {
    // store already-normalized new types
    setItems(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  useEffect(() => {
    load();
  }, []);

  const total = useMemo(() => items.length, [items]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setType("terminal");
    setQty("1");
    setNotes("");
    Keyboard.dismiss();
  }

  function openForm() {
    setShowForm(true);
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  function startEdit(it: GearItem) {
    Keyboard.dismiss();
    setEditingId(it.id);
    setName(it.name);
    setType(normalizeType(it.type)); // ✅ safety
    setQty(String(it.qty ?? 1));
    setNotes(it.notes ?? "");
    openForm();
  }

  async function upsert() {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Missing name", "Give this gear a name.");
      return;
    }

    const parsedQty = Math.max(1, Number(qty) || 1);

    if (isEditing) {
      await persist(
        items.map((it) =>
          it.id === editingId
            ? {
                ...it,
                name: trimmed,
                type, // ✅ new Option A type
                qty: parsedQty,
                notes: notes.trim() || undefined,
              }
            : it
        )
      );
    } else {
      await persist([
        {
          id: nowId(),
          createdAt: new Date().toISOString(),
          name: trimmed,
          type, // ✅ new Option A type
          qty: parsedQty,
          notes: notes.trim() || undefined,
        },
        ...items,
      ]);
    }

    resetForm();
    setShowForm(false);
    requestAnimationFrame(() =>
      listRef.current?.scrollToOffset({ offset: 0, animated: true })
    );
  }

  function confirmDelete(id: string) {
    Keyboard.dismiss();
    Alert.alert("Delete gear", "Remove this item?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await persist(items.filter((x) => x.id !== id));
        },
      },
    ]);
  }

  function Chip({
    label,
    active,
    onPress,
  }: {
    label: string;
    active: boolean;
    onPress: () => void;
  }) {
    return (
      <Pressable
        onPress={() => {
          Keyboard.dismiss();
          onPress();
        }}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 999,
          backgroundColor: active
            ? "rgba(37,99,235,0.25)"
            : "rgba(255,255,255,0.06)",
          borderWidth: 1,
          borderColor: active
            ? "rgba(37,99,235,0.60)"
            : "rgba(255,255,255,0.10)",
        }}
      >
        <Text style={{ color: "white", fontWeight: "800", fontSize: 13 }}>
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(it) => it.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            {/* Header */}
            <View>
              <Text style={{ color: "white", fontSize: 22, fontWeight: "900" }}>
                Current Gear
              </Text>
              <Text style={{ color: TXT_MUTED }}>{total} items</Text>
            </View>

            {/* Toggle add */}
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setShowForm((v) => !v);
                if (!showForm) openForm();
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
                {showForm ? "Hide Add Gear" : "+ Add Gear"}
              </Text>
            </Pressable>

            {/* Add / Edit form */}
            {showForm && (
              <View
                style={{
                  backgroundColor: CARD,
                  borderWidth: 1,
                  borderColor: CARD_BORDER,
                  borderRadius: 16,
                  padding: 12,
                  gap: 10,
                }}
              >
                <Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: "900" }}>
                  {isEditing ? "Edit gear" : "Add gear"}
                </Text>

                <TextInput
                  ref={nameRef}
                  value={name}
                  onChangeText={setName}
                  placeholder="Gear name"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={{
                    backgroundColor: INPUT_BG,
                    borderWidth: 1,
                    borderColor: INPUT_BORDER,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    color: "white",
                    fontSize: 15,
                  }}
                />

                {/* Qty row */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <TextInput
                      value={qty}
                      onChangeText={(v) => setQty(v.replace(/[^0-9]/g, ""))}
                      keyboardType="number-pad"
                      placeholder="1"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      style={{
                        width: 70,
                        backgroundColor: INPUT_BG,
                        borderWidth: 1,
                        borderColor: INPUT_BORDER,
                        borderRadius: 12,
                        paddingVertical: 10,
                        textAlign: "center",
                        color: "white",
                        fontSize: 14,
                        fontWeight: "800",
                      }}
                    />
                    <Text style={{ color: TXT_MUTED, fontWeight: "800", fontSize: 13 }}>
                      Qty
                    </Text>
                  </View>

                  {/* Tiny preview badge */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <GearIcon type={type} />
                    <Text style={{ color: TXT_MUTED, fontWeight: "800", fontSize: 12 }}>
                      {prettyType(type)}
                    </Text>
                  </View>
                </View>

                {/* Type chips (Option A) */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <Chip
                    label="Terminal"
                    active={type === "terminal"}
                    onPress={() => setType("terminal")}
                  />
                  <Chip
                    label="Tackle"
                    active={type === "tackle"}
                    onPress={() => setType("tackle")}
                  />
                  <Chip
                    label="Gear"
                    active={type === "gear"}
                    onPress={() => setType("gear")}
                  />
                  <Chip
                    label="Tools"
                    active={type === "tools"}
                    onPress={() => setType("tools")}
                  />
                  <Chip
                    label="Other"
                    active={type === "other"}
                    onPress={() => setType("other")}
                  />
                </View>

                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Notes (optional)"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  multiline
                  style={{
                    backgroundColor: INPUT_BG,
                    borderWidth: 1,
                    borderColor: INPUT_BORDER,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    color: "white",
                    fontSize: 14,
                    minHeight: 70,
                    textAlignVertical: "top",
                  }}
                />

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={upsert}
                    style={{
                      flex: 1,
                      backgroundColor: GREEN_BG,
                      borderWidth: 1,
                      borderColor: GREEN_BORDER,
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "900" }}>
                      {isEditing ? "Save" : "Add"}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      resetForm();
                      setShowForm(false);
                    }}
                    style={{
                      width: 90,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "800" }}>Close</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <Text style={{ color: TXT_FAINT, fontWeight: "800" }}>Saved gear</Text>
          </View>
        }
        ListFooterComponent={
          <Text
            style={{
              color: TXT_FAINT,
              fontSize: 12,
              textAlign: "center",
              marginTop: 16,
            }}
          >
            Tip: long press an item to delete
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => startEdit(item)}
            onLongPress={() => confirmDelete(item.id)}
            style={{
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: CARD_BORDER,
              borderRadius: 14,
              paddingVertical: 10,
              paddingHorizontal: 12,
            }}
          >
            <View style={{ flexDirection: "row", gap: 10 }}>
              <GearIcon type={item.type} />

              <View style={{ flex: 1 }}>
                <Text style={{ color: "white", fontSize: 15, fontWeight: "800" }}>
                  {item.name}
                  {(item.qty ?? 1) > 1 && (
                    <Text style={{ color: TXT_MUTED }}> ×{item.qty}</Text>
                  )}
                </Text>

                <Text style={{ color: TXT_MUTED, fontSize: 12, marginTop: 2 }}>
                  {prettyType(item.type)} • {formatDate(item.createdAt)}
                </Text>

                {!!item.notes && (
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.75)",
                      fontSize: 12,
                      marginTop: 4,
                    }}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {item.notes}
                  </Text>
                )}
              </View>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
