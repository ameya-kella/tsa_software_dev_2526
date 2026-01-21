import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Switch } from "react-native";
import { Link } from "expo-router";
import AsyncStorage from '@react-native-async-storage/async-storage';


export default function HomeScreen() {
  const [isAutomated, setIsAutomated] = useState(false); // State to control the toggle

  // Toggle handler
  const toggleSwitch = async () => {
    const newState = !isAutomated;
    setIsAutomated(newState);
    
    // Save the new state to AsyncStorage
    await AsyncStorage.setItem('isAutomated', JSON.stringify(newState));
  };
  useEffect(() => {
    const loadState = async () => {
      try {
        const savedState = await AsyncStorage.getItem('isAutomated');
        if (savedState !== null) {
          setIsAutomated(JSON.parse(savedState)); // If saved, set it as the current state
        }
      } catch (error) {
        console.error("Error loading state from AsyncStorage", error);
      }
    };

    loadState();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>****title****</Text>
        <Text style={styles.subtitle}>
          Real-time accessibility for deaf and ASL speakers in everyday life.
        </Text>
      </View>

      <View style={styles.cardGrid}>
        <Link href="/camera" asChild>
          <TouchableOpacity style={styles.card}>
            <Text style={styles.cardTitle}>Live Interpreter</Text>
            <Text style={styles.cardDesc}>ASL → Text → Speech</Text>
            <Text style={styles.cardFoot}>Removing barriers: live ASL translated into spoken sentences in real time.</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/camera" asChild>
          <TouchableOpacity style={styles.card}>
            <Text style={styles.cardTitle}>Live Conversation</Text>
            <Text style={styles.cardDesc}>Interpreter + Speech-to-Text</Text>
            <Text style={styles.cardFoot}>Bridging the gap: seamless communication between deaf and non-ASL speakers.</Text>
          </TouchableOpacity>
        </Link>
      </View>

      <View style={styles.footer}>
        <View style={styles.footerContent}>
          <Text style={styles.footerText}>Automate Send to Speech?</Text>
          <Switch
            value={isAutomated}
            onValueChange={toggleSwitch}
            trackColor={{ false: "#767577", true: "#81b0ff" }}
            thumbColor={isAutomated ? "#f5dd4b" : "#f4f3f4"}
          />
        </View>
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
  footer: { paddingBottom: 18, justifyContent: "center" },
  footerContent: {
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "center", 
    gap: 12,  // Adds space between the text and the switch
  },
  footerText: { color: "rgba(255,255,255,0.75)", fontSize: 14 },
});