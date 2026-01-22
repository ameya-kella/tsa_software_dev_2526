import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import { useRouter } from "expo-router";

export default function OutputScreen() {
  const params = useLocalSearchParams<{ 
  text?: string; 
  autoGoConversation?: string; 
  }>();
  const text = useMemo(() => (params?.text ? String(params.text) : "—"), [params]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const router = useRouter();

  const autoGoConversation = params?.autoGoConversation === "true";


  const speak = () => {
    if (isSpeaking) return; // Prevent multiple TTS triggers
    Speech.stop();
    setIsSpeaking(true);

    Speech.speak(text, {
      rate: 0.95,
      onDone: () => {
        setIsSpeaking(false);
        if (autoGoConversation) router.push("/conversation");
      },
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };


  const stop = () => {
    Speech.stop();
    setIsSpeaking(false);
  };


  useEffect(() => {
    // Auto speak when arriving (feels like an interpreter)
    if (text && text !== "—") speak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Translation</Text>
      <Text style={styles.subtitle}>Text → Speech output</Text>

      <View style={styles.outputBox}>
        <Text style={styles.outputText}>{text}</Text>
      </View>

      <View style={styles.row}>
        <TouchableOpacity style={styles.btn} onPress={speak}>
          <Text style={styles.btnText}>{isSpeaking ? "Speaking…" : "Speak"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={stop}>
          <Text style={styles.btnText}>Stop</Text>
        </TouchableOpacity>
      </View>

      <Link href="/camera" asChild>
        <TouchableOpacity style={styles.primary}>
          <Text style={styles.primaryText}>Back to Interpreter</Text>
        </TouchableOpacity>
      </Link>

      <Link href="/" asChild>
        <TouchableOpacity style={styles.linkBtn}>
          <Text style={styles.linkText}>Back to Home</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b1220", padding: 18, justifyContent: "center" },
  title: { color: "white", fontSize: 28, fontWeight: "900", textAlign: "center" },
  subtitle: { color: "rgba(255,255,255,0.65)", textAlign: "center", marginTop: 6, marginBottom: 18 },

  outputBox: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 18,
    padding: 16,
    minHeight: 140,
    justifyContent: "center",
  },
  outputText: { color: "white", fontSize: 22, fontWeight: "800", textAlign: "center", lineHeight: 30 },

  row: { flexDirection: "row", gap: 12, marginTop: 14 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
  },
  btnGhost: { backgroundColor: "rgba(0,0,0,0.20)" },
  btnText: { color: "white", fontWeight: "900" },

  primary: { marginTop: 14, paddingVertical: 12, borderRadius: 16, backgroundColor: "#22c55e", alignItems: "center" },
  primaryText: { color: "white", fontWeight: "900" },

  linkBtn: { marginTop: 10, alignItems: "center", paddingVertical: 10 },
  linkText: { color: "rgba(255,255,255,0.65)", fontWeight: "800" },
});
