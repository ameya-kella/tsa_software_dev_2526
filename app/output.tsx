import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";

export default function OutputScreen() {
  const params = useLocalSearchParams<{ text?: string }>();
  const router = useRouter();

  const text = useMemo(() => (params?.text ? String(params.text) : "Waiting for input..."), [params]);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const hasRealText = text && text !== "—" && text !== "Waiting for input...";

  const speak = () => {
    Speech.stop();
    setIsSpeaking(true);

    Speech.speak(text, {
      rate: 0.95,
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  const stop = () => {
    Speech.stop();
    setIsSpeaking(false);
  };

  useEffect(() => {
    if (hasRealText) speak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      {/* ✅ put glows FIRST so they sit behind everything */}
      <View pointerEvents="none" style={styles.bgGlowPurple} />
      <View pointerEvents="none" style={styles.bgGlowGreen} />

      <View style={styles.shell}>
        {/* Header Card */}
        <View style={styles.headerCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Translation</Text>
            <Text style={styles.subtitle}>Text → Speech output</Text>

          </View>

          <TouchableOpacity style={styles.homeBtn} onPress={() => router.push("/")}>
            <Ionicons name="home" size={20} color="white" />
          </TouchableOpacity>
        </View>

        {/* Output Box */}
        <View style={styles.outputBox}>
          <Text style={styles.outputText}>{text}</Text>
        </View>

        {/* Controls */}
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.actionBtn, !hasRealText && { opacity: 0.5 }]}
            onPress={speak}
            disabled={!hasRealText}
          >
            <Ionicons name="volume-high" size={18} color="white" />
            <Text style={styles.actionText}>{isSpeaking ? "Speaking…" : "Speak"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnGhost]} onPress={stop}>
            <Ionicons name="stop" size={18} color="white" />
            <Text style={styles.actionText}>Stop</Text>
          </TouchableOpacity>
        </View>

        {/* ✅ Main CTA styled like your dark/purple UI */}
        <Link href="/camera" asChild>
          <TouchableOpacity style={styles.primary}>
            <Text style={styles.primaryText}>Back to Interpreter</Text>
            <Ionicons name="arrow-forward" size={18} color="white" />
          </TouchableOpacity>
        </Link>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050b18",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    overflow: "hidden", // important so glows don’t show as hard edges
  },

  // ====== ✅ Subtle glows (off-screen so only edges show) ======
  bgGlowPurple: {
    position: "absolute",
    width: 560,
    height: 560,
    borderRadius: 560,
    backgroundColor: "rgba(124,58,237,0.18)",
    top: -330,
    right: -340,
    ...(Platform.OS === "web" ? ({ filter: "blur(90px)" } as any) : {}),
    opacity: 0.9,
  },
  bgGlowGreen: {
    position: "absolute",
    width: 620,
    height: 620,
    borderRadius: 620,
  backgroundColor: "rgba(59,130,246,0.18)", // blue
    bottom: -380,
    left: -380,
    ...(Platform.OS === "web" ? ({ filter: "blur(95px)" } as any) : {}),
    opacity: 0.85,
  },

  // Main rounded “phone” area
  shell: {
    width: "100%",

  },

  headerCard: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.22)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  title: { color: "white", fontSize: 28, fontWeight: "800" },
  subtitle: { color: "rgba(255,255,255,0.65)", marginTop: 6, fontSize: 14 },

  statusPill: {
    marginTop: 12,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  dot: { width: 10, height: 10, borderRadius: 10 },
  statusText: { color: "rgba(255,255,255,0.85)", fontWeight: "700" },

  homeBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  outputBox: {
    marginTop: 14,
    backgroundColor: "rgba(0,0,0,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 22,
    padding: 18,
    minHeight: 170,
    justifyContent: "center",
  },
  outputText: {
    color: "white",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 30,
  },

  row: { flexDirection: "row", gap: 12, marginTop: 14 },

  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  actionBtnGhost: {
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  actionText: { color: "white", fontWeight: "800" },

 
  primary: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 12,
    backgroundColor: "rgba(124,58,237,0.22)",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.35)",
  },
  primaryText: { color: "white", fontWeight: "900", fontSize: 16 },

  linkBtn: { marginTop: 10, alignItems: "center", paddingVertical: 10 },
  linkText: { color: "rgba(255,255,255,0.55)", fontWeight: "800" },
});
