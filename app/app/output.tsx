import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Link } from "expo-router";

export default function OutputScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Detected ASL Sign</Text>

      <View style={styles.outputBox}>
        <Text style={styles.outputText}>r</Text>
        <Text style={styles.hint}>placeholder</Text>
      </View>

      <Link href="/" asChild>
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Back to Home</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center",
    backgroundColor: "#111"
  },
  title: { 
    fontSize: 28, 
    fontWeight: "bold",
    color: "white",
    marginBottom: 30
  },
  outputBox: {
    width: 200,
    height: 200,
    backgroundColor: "#222",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 30
  },
  outputText: { fontSize: 80, color: "white" },
  hint: { color: "white", opacity: 0.6, marginTop: 10 },
  button: { 
    padding: 15, 
    backgroundColor: "#4CAF50", 
    borderRadius: 12 
  },
  buttonText: { color: "white", fontSize: 18 }
});
