// speech.tsx:
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  StyleSheet,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  SafeAreaView,
  Animated,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

// Optional: glass + gradients (install if missing)
// npx expo install expo-blur expo-linear-gradient
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

//message type
type ChatMsg = {
  id: string;
  sender: "deaf" | "hearing";
  text: string;
  ts: number;
};

//transcriber is the variable that will hold the Whisper object
let transcriber: any = null;

export default function SpeechScreen() {
  const router = useRouter();
  const isWeb = Platform.OS === "web";
const [showAslUnderHearing, setShowAslUnderHearing] = useState(false);

// placeholder for now (later replace this with your model output)
const toAslStyleEnglish = (text: string) => {
  // for now just “ASL style” formatting placeholder
  return text; 
};

  const recordStartedAt = useRef<number>(0);//when recording started

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [typedText, setTypedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<string>(isWeb ? "" : "Web only");
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(null); //pendingTranscript ensure the audio-text only sends after user stops the mic

  const listRef = useRef<FlatList<ChatMsg>>(null);
  const inputRef = useRef<TextInput>(null);
  const didInit = useRef(false);

  // mic pulse animation
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!listening) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  const addMessage = (sender: ChatMsg["sender"], text: string) => {
    //getting rid of whitespace&&ignoring empty messages
    const clean = (text || "").trim();
    if (!clean) return;
    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
        sender,
        text: clean,
        ts: Date.now(),
      },
    ]);
  };

  //cross origin isolated ensures browser is safe to run the ML code(whisper)
  useEffect(() => {
    if (!isWeb) return;//only web :(

    const ensureCOI = async () => {
      try {
        // If already isolated, we're good.
        if ((window as any).crossOriginIsolated) return true;

        setStatus("Enabling COI…");//just for testing purposes

        //goes to /coi-serviceworker.js page to register a service worker if not alr there -> enabling COI
        if ("serviceWorker" in navigator) {
          await navigator.serviceWorker.register("/coi-serviceworker.js", { scope: "/" });
        } else {
          throw new Error("Service workers not supported in this browser");
        }

        // relod to apply COI &&session storage make sure it doesnt reload forever
        const key = "__coi_reload_once__"; //key determines if page reloaded or nah
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          location.reload();
          return false; //we reloaded
        }

        return (window as any).crossOriginIsolated === true;
      } catch (e) {
        console.log("COI setup error:", e);
        setStatus("COI failed (check /coi-serviceworker.js)");
        return false;
      }
    };

    const run = async () => {
      const ok = await ensureCOI();
      if (!ok) return; // either reloaded or failed
    };

    run();
  }, [isWeb]);

  //intialize whisper only after COI exists
  useEffect(() => {
    if (!isWeb) return;
    if (didInit.current) return;
    didInit.current = true;

    const initWhisper = async () => {
      try {
        // Wait until COI is actually on
        if (!(window as any).crossOriginIsolated) {
          setStatus("COI not ready yet…");
          didInit.current = false; // allow retry after reload
          return;
        }

        setLoading(true);

        //using the package import
        const mod: any = await import("whisper-web-transcriber");
        const WhisperTranscriber =
          mod?.WhisperTranscriber ?? mod?.default?.WhisperTranscriber ?? mod?.default;

        //creating transcriber object
        if (typeof WhisperTranscriber !== "function") {
          console.log("whisper module keys:", Object.keys(mod || {}));
          throw new Error("WhisperTranscriber not found in module exports");
        }

        transcriber = new WhisperTranscriber({
          modelSize: "tiny.en",
          autoStop: false,
          vad: false, //allow user to control stop manually(use the mic button)

          onTranscription: (result: any) => {
            let text =
              typeof result === "string"
                ? result
                : result?.text ??
                  result?.transcription ??
                  (Array.isArray(result?.segments)
                    ? result.segments.map((s: any) => s?.text ?? "").join(" ")
                    : "");//joining the segments from an array to form one sentence or just joining an empty string

            text = (text || "").trim();

            //function only storing and not displaying anything
            setPendingTranscript(text || null);
          },
        });

        //downloading model
        await transcriber.loadModel();
        setStatus("Ready");
      } catch (e) {
        console.log("whisper init error", e);
        setStatus("Whisper failed to load");
      } finally {
        setLoading(false);
      }
    };

    initWhisper();
  }, [isWeb]);

  //auto scroll to bottom when messages keep adding
  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages.length]);

  //the hearing person will be the one who sends the typed msg
  const sendTyped = () => {
    if (!typedText.trim()) return;
    addMessage("hearing", typedText);
    setTypedText("");
  };

  const startListening = async () => {
    if (!isWeb || !transcriber || loading) return;
    try {
      setListening(true);
      setStatus("Listening…");
      recordStartedAt.current = Date.now();
      //await ensures whisper waits until actual recording start
      await transcriber.startRecording(); //tells whisper to turn mic on and listen to audio
    } catch (e) {
      console.log("startRecording error", e);
      setListening(false);
      setStatus("Mic error");
    }
  };

  const stopListening = async () => {
    if (!isWeb || !transcriber || loading) return;
    setListening(false);
    setStatus("Finalizing…");
    try {
      await transcriber.stopRecording();
      // give whisper a moment to finalize
      setTimeout(() => {
        if (pendingTranscript && pendingTranscript.trim()) {
          addMessage("hearing", pendingTranscript);//makes sure msgs is from the hearing side
        }
        setPendingTranscript(null);
        setStatus("Ready");
      }, 20);
    } catch (e) {
      console.log("stopRecording error", e);
      setStatus("Stop error");
    }
  };

  // UI helpers
  const prettyStatus = useMemo(() => {
    if (loading) return { label: "Loading model…", tone: "warn" as const };
    if (!isWeb) return { label: "Web only", tone: "bad" as const };
    if (status?.startsWith("COI")) return { label: status, tone: "warn" as const };
    if (status === "Ready") return { label: "Ready", tone: "good" as const };
    if (status === "Listening…") return { label: "Listening", tone: "good" as const };
    if (status === "Finalizing…") return { label: "Finalizing", tone: "warn" as const };
    if (!status) return { label: "Ready", tone: "good" as const };
    if (status.toLowerCase().includes("failed") || status.toLowerCase().includes("error"))
      return { label: status, tone: "bad" as const };
    return { label: status, tone: "warn" as const };
  }, [loading, isWeb, status]);

  const statusPillStyle =
    prettyStatus.tone === "good"
      ? styles.pillGood
      : prettyStatus.tone === "bad"
      ? styles.pillBad
      : styles.pillWarn;

  const placeholder = useMemo(() => {
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIcon}>
          <Ionicons name="chatbubble-ellipses-outline" size={30} color="rgba(255,255,255,0.75)" />
        </View>
        <Text style={styles.emptyTitle}>Start a conversation</Text>
        <Text style={styles.emptySub}>
          Tap the mic to transcribe speech, or type a message below.
        </Text>
      </View>
    );
  }, []);

  //if sender is deaf msgs is from left
  //else msg is from right
const renderItem = ({ item }: { item: ChatMsg }) => {
  const isLeft = item.sender === "deaf";
  const showAsl = showAslUnderHearing && item.sender === "hearing";

  return (
    <View style={[styles.row, isLeft ? styles.rowLeft : styles.rowRight]}>
      <View style={{ gap: 8, alignItems: isLeft ? "flex-start" : "flex-end" }}>
        {/* MAIN bubble */}
        <View style={[styles.bubble, isLeft ? styles.bubbleLeft : styles.bubbleRight]}>
          <Text style={[styles.bubbleText, isLeft ? styles.textLeft : styles.textRight]}>
            {item.text}
          </Text>
          <Text style={styles.time}>
            {new Date(item.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>

        {/* ASL-style bubble (only for hearing msgs when toggle is ON) */}
        {showAsl && (
          <View style={[styles.bubble, styles.bubbleASL]}>
            <View style={styles.aslHeaderRow}>
              <Ionicons name="swap-horizontal" size={14} color="rgba(255,255,255,0.9)" />

              <Text style={styles.aslHeaderText}>ASL-style English</Text>
            </View>

            <Text style={styles.aslText}>{toAslStyleEnglish(item.text)}</Text>
          </View>
        )}
      </View>
    </View>
  );
};


  if (!isWeb) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.center, { padding: 22 }]}>
          <Text style={{ color: "white", fontWeight: "800", fontSize: 16 }}>
            Whisper STT works on Web only
          </Text>
          <TouchableOpacity style={styles.homeCta} onPress={() => router.push("/")}>
            <Ionicons name="home" size={18} color="white" />
            <Text style={styles.homeCtaText}>Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.35] });

  //main ui layout
  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient
        colors={["#070B18", "#0A1230", "#080A12"]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* soft glow blobs */}
     

      <KeyboardAvoidingView style={styles.container} behavior="padding">
        {/* FLOATING GLASS HEADER */}
        <View style={styles.headerWrap}>
          <BlurView intensity={22} tint="dark" style={styles.headerGlass}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Live Conversation</Text>
              <View style={[styles.pill, statusPillStyle]}>
                <View
                  style={[
                    styles.dot,
                    prettyStatus.tone === "good"
                      ? styles.dotGood
                      : prettyStatus.tone === "bad"
                      ? styles.dotBad
                      : styles.dotWarn,
                  ]}
                />
                <Text style={styles.pillText}>{prettyStatus.label}</Text>
              </View>
            </View>

            <View style={styles.headerRight}>
  {/* TOGGLE (left of Home) */}
  <View style={styles.toggleWrap}>
    <Text style={styles.toggleLabel}>ASL</Text>
    <Switch
      value={showAslUnderHearing}
      onValueChange={setShowAslUnderHearing}
      trackColor={{ false: "rgba(255,255,255,0.15)", true: "rgba(59,130,246,0.45)" }}
      thumbColor={"white"}
    />
  </View>

  {/* HOME BUTTON (most right) */}
  <TouchableOpacity onPress={() => router.push("/")} style={styles.iconBtn}>
    <Ionicons name="home" size={18} color="white" />
  </TouchableOpacity>
</View>

          </BlurView>
        </View>

        {/* CHAT */}
        <View style={styles.listWrap}>
          {messages.length ? (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            />
          ) : (
            placeholder
          )}
        </View>

        {/* INPUT BAR (GLASS) */}
        <BlurView intensity={18} tint="dark" style={styles.inputBar}>
          {/* MIC */}
          <View style={styles.micWrap}>
            {listening && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.micRing,
                  { transform: [{ scale: ringScale }], opacity: ringOpacity },
                ]}
              />
            )}

            <TouchableOpacity
              style={[
                styles.micBtn,
                listening && styles.micBtnActive,
                loading && { opacity: 0.55 },
              ]}
              disabled={loading || status.startsWith("COI")}
              onPress={listening ? stopListening : startListening}
              activeOpacity={0.85}
            >
              <Ionicons name={listening ? "stop" : "mic"} size={18} color="white" />
            </TouchableOpacity>
          </View>

          {/* TEXT INPUT */}
          <View style={styles.inputWrap}>
            <TextInput
              
              ref={inputRef}
              style={[
  styles.input,
  Platform.OS === "web" &&
    ({
      outlineStyle: "none",
      outlineWidth: 0,
      boxShadow: "none",
    } as any),
]}
              
              value={typedText}
              onChangeText={setTypedText}
              placeholder="Type a message…"
              placeholderTextColor="rgba(255,255,255,0.45)"
              returnKeyType="send"
              blurOnSubmit={false}
              multiline={false}
              onSubmitEditing={() => {
                if (typedText.trim()) sendTyped();
              }}
            />

            {/* subtle helper text when listening */}
            {listening ? (
              <Text style={styles.miniHint}>Listening… stop to send</Text>
            ) : pendingTranscript ? (
              <Text style={styles.miniHint}>Captured: “{pendingTranscript.slice(0, 38)}…”</Text>
            ) :null}
          </View>

          {/* SEND */}
          <TouchableOpacity
            style={[styles.sendBtn, !typedText.trim() && { opacity: 0.35 }]}
            disabled={!typedText.trim()}
            onPress={sendTyped}
            activeOpacity={0.85}
          >
            <Ionicons name="send" size={16} color="white" />
          </TouchableOpacity>
        </BlurView>

        {/* bottom safe spacing */}
        <View style={{ height: 10 }} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

//all ui stuff
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#050b18" },
  container: { flex: 1 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
toggleWrap: {
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
  paddingVertical: 6,
  paddingHorizontal: 10,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  backgroundColor: "rgba(255,255,255,0.06)",
},
toggleLabel: {
  color: "rgba(255,255,255,0.85)",
  fontWeight: "800",
  fontSize: 12,
  letterSpacing: 0.3,
},

bubbleASL: {
  backgroundColor: "rgba(59,130,246,0.18)", // blue
  borderColor: "rgba(59,130,246,0.35)",
},

aslHeaderRow: {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  marginBottom: 6,
},
aslHeaderText: {
  color: "rgba(255,255,255,0.9)",
  fontWeight: "900",
  fontSize: 12,
},
aslText: {
  color: "white",
  fontSize: 14,
  fontWeight: "800",
  lineHeight: 19,
},

  // header
  headerWrap: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerGlass: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(10,14,24,0.55)",
  },
  headerLeft: { gap: 6 },
  headerTitle: { color: "white", fontSize: 16, fontWeight: "900", letterSpacing: 0.2 },

  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { color: "rgba(255,255,255,0.88)", fontWeight: "900", fontSize: 12 },
  pillGood: { backgroundColor: "rgba(34,197,94,0.10)", borderColor: "rgba(34,197,94,0.25)" },
  pillWarn: { backgroundColor: "rgba(245,158,11,0.10)", borderColor: "rgba(245,158,11,0.25)" },
  pillBad: { backgroundColor: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.25)" },

  dot: { width: 8, height: 8, borderRadius: 99 },
  dotGood: { backgroundColor: "rgba(34,197,94,0.95)" },
  dotWarn: { backgroundColor: "rgba(245,158,11,0.95)" },
  dotBad: { backgroundColor: "rgba(239,68,68,0.95)" },

  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  spark: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(124,58,237,0.20)",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.35)",
  },

  // list
  listWrap: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingBottom: 12 },

  row: { flexDirection: "row", marginVertical: 7 },
  rowLeft: { justifyContent: "flex-start" },
  rowRight: { justifyContent: "flex-end" },

  bubble: {
    
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  bubbleLeft: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderColor: "rgba(255,255,255,0.12)",
    borderTopLeftRadius: 9,
  },
  bubbleRight: {
    backgroundColor: "rgba(34,197,94,0.16)",
    borderColor: "rgba(34,197,94,0.28)",
    borderTopRightRadius: 9,
  },
  bubbleText: { fontSize: 15, fontWeight: "800", lineHeight: 20 },
  textLeft: { color: "rgba(255,255,255,0.92)" },
  textRight: { color: "white" },
  time: { marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: "800" },

  // empty state
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 26 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  emptyTitle: { color: "white", fontSize: 18, fontWeight: "900", marginTop: 12 },
  emptySub: {
    color: "rgba(255,255,255,0.60)",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
    maxWidth: 260,
  },

  // input bar
  inputBar: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(10,14,24,0.55)",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  micWrap: { width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  micRing: {
    position: "absolute",
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: "rgba(239,68,68,0.35)",
  },
  micBtn: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  micBtnActive: {
    backgroundColor: "rgba(239,68,68,0.16)",
    borderColor: "rgba(239,68,68,0.30)",
  },

  inputWrap: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: { color: "white", fontSize: 15, fontWeight: "800", paddingVertical: 0 },
  
  miniHint: {
    marginTop: 6,
    color: "rgba(255,255,255,0.45)",
    fontWeight: "800",
    fontSize: 11,
  },

  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: "rgba(124,58,237,0.30)",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.40)",
    alignItems: "center",
    justifyContent: "center",
  },

  // fallback home CTA on non-web
  homeCta: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  homeCtaText: { color: "white", fontWeight: "900" },
});
