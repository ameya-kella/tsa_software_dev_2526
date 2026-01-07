import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Link } from "expo-router";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ASL Translator</Text>

      <Link href="/camera" asChild>
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>open Camera</Text>
        </TouchableOpacity>
      </Link>

      <Link href="/output" asChild>
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>idk</Text>
        </TouchableOpacity>
      </Link>

      <TouchableOpacity style={styles.secondaryButton}>
        <Text style={styles.secondaryText}>ur mom</Text>
      </TouchableOpacity>
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
    fontSize: 32, 
    fontWeight: "bold",
    color: "white",
    marginBottom: 40
  },
  button: {
    width: 250,
    padding: 20,
    backgroundColor: "#4CAF50",
    borderRadius: 12,
    marginBottom: 20
  },
  buttonText: { 
    fontSize: 18, 
    textAlign: "center",
    fontWeight: "600",
    color: "white"
  },
  secondaryButton: {
    marginTop: 20,
  },
  secondaryText: {
    color: "white",
    opacity: 0.6
  }
});
