import { Stack } from "expo-router";

export default function Layout() {
  // Simple layout: just show whatever is in index.tsx
  return <Stack screenOptions={{ headerShown: false }} />;
  
}
