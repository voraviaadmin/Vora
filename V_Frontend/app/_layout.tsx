import React, { useState } from "react";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { View, Text, ActivityIndicator } from "react-native";
import { useModeGate } from "../src/hooks/use-mode-gate";
// ✅ Root provider so BOTH /(tabs) and /scan routes can read Mode
import { ModeProvider } from "../src/state/mode";

function BootScreen({ message }: { message: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator />
      <Text style={{ marginTop: 12 }}>{message}</Text>
    </View>
  );
}


function AppShell() {
  const { ready } = useModeGate(); // now it's inside ModeProvider ✅

  if (!ready) {
    return <BootScreen message="Starting Voravia…" />;
  }

  return (
    <Stack>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
  </Stack>
  );
}


export default function RootLayout() {
    // create once per app session
    const [queryClient] = useState(
      () =>
        new QueryClient({
          defaultOptions: {
            queries: {
              retry: 1,
              staleTime: 15_000,
              gcTime: 5 * 60_000,
              refetchOnWindowFocus: false,
            },
          },
        })
    );
  return (
    <QueryClientProvider client={queryClient}>
    <ModeProvider>
      <AppShell />
    </ModeProvider>
    </QueryClientProvider>
  );
}