import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image, Platform } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage'; 

// -------------------------
// Landmark indices
// -------------------------
const LEFT_HAND_IDXS = Array.from({ length: 21 }, (_, i) => 468 + i);
const RIGHT_HAND_IDXS = Array.from({ length: 21 }, (_, i) => 522 + i);
const LEFT_POSE_IDXS = [502, 504, 506, 508, 510];
const RIGHT_POSE_IDXS = [503, 505, 507, 509, 511];
const FACE_IDXS = [
  61,185,40,39,37,0,267,269,270,409,
  291,146,91,181,84,17,314,405,321,375,
  78,191,80,81,82,13,312,311,310,415,
  95,88,178,87,14,317,402,318,324,308
];

// -------------------------
// Types
// -------------------------
type WSData = {
  current_sign: string;
  confidence: number | null;
  top5: [string, number][] | null;
  recognized_words: string[];
  generated_sentence?: string;
};

// -------------------------
// Helper: extract 543 landmarks
// -------------------------
const extract543Landmarks = (
  faceResults: any,
  leftHandResults: any,
  rightHandResults: any,
  poseResults: any
) => {
  const landmarks: number[][] = Array.from({ length: 543 }, () => [NaN, NaN, NaN]);

  if (faceResults?.multiFaceLandmarks?.length) {
    const face = faceResults.multiFaceLandmarks[0];
    FACE_IDXS.forEach((idx) => {
      if (face[idx]) landmarks[idx] = [face[idx].x, face[idx].y, face[idx].z];
    });
  }

  if (poseResults?.poseLandmarks) {
    poseResults.poseLandmarks.slice(0, 10).forEach((lm, i) => {
      landmarks[502 + i] = [lm.x, lm.y, lm.z];
    });
  }

  if (leftHandResults?.multiHandLandmarks?.length) {
    leftHandResults.multiHandLandmarks.forEach((hand) => {
      hand.forEach((lm, i) => (landmarks[468 + i] = [lm.x, lm.y, lm.z]));
    });
  }

  if (rightHandResults?.multiHandLandmarks?.length) {
    rightHandResults.multiHandLandmarks.forEach((hand) => {
      hand.forEach((lm, i) => (landmarks[522 + i] = [lm.x, lm.y, lm.z]));
    });
  }

  return landmarks;
};

// -------------------------
// Dynamic MediaPipe script loader (Web Only)
// -------------------------
const loadMediapipeScripts = () => {
  return Promise.all([
    new Promise<void>((resolve) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js";
      script.onload = () => resolve();
      document.body.appendChild(script);
    }),
    new Promise<void>((resolve) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js";
      script.onload = () => resolve();
      document.body.appendChild(script);
    }),
  ]);
};

// -------------------------
// Main Component
// -------------------------
export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const router = useRouter();

  const [isFrozen, setIsFrozen] = useState(false);
  const [lastPhotoUri, setLastPhotoUri] = useState<string | null>(null);
  const [liveText, setLiveText] = useState("—");
  const [generatedSentence, setGeneratedSentence] = useState("Creating sentence...");
  const [confidence, setConfidence] = useState(0);

  const [hasGeneratedSentence, setHasGeneratedSentence] = useState(false);
  const [detectedWords, setDetectedWords] = useState<string[]>([]);
  const lastDetectedWordRef = useRef<string | null>(null);
  
  const [isAutomated, setIsAutomated] = useState(false);

  const isRunningRef = useRef(true);
  const lastFrameLandmarksRef = useRef<number[][] | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const holisticRef = useRef<any>(null);
  const cameraUtilsRef = useRef<any>(null);
  const hasInitializedHolisticRef = useRef(false);
  const hasGeneratedSentenceRef = useRef(false);
  const ignoreUntilSignChangeRef = useRef(false);
  const lastSentWordRef = useRef<string | null>(null);
  const lockedWordRef = useRef<string | null>(null);

  // -------------------------
  // WebSocket
  // -------------------------
  useEffect(() => {
    wsRef.current = new WebSocket("ws://192.168.1.175:8000/ws");

    wsRef.current.onopen = () => console.log("WebSocket connected");
    wsRef.current.onclose = () => console.log("WebSocket disconnected");

    wsRef.current.onmessage = (event) => {
      const data: WSData = JSON.parse(event.data);

      if (data.current_sign) {

        const word = data.current_sign.trim();

        // 1️⃣ Ignore locked word until a new one is detected
        if (lockedWordRef.current) {
          if (word === lockedWordRef.current) {
            // still the locked word, ignore this frame visually and for detection
            setLiveText("—"); // 🔹 show dash instead of repeating locked word
            return;
          } else {
            // new word detected → release lock
            lockedWordRef.current = null;
          }
        }

        // 2️⃣ Normal detection
        if (!hasGeneratedSentenceRef.current && word) {
          if (word !== lastDetectedWordRef.current) {
            setDetectedWords((prev) => [...prev, word]);
            lastDetectedWordRef.current = word;
          }
        }

        // 3️⃣ Always update liveText to show current sign unless it’s locked
        // 3️⃣ Only update liveText when running
        if (isRunningRef.current && !isFrozen) {
          setLiveText(word);
        } else {
          setLiveText("—");
        }
      }


      if (data.confidence !== null) setConfidence(data.confidence);
      if (data.generated_sentence) setGeneratedSentence(data.generated_sentence);
    };




    return () => wsRef.current?.close();
  }, []);

  const sendLandmarks = (landmarks: number[][], generateSentence = false) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ landmarks, generate_sentence: generateSentence }));
    console.log("Landmarks sent to server (first landmark):", landmarks[0]);
  };

  // -------------------------
  // Web: Initialize Holistic
  // -------------------------
  useEffect(() => {
    if (
      !permission?.granted ||
      Platform.OS !== "web" ||
      hasInitializedHolisticRef.current
    ) return;

    hasInitializedHolisticRef.current = true;

    const initWebHolistic = async () => {
      await loadMediapipeScripts();

      const HolisticConstructor = (window as any).Holistic;
      const CameraConstructor = (window as any).Camera;

      holisticRef.current = new HolisticConstructor({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
      });

      holisticRef.current.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        refineFaceLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      holisticRef.current.onResults((results: any) => {
        console.log("Holistic frame results:", results); // Are landmarks detected?

        if (!isRunningRef.current) return;

        const landmarks = extract543Landmarks(
          results.faceLandmarks ? { multiFaceLandmarks: [results.faceLandmarks] } : null,
          results.leftHandLandmarks ? { multiHandLandmarks: [results.leftHandLandmarks] } : null,
          results.rightHandLandmarks ? { multiHandLandmarks: [results.rightHandLandmarks] } : null,
          results.poseLandmarks ? { poseLandmarks: results.poseLandmarks } : null
        );

        console.log("Extracted landmarks (first 5):", landmarks.slice(0, 5));
        lastFrameLandmarksRef.current = landmarks;
        sendLandmarks(landmarks);
      });


      if (videoRef.current) {
        cameraUtilsRef.current = new CameraConstructor(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current) await holisticRef.current.send({ image: videoRef.current });
          },
          width: 640,
          height: 480,
        });
        cameraUtilsRef.current.start();
      }
    };

    initWebHolistic();
  }, [permission?.granted]);

  // -------------------------
  // Mobile capture loop
  // -------------------------
  useEffect(() => {
    if (!permission?.granted || Platform.OS === "web") return;

    let isCancelled = false;

    const loop = async () => {
      if (isCancelled || !isRunningRef.current) return;

      try {
        const photo = await cameraRef.current?.takePictureAsync({ base64: true });
        if (photo?.base64) {
          wsRef.current?.send(JSON.stringify({ image: photo.base64 }));
          console.log("Mobile frame sent to server");
        }
      } catch (err) {
        console.error("Error capturing frame:", err);
      }

      setTimeout(loop, 100);
    };

    loop();
    return () => { isCancelled = true; };
  }, [permission?.granted]);
  
  // -------------------------
  // Toggle button
  // -------------------------
  useEffect(() => {
    const loadAutomatedState = async () => {
      try {
        const savedState = await AsyncStorage.getItem('isAutomated');
        if (savedState !== null) {
          setIsAutomated(JSON.parse(savedState));  // Set the initial toggle state
        }
      } catch (error) {
        console.error("Error loading automated state from AsyncStorage", error);
      }
    };
    
    loadAutomatedState();
  }, []);
  
  // -------------------------
  // Pause / Resume
  // -------------------------
  const handlePause = async () => {
    if (isFrozen) {
      setIsFrozen(false);
      setLastPhotoUri(null);
      isRunningRef.current = true;
      return;
    }

    setIsFrozen(true);
    isRunningRef.current = false;

    if (Platform.OS !== "web" && cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ base64: true });
        setLastPhotoUri(photo.uri);
      } catch (err) {
        console.error(err);
        setIsFrozen(false);
        isRunningRef.current = true;
      }
    }
  };

  const handleGenerateSentence = () => {
    if (!lastFrameLandmarksRef.current) return;

    setHasGeneratedSentence(true);
    hasGeneratedSentenceRef.current = true;
    setDetectedWords([]); 
    // DO NOT reset lastDetectedWordRef
    setLiveText("—"); // 🔹 clear live detection visually

    sendLandmarks(lastFrameLandmarksRef.current, true);
  };

  const handleSendToOutput = () => {
    const lastWord = detectedWords[detectedWords.length - 1] || liveText;

    // 🔒 lock last word so it doesn’t reappear immediately
    if (lastWord && lastWord !== "—") {
      lockedWordRef.current = lastWord;
    }

    const finalText = (generatedSentence || lastWord || "—").trim();

    // 🧹 clear interpreter state
    handleClear();

    // ➜ navigate after clearing
    router.push({
      pathname: "/output",
      params: { text: finalText },
    });
  };

  const handleClear = () => {
    // 🔒 lock whatever word is currently being detected
    if (liveText && liveText !== "—") {
      lockedWordRef.current = liveText;
    }

    hasGeneratedSentenceRef.current = false;

    setLiveText("—");
    setGeneratedSentence("Waiting for input...");
    setConfidence(0);

    setHasGeneratedSentence(false);
    setDetectedWords([]);
    lastDetectedWordRef.current = null;
  };

  // -------------------------
  // Render
  // -------------------------
  if (!permission) return (
    <View style={styles.center}>
      <Text style={styles.text}>Checking camera permissions…</Text>
    </View>
  );

  if (!permission.granted) return (
    <View style={styles.center}>
      <Text style={styles.text}>We need your permission to use the camera.</Text>
      <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
        <Text style={styles.primaryBtnText}>Grant Permission</Text>
      </TouchableOpacity>
    </View>
  );
  return (
    <View style={styles.container}>
      <View style={styles.cameraWrap}>
        {/* Camera view */}
        {Platform.OS === "web" ? (
          <video ref={videoRef} autoPlay style={styles.camera} />
        ) : (
          <CameraView ref={cameraRef} style={styles.camera} facing="front" />
        )}

        {/* Overlay "PAUSED" text if paused */}
        {isFrozen && (
          <View style={styles.pausedOverlay}>
            <Text style={styles.pausedText}>PAUSED</Text>
          </View>
        )}
      </View>

      <View style={styles.overlayTop}>
        <Text style={styles.overlayTitle}>Live Interpreter</Text>
        
        {/* Home Icon Button */}
        <TouchableOpacity style={styles.homeButton} onPress={() => router.push('/')}>
          <Ionicons name="home" size={28} color="white" /> {/* Home icon */}
        </TouchableOpacity>
      </View>

      {/* Image of the paused frame */}
      {lastPhotoUri && (
        <View style={styles.thumb}>
          <Image source={{ uri: lastPhotoUri }} style={styles.thumbImg} />
          <Text style={styles.thumbLabel}>Paused</Text>
        </View>
      )}

      {/* Transcript and controls */}
      <View style={styles.panel}>
        <View style={styles.rowBetween}>
          <Text style={styles.panelTitle}>Transcript</Text>
          <TouchableOpacity onPress={handleClear}>
            <Text style={styles.link}>Clear</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.transcriptBox}>
          <Text style={styles.label}>LIVE DETECTION</Text>
          <Text style={styles.liveText}>{liveText || "—"}</Text>
          <View style={styles.divider} />
          <Text style={styles.label}>
            {hasGeneratedSentence ? "GENERATED SENTENCE" : "INDIVIDUAL WORDS"}
          </Text>

          <Text style={styles.stableText}>
            {hasGeneratedSentence
              ? generatedSentence || "Waiting for a confident phrase…"
              : detectedWords.length
                ? detectedWords.join(" ")
                : "—"}
          </Text>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity style={[styles.smallBtn, isFrozen && styles.smallBtnOff]} onPress={handlePause}>
            <Text style={styles.smallBtnText}>{isFrozen ? "Resume" : "Pause"}</Text>
          </TouchableOpacity>

          {/* Conditionally render the Generate Sentence button if not automated */}
          {!isAutomated && (
            <TouchableOpacity style={styles.smallBtn} onPress={handleGenerateSentence}>
              <Text style={styles.smallBtnText}>Generate Sentence</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Send to Speech button */}
        {isAutomated ? (
          <TouchableOpacity style={styles.primaryCta} onPress={handleGenerateSentence}>
            <Text style={styles.primaryCtaText}>Generate Sentence and Speak ➜</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.primaryCta} onPress={handleSendToOutput}>
            <Text style={styles.primaryCtaText}>Send to Speech ➜</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
// -------------------------
// Styles (don't change)
// -------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050b18",
  },
  cameraWrap: {
    flex: 1,
    marginBottom: -20,  // Remove or reduce margin to decrease space between feed and transcript
  },
  panel: {
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginTop: -70,  // Reduce or remove top margin to decrease space between camera feed and transcript
  },
  center: { flex: 1, backgroundColor: "#050b18", alignItems: "center", justifyContent: "center", padding: 20 },
  text: { color: "white", fontSize: 16, textAlign: "center" },
  camera: { flex: 1 },
  overlayTop: { position: "absolute", top: 48, left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  overlayTitle: { color: "white", fontSize: 16, fontWeight: "800" },
  pill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  pillText: { color: "white", fontSize: 12, fontWeight: "700" },
  pillGood: { backgroundColor: "rgba(34,197,94,0.18)", borderColor: "rgba(34,197,94,0.35)" },
  pillMid: { backgroundColor: "rgba(245,158,11,0.18)", borderColor: "rgba(245,158,11,0.35)" },
  pillBad: { backgroundColor: "rgba(239,68,68,0.18)", borderColor: "rgba(239,68,68,0.35)" },
    pausedOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10, // Make sure it overlays the camera feed
  },
  pausedText: {
    color: "red",
    fontSize: 90,
    fontWeight: "bold",
    transform: [{ rotate: "-30deg" }], // Rotate the text diagonally
    letterSpacing: 4,
  },
  homeButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  homeButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  guideBox: { position: "absolute", left: 18, right: 18, top: "35%", height: 220, borderRadius: 22, borderWidth: 2, borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(0,0,0,0.10)", justifyContent: "flex-end", padding: 10 },
  guideText: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "600" },
  thumb: { position: "absolute", top: 92, right: 16, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 14, padding: 8, alignItems: "center" },
  thumbImg: { width: 64, height: 86, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  thumbLabel: { marginTop: 6, color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "700" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  panelTitle: { color: "white", fontSize: 16, fontWeight: "800" },
  link: { color: "rgba(255,255,255,0.75)", fontWeight: "700" },
  transcriptBox: { marginTop: 10, backgroundColor: "rgba(0,0,0,0.28)", borderRadius: 16, padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  label: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  liveText: { color: "white", fontSize: 18, fontWeight: "800", marginTop: 6 },
  stableText: { color: "rgba(255,255,255,0.9)", fontSize: 16, fontWeight: "700", marginTop: 6 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.10)", marginVertical: 10 },
  controls: { flexDirection: "row", gap: 10, marginTop: 12 },
  smallBtn: { flex: 1, paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignItems: "center" },
  smallBtnOff: { opacity: 0.75 },
  smallBtnText: { color: "white", fontWeight: "800", fontSize: 13 },
  primaryCta: { marginTop: 12, paddingVertical: 12, borderRadius: 16, backgroundColor: "#22c55e", alignItems: "center" },
  primaryCtaText: { color: "white", fontWeight: "900", fontSize: 14 },
  primaryBtn: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: "#22c55e", borderRadius: 999 },
  primaryBtnText: { color: "white", fontWeight: "800" },
});
