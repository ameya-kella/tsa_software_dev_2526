import{useEffect,useRef,useState}from"react";
import{View,Text,TouchableOpacity,StyleSheet,Image}from"react-native";
import{CameraView,useCameraPermissions}from"expo-camera";
import{useRouter}from"expo-router";

//shows what the ml model will give us back
//liveText =changing sentence while signing
//stableText=final sentence that is confirmed by user
//confidence = how accuracte the model is
type ModelResult={
  liveText:string;
  stableText:string;
  confidence:number;//this also from 0-1 range
};

export default function CameraScreen(){
  const[permission,requestPermission]=useCameraPermissions();
  const cameraRef=useRef<CameraView|null>(null);
  const router=useRouter();


  const[isRunning,setIsRunning]=useState(true);
  const[isFrozen,setIsFrozen]=useState(false);//this is like when the signer is done
  const[lastPhotoUri,setLastPhotoUri]=useState<string|null>(null);
  //the line above saves the image when user freezes it to confirm that live text is correct before finalizing


  const[liveText,setLiveText]=useState("—");//what the model thinks the sentence is when live
  const[stableText,setStableText]=useState("");//the final sentence after signer confirming
  const[confidence,setConfidence]=useState(0.0);//model accuracy


  useEffect(()=>{
    if(!isRunning||isFrozen)return;
//when paused/frozen model isnt doing anything
//this is just random sample-> replace this with real ml
    const samples:ModelResult[]=[
      {liveText:"HELLO",stableText:"",confidence:0.62},
      {liveText:"HELLO HOW",stableText:"HELLO",confidence:0.74},
      {liveText:"HELLO HOW ARE",stableText:"HELLO HOW",confidence:0.78},
      {liveText:"HELLO HOW ARE YOU",stableText:"HELLO HOW ARE YOU",confidence:0.86},
    ];

    let i=0;
    // this is update the sentence like a real model would
    const id=setInterval(()=>{
      const r=samples[i%samples.length];
      //what user will see
      setLiveText(r.liveText);
      setStableText(r.stableText);
      setConfidence(r.confidence);
      i++;
    },900);

    return()=>clearInterval(id);
  },[isRunning,isFrozen]);

//confidence label-> monitiring the accuracy
  const confidenceLabel =
    confidence >= 0.8 ? "High" : confidence >= 0.6 ? "Medium" : "Low";
  const confidencePillStyle =
    confidence >= 0.8 ? styles.pillGood : confidence >= 0.6 ? styles.pillMid : styles.pillBad;
const handlePause = async () => {
  if (!cameraRef.current) return;

  // if paused, resume
  if (isFrozen) {
    setIsFrozen(false);
    setIsRunning(true);
    setLastPhotoUri(null);
    return;
  }

  // if running, pause
  try {
    setIsRunning(false);
    setIsFrozen(true);
    const photo = await cameraRef.current.takePictureAsync({ base64: false });//taking a picture for feedback
    setLastPhotoUri(photo.uri);
  } catch (err) {
    console.error("Error pausing frame:", err);
    setIsFrozen(false);
  }
};


//asl user will confirm that their snetence produced from model is correct
  const handleConfirm=()=>{
    const confirmed=(stableText||liveText||"").trim();
    if(!confirmed)return;
    setStableText(confirmed);
  };
//send final sentence to output screen for text to speech
  const handleSendToOutput=()=>{
    const finalText=(stableText||liveText||"—").trim();
    router.push({
      pathname:"/output",
      params:{text:finalText},
    });
  };
//workig to clear everything(idk if needed)
  const handleClear=()=>{
    setLiveText("—");
    setStableText("");
    setConfidence(0);
  };


  
  let content = null;
//enable user persmission 
  if (!permission) {
    content = (
      <View style={styles.center}>
        <Text style={styles.text}>Checking camera permissions…</Text>
      </View>
    );
  } else if (!permission.granted) {
    content = (
      <View style={styles.center}>
        <Text style={styles.text}>We need your permission to use the camera.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  } else {
    content = (
      <View style={styles.container}>

        <View style={styles.cameraWrap}>
          <CameraView ref={cameraRef} style={styles.camera} facing="front" />

          <View style={styles.overlayTop}>
            <Text style={styles.overlayTitle}>Live Interpreter</Text>
            <View style={[styles.pill, confidencePillStyle]}>
              <Text style={styles.pillText}>
                {confidenceLabel} • {Math.round(confidence * 100)}%
              </Text>
            </View>
          </View>

          <View style={styles.guideBox}>
            <Text style={styles.guideText}>
              {isFrozen ? "Frozen frame (confirm translation)" : "Keep hands inside the box"}
            </Text>
          </View>

          {lastPhotoUri && (
            <View style={styles.thumb}>
              <Image source={{ uri: lastPhotoUri }} style={styles.thumbImg} />
              <Text style={styles.thumbLabel}>Paused</Text>
            </View>
          )}
        </View>


        <View style={styles.panel}>
          <View style={styles.rowBetween}>
            <Text style={styles.panelTitle}>Transcript</Text>
            <TouchableOpacity onPress={handleClear}>
              <Text style={styles.link}>Clear</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.transcriptBox}>
            <Text style={styles.label}>LIVE</Text>
            <Text style={styles.liveText}>{liveText || "—"}</Text>

            <View style={styles.divider} />

            <Text style={styles.label}>STABLE</Text>
            <Text style={styles.stableText}>
              {stableText ? stableText : "Waiting for a confident phrase…"}
            </Text>
          </View>
<View style={styles.controls}>
<TouchableOpacity
  style={[styles.smallBtn,isFrozen&&styles.smallBtnOff]}
  onPress={handlePause}
>
  <Text style={styles.smallBtnText}>
    {isFrozen ? "Resume" : "Pause"}
  </Text>
</TouchableOpacity>


  <TouchableOpacity
    style={[styles.smallBtn,!isFrozen&&styles.smallBtnDisabled]}
    onPress={handleConfirm}
    disabled={!isFrozen}
  >
    <Text style={styles.smallBtnText}>Confirm</Text>
  </TouchableOpacity>
</View>


          <TouchableOpacity style={styles.primaryCta} onPress={handleSendToOutput}>
            <Text style={styles.primaryCtaText}>Send to Speech ➜</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050b18" },
  center: {
    flex: 1, backgroundColor: "#050b18", alignItems: "center", justifyContent: "center", padding: 20,
  },
  text: { color: "white", fontSize: 16, textAlign: "center" },

  cameraWrap: { flex: 1 },
  camera: { flex: 1 },

  overlayTop: {
    position: "absolute", top: 48, left: 16, right: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  overlayTitle: { color: "white", fontSize: 16, fontWeight: "800" },

  pill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  pillText: { color: "white", fontSize: 12, fontWeight: "700" },
  pillGood: { backgroundColor: "rgba(34,197,94,0.18)", borderColor: "rgba(34,197,94,0.35)" },
  pillMid: { backgroundColor: "rgba(245,158,11,0.18)", borderColor: "rgba(245,158,11,0.35)" },
  pillBad: { backgroundColor: "rgba(239,68,68,0.18)", borderColor: "rgba(239,68,68,0.35)" },

  guideBox: {
    position: "absolute",
    left: 18,
    right: 18,
    top: "35%",
    height: 220,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(0,0,0,0.10)",
    justifyContent: "flex-end",
    padding: 10,
  },
  guideText: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "600" },

  thumb: {
    position: "absolute", top: 92, right: 16,
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 14, padding: 8, alignItems: "center",
  },
  thumbImg: { width: 64, height: 86, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  thumbLabel: { marginTop: 6, color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "700" },

  panel: {
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  panelTitle: { color: "white", fontSize: 16, fontWeight: "800" },
  link: { color: "rgba(255,255,255,0.75)", fontWeight: "700" },

  transcriptBox: {
    marginTop: 10,
    backgroundColor: "rgba(0,0,0,0.28)",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  label: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  liveText: { color: "white", fontSize: 18, fontWeight: "800", marginTop: 6 },
  stableText: { color: "rgba(255,255,255,0.9)", fontSize: 16, fontWeight: "700", marginTop: 6 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.10)", marginVertical: 10 },

  controls: { flexDirection: "row", gap: 10, marginTop: 12 },
  smallBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
  },
  smallBtnOff: { opacity: 0.75 },
  smallBtnDisabled: { opacity: 0.4 },
  smallBtnText: { color: "white", fontWeight: "800", fontSize: 13 },

  primaryCta: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "#22c55e",
    alignItems: "center",
  },
  primaryCtaText: { color: "white", fontWeight: "900", fontSize: 14 },

  primaryBtn: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "#22c55e",
    borderRadius: 999,
  },
  primaryBtnText: { color: "white", fontWeight: "800" },
});
