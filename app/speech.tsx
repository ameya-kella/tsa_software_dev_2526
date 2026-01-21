// app/speech.tsx
import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Platform, StyleSheet } from "react-native";

let transcriber: any = null;

export default function SpeechScreen() {
  const [text, setText] = useState<string>("Tap mic and speak");
  const [loading, setLoading] = useState<boolean>(false);
  const [listening, setListening] = useState<boolean>(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const initWhisper = async () => {
      setLoading(true);
      const module = await import("whisper-web-transcriber");
      const { WhisperTranscriber } = module;

      transcriber = new WhisperTranscriber({
        modelSize: "tiny.en",
        onTranscription: (result: string) => setText(result),
      });

      await transcriber.loadModel();
      setLoading(false);
    };

    initWhisper();
  }, []);

  const startListening = async () => {
    if (!transcriber) return;
    setText("Listening...");
    setListening(true);
    await transcriber.startRecording();
  };

  const stopListening = async () => {
    if (!transcriber) return;
    setListening(false);
    await transcriber.stopRecording();
  };

  if (Platform.OS !== "web") {
    return <Text>Whisper STT works on Web only</Text>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Offline Whisper Speech-to-Text</Text>
      <View style={styles.textBox}>
        <Text style={styles.text}>{text}</Text>
      </View>

      {loading ? (
        <Text style={styles.loadingText}>Loading model…</Text>
      ) : (
        <TouchableOpacity
          style={[styles.button, listening ? styles.stopButton : styles.startButton]}
          onPress={listening ? stopListening : startListening}
        >
          <Text style={styles.buttonText}>{listening ? "Stop 🎤" : "Speak 🎤"}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 20, color: "white" },
  textBox: {
    minHeight: 100,
    width: "100%",
    padding: 15,
    backgroundColor: "#eee",
    borderRadius: 12,
    marginBottom: 20,
  },
  text: { fontSize: 16 },
  loadingText: { fontSize: 16, color: "#999", marginBottom: 10 },
  button: { paddingVertical: 12, paddingHorizontal: 30, borderRadius: 30 },
  startButton: { backgroundColor: "#4caf50" },
  stopButton: { backgroundColor: "#ff5252" },
  buttonText: { color: "#fff", fontSize: 16 },
});
