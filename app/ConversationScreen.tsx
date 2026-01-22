import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { Audio } from "expo-av";

/**
 * Live Conversation (Hearing person speaks -> text)
 * Records audio using expo-av (mobile) or MediaRecorder (web), then sends to backend for Whisper transcription.
 *
 * NOTE:
 * - Whisper runs in your Python backend (FastAPI/Flask/etc).
 */

const USE_MOCK_TRANSCRIBE = false;
const TRANSCRIBE_URL = "http://192.168.1.175:8000/transcribe"; // python server

type Msg = {
  id: string;
  from: "hearing" | "app";
  text: string;
  ts: number;
};

export default function ConversationScreen() {
  const router = useRouter();

  const [status, setStatus] = useState<"idle" | "recording" | "processing">("idle");
  const [transcript, setTranscript] = useState<string>("—");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typedReply, setTypedReply] = useState("");

  const recordingRef = useRef<Audio.Recording | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  // Web refs
  const webRecorderRef = useRef<MediaRecorder | null>(null);
  const webChunksRef = useRef<Blob[]>([]);

  const canRecord = status === "idle";
  const canStop = status === "recording";

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages.length]);

  // ---------------------------
  // Mic permission helpers
  // ---------------------------
  const ensureMicPermission = async () => {
    if (Platform.OS !== "web") {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Microphone needed", "Please enable microphone access to record speech.");
        throw new Error("Mic permission not granted");
      }
    }
  };

  const configureAudioSessionForRecording = async () => {
    if (Platform.OS !== "web") {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });
    }
  };

  // ---------------------------
  // Recording
  // ---------------------------
  const startRecording = async () => {
    try {
      if (!canRecord) return;

      Speech.stop();
      setTranscript("—");
      setStatus("recording");

      await ensureMicPermission();

      // -------- WEB --------
      if (Platform.OS === "web") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
        webChunksRef.current = [];
        webRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) webChunksRef.current.push(e.data);
        };

        recorder.start();
        return;
      }

      // -------- MOBILE --------
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const rec = new Audio.Recording();
      recordingRef.current = rec;

      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
    } catch (e: any) {
      setStatus("idle");
      Alert.alert("Recording error", String(e?.message || e));
    }
  };

  const stopRecording = async () => {
    try {
      if (!canStop) return;
      setStatus("processing");

      // -------- WEB --------
      if (Platform.OS === "web") {
        const recorder = webRecorderRef.current;
        if (!recorder) {
          setStatus("idle");
          return;
        }

        recorder.stop();

        recorder.onstop = async () => {
          const blob = new Blob(webChunksRef.current, { type: "audio/webm" });
          const text = await transcribeAudio(blob);
          setTranscript(text || "—");

          if (text?.trim()) {
            setMessages((prev) => [
              ...prev,
              { id: String(Date.now()), from: "hearing", text: text.trim(), ts: Date.now() },
            ]);
          }
          setStatus("idle");
        };
        return;
      }

      // -------- MOBILE --------
      const rec = recordingRef.current;
      if (!rec) {
        setStatus("idle");
        return;
      }

      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;

      if (!uri) {
        setStatus("idle");
        Alert.alert("Recording error", "No audio file URI was created.");
        return;
      }

      const text = await transcribeAudio(uri);
      setTranscript(text || "—");

      if (text?.trim()) {
        setMessages((prev) => [
          ...prev,
          { id: String(Date.now()), from: "hearing", text: text.trim(), ts: Date.now() },
        ]);
      }

      setStatus("idle");
    } catch (e: any) {
      setStatus("idle");
      Alert.alert("Recording error", String(e?.message || e));
    }
  };

  // ---------------------------
  // Upload to backend
  // ---------------------------
  const transcribeAudio = async (input: string | Blob) => {
    if (USE_MOCK_TRANSCRIBE) {
      await new Promise((r) => setTimeout(r, 600));
      return "Mock transcript";
    }

    const form = new FormData();

    if (Platform.OS === "web") {
      form.append("file", input as Blob, "speech.webm");
    } else {
      form.append("file", {
        uri: input as string,
        name: "speech.m4a",
        type: Platform.OS === "ios" ? "audio/m4a" : "audio/mp4",
      } as any);
    }

    const res = await fetch(TRANSCRIBE_URL, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Transcribe failed (${res.status}): ${txt || "No details"}`);
    }

    const data = await res.json();
    return String(data?.text || "");
  };

  // ---------------------------
  // Chat helpers
  // ---------------------------
  const sendTypedReply = () => {
    const t = typedReply.trim();
    if (!t) return;

    setMessages((prev) => [
      ...prev,
      { id: String(Date.now()), from: "app", text: t, ts: Date.now() },
    ]);
    setTypedReply("");
  };

  const clearConversation = () => {
    setTranscript("—");
    setMessages([]);
  };

  // ---------------------------
  // Render
  // ---------------------------
  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.title}>Live Conversation</Text>
          <Text style={styles.subtitle}>Hearing person: speak → text</Text>
        </View>

        <TouchableOpacity style={styles.homeBtn} onPress={() => router.push("/")}>
          <Ionicons name="home" size={22} color="white" />
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>STATUS</Text>
        <Text style={styles.cardValue}>
          {status === "idle" && "Tap record to start"}
          {status === "recording" && "Recording… tap stop"}
          {status === "processing" && "Processing audio…"}
        </Text>

        <View style={styles.divider} />

        <Text style={styles.cardLabel}>TRANSCRIPT</Text>
        <Text style={styles.transcript}>{transcript || "—"}</Text>
      </View>

      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={[styles.roundBtn, !canRecord && styles.btnDisabled]}
          onPress={startRecording}
          disabled={!canRecord}
        >
          <Ionicons name="mic" size={20} color="white" />
          <Text style={styles.roundBtnText}>Record</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.roundBtn, !canStop && styles.btnDisabled]}
          onPress={stopRecording}
          disabled={!canStop}
        >
          <Ionicons name="square" size={18} color="white" />
          <Text style={styles.roundBtnText}>Stop</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.primary} onPress={clearConversation}>
        <Text style={styles.primaryText}>Clear</Text>
      </TouchableOpacity>

      <ScrollView ref={scrollRef} style={styles.chat} contentContainerStyle={styles.chatInner}>
        {messages.length === 0 ? (
          <Text style={styles.empty}>No messages yet.</Text>
        ) : (
          messages.map((m) => (
            <View
              key={m.id}
              style={[styles.bubble, m.from === "hearing" ? styles.bubbleLeft : styles.bubbleRight]}
            >
              <Text style={styles.bubbleText}>{m.text}</Text>
              <Text style={styles.bubbleMeta}>{m.from === "hearing" ? "Hearing" : "You"}</Text>
            </View>
          ))
        )}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.inputRow}>
          <TextInput
            value={typedReply}
            onChangeText={setTypedReply}
            placeholder="Type a reply…"
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={styles.input}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendTypedReply}>
            <Ionicons name="send" size={18} color="white" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050b18", padding: 16 },
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 12,
  },
  title: { color: "white", fontSize: 28, fontWeight: "900" },
  subtitle: { color: "rgba(255,255,255,0.6)", marginTop: 6, fontWeight: "700" },
  homeBtn: {
    width: 46,
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 18,
    padding: 14,
  },
  cardLabel: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  cardValue: { color: "white", fontSize: 18, fontWeight: "900", marginTop: 6 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.10)", marginVertical: 12 },
  transcript: { color: "white", fontSize: 18, fontWeight: "800", marginTop: 6, lineHeight: 24 },
  controlsRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  roundBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  roundBtnText: { color: "white", fontWeight: "900" },
  btnDisabled: { opacity: 0.5 },
  primary: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "#22c55e",
    alignItems: "center",
  },
  primaryText: { color: "white", fontWeight: "900" },
  chat: { flex: 1, marginTop: 12 },
  chatInner: { paddingBottom: 14 },
  empty: { color: "rgba(255,255,255,0.5)", fontWeight: "700", marginTop: 10, textAlign: "center" },
  bubble: {
    maxWidth: "82%",
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  bubbleLeft: { alignSelf: "flex-start" },
  bubbleRight: { alignSelf: "flex-end", backgroundColor: "rgba(34,197,94,0.14)" },
  bubbleText: { color: "white", fontWeight: "800", lineHeight: 20 },
  bubbleMeta: { marginTop: 6, color: "rgba(255,255,255,0.55)", fontWeight: "800", fontSize: 11 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, paddingBottom: 6 },
  input: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "white",
    fontWeight: "800",
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
});
