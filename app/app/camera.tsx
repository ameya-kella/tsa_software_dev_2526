import { useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [lastPhotoUri, setLastPhotoUri] = useState<string | null>(null);
  const router = useRouter();

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Checking camera permissions…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>
          We need your permission to use the camera.
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleCaptureFrame = async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: false,
      });

      console.log("Captured photo:", photo);
      setLastPhotoUri(photo.uri);
      // later: send this photo (or multiple) to backend
    } catch (err) {
      console.error("Error capturing photo:", err);
    }
  };

  const handleTranslateSign = () => {
    // 👉 later this will call backend and use real model output
    const fakeRecognizedText = "HELLO, HOW ARE YOU?";

    router.push({
      pathname: "/output",
      params: { text: fakeRecognizedText },
    });
  };

  return (
    <View style={styles.container}>
      {/* Live "webcam" */}
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="front"
      />

      {/* Thumbnail of last captured frame (optional proof) */}
      {lastPhotoUri && (
        <View style={styles.thumbnailContainer}>
          <Text style={styles.thumbnailLabel}>Last captured frame:</Text>
          <Image source={{ uri: lastPhotoUri }} style={styles.thumbnail} />
        </View>
      )}

      {/* Controls */}
      <View style={styles.bottomBar}>
        <Text style={styles.infoText}>Live ASL Camera</Text>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.smallButton]}
            onPress={handleCaptureFrame}
          >
            <Text style={styles.smallText}>Save Frame</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.translateButton}
            onPress={handleTranslateSign}
          >
            <Text style={styles.translateText}>Translate Sign ➜</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  center: {
    flex: 1,
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  text: { color: "white", fontSize: 16, textAlign: "center" },
  button: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "#22c55e",
    borderRadius: 999,
  },
  buttonText: { color: "white", fontWeight: "600" },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    backgroundColor: "rgba(15,23,42,0.95)",
    gap: 8,
  },
  infoText: { color: "#e5e7eb", fontSize: 14, textAlign: "center" },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  smallButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#4b5563",
    alignItems: "center",
  },
  smallText: { color: "white", fontSize: 14, fontWeight: "500" },
  translateButton: {
    flex: 1.4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#22c55e",
    alignItems: "center",
  },
  translateText: { color: "white", fontSize: 14, fontWeight: "700" },
  thumbnailContainer: {
    position: "absolute",
    top: 40,
    right: 16,
    backgroundColor: "rgba(15,23,42,0.85)",
    padding: 8,
    borderRadius: 12,
    alignItems: "center",
  },
  thumbnailLabel: {
    color: "#e5e7eb",
    fontSize: 10,
    marginBottom: 4,
  },
  thumbnail: {
    width: 60,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#4b5563",
  },
});
