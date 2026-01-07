import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Link } from "expo-router";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>title</Text>
        <Text style={styles.subtitle}>
          real-time accessibility for dead/hoh and hearing conversations.
        </Text>
      </View>

      <View style={styles.cardGrid}>
        <Link href="/camera" asChild>
          <TouchableOpacity style={styles.card}>
            <Text style={styles.cardTitle}>Live Interpreter</Text>
            <Text style={styles.cardDesc}>ASL → Text → Speech</Text>
            <Text style={styles.cardFoot}>use camera • live transcript</Text>
          </TouchableOpacity>
        </Link>

        <TouchableOpacity style={[styles.card, styles.cardDisabled]} activeOpacity={0.8}>
          <Text style={styles.cardTitle}>placeholder</Text>
          <Text style={styles.cardDesc}>idk</Text>
          <Text style={styles.cardFoot}>ur mom</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
           ensure hands are fully in frame & good lighting.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b1220", padding: 18, justifyContent: "space-between" },
  header: { paddingTop: 32 },
  title: { color: "white", fontSize: 34, fontWeight: "800", letterSpacing: 0.2 },
  subtitle: { color: "rgba(255,255,255,0.75)", marginTop: 8, fontSize: 14, lineHeight: 20, maxWidth: 320 },
  cardGrid: { gap: 14, marginTop: 18 },
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 18,
    padding: 16,
  },
  cardDisabled: { opacity: 0.55 },
  cardTitle: { color: "white", fontSize: 18, fontWeight: "800" },
  cardDesc: { color: "rgba(255,255,255,0.8)", marginTop: 6, fontSize: 14, fontWeight: "600" },
  cardFoot: { color: "rgba(255,255,255,0.55)", marginTop: 10, fontSize: 12 },
  footer: { paddingBottom: 18 },
  footerText: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
});
