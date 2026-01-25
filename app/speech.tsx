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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

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
  const isWeb = Platform.OS === "web";
const recordStartedAt = useRef<number>(0);//when recording started

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [typedText, setTypedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<string>(isWeb ? "": "Web only");
const [pendingTranscript, setPendingTranscript] = useState<string | null>(null);
//pendingTranscript ensure the audio-text only sends after user stops the mic
  const listRef = useRef<FlatList<ChatMsg>>(null);
  const inputRef = useRef<TextInput>(null);
  const didInit = useRef(false);

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
        const WhisperTranscriber = mod?.WhisperTranscriber ?? mod?.default?.WhisperTranscriber ?? mod?.default;
//creating transcriber object
        if (typeof WhisperTranscriber !== "function") {
          console.log("whisper module keys:", Object.keys(mod || {}));
          throw new Error("WhisperTranscriber not found in module exports");
        }

       transcriber = new WhisperTranscriber({
  modelSize: "tiny.en",

  autoStop: false, 
  vad: false,             //allow user to control stop manually(use the mic button)

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
}


});

//downloading model
        await transcriber.loadModel();
       
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
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
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

  try {
    await transcriber.stopRecording();

    // give whisper a moment to finalize
    setTimeout(() => {
      if (pendingTranscript && pendingTranscript.trim()) {
        addMessage("hearing", pendingTranscript);//makes sure msgs is from the hearing side
      }
      setPendingTranscript(null);
    }, 10);
  } catch (e) {
    console.log("stopRecording error", e);
  }
};

//if sender is deaf msgs is from left
//else msg is from right

  const renderItem = ({ item }: { item: ChatMsg }) => {
    const isLeft = item.sender === "deaf";
    return (
      <View style={[styles.row, isLeft ? styles.rowLeft : styles.rowRight]}>
        <View style={[styles.bubble, isLeft ? styles.bubbleLeft : styles.bubbleRight]}>
          <Text style={[styles.bubbleText, isLeft ? styles.textLeft : styles.textRight]}>{item.text}</Text>
          <Text style={styles.time}>
            {new Date(item.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
      </View>
    );
  };

  const placeholder = useMemo(() => {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="chatbubble-ellipses-outline" size={56} color="rgba(255,255,255,0.35)" />
        <Text style={styles.emptyTitle}>No messages yet</Text>
      </View>
    );
  }, []);

  if (!isWeb) {
    return (
      <View style={[styles.safe, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: "white", fontWeight: "700" }}>Whisper STT works on Web only</Text>
      </View>
    );
  }
//main ui layout
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.container} behavior="padding">
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Live Conversation</Text>
      
        </View>

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

        <View style={styles.inputBar}>
          <TouchableOpacity
            style={[styles.micBtn, listening && styles.micBtnActive, loading && { opacity: 0.5 }]}
            disabled={loading || status.startsWith("COI")}


            onPress={listening ? stopListening : startListening}
          >
            <Ionicons name={listening ? "stop-circle" : "mic"} size={22} color="white" />
          </TouchableOpacity>

          <View style={styles.inputWrap}>
            <TextInput
              ref={inputRef}
              style={styles.input}
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
          </View>

          <TouchableOpacity style={[styles.sendBtn, !typedText.trim() && { opacity: 0.4 }]} disabled={!typedText.trim()} onPress={sendTyped}>
            <Ionicons name="send" size={18} color="white" />
          </TouchableOpacity>
        </View>

        <View style={styles.footerHint}>
          <Text style={styles.hintText}>{loading ? "loading.." : status}</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
//all ui stuff
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#050b18" },
  container: { flex: 1, backgroundColor: "#050b18" },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { color: "white", fontSize: 18, fontWeight: "900" },

  testLeftBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  testLeftText: { color: "rgba(255,255,255,0.85)", fontWeight: "900", fontSize: 12 },

  listWrap: { flex: 1 },
  listContent: { padding: 14, paddingBottom: 10 },

  row: { flexDirection: "row", marginVertical: 6 },
  rowLeft: { justifyContent: "flex-start" },
  rowRight: { justifyContent: "flex-end" },

  bubble: { maxWidth: "78%", borderRadius: 18, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1 },
  bubbleLeft: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.12)", borderTopLeftRadius: 8 },
  bubbleRight: { backgroundColor: "rgba(34,197,94,0.18)", borderColor: "rgba(34,197,94,0.35)", borderTopRightRadius: 8 },
  bubbleText: { fontSize: 15, fontWeight: "700" },
  textLeft: { color: "rgba(255,255,255,0.92)" },
  textRight: { color: "white" },
  time: { marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: "700" },

  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  emptyTitle: { color: "rgba(255,255,255,0.85)", fontSize: 18, fontWeight: "900", marginTop: 10 },
  emptySub: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: "600", textAlign: "center", marginTop: 6 },

  inputBar: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  micBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  micBtnActive: { backgroundColor: "rgba(239,68,68,0.18)", borderColor: "rgba(239,68,68,0.35)" },

  inputWrap: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    height: 42,
    justifyContent: "center",
  },
  input: { color: "white", fontSize: 15, fontWeight: "700", paddingVertical: 0 },

  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(34,197,94,0.35)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },

  footerHint: { paddingHorizontal: 14, paddingBottom: 10 },
  hintText: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "700" },
});
