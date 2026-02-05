import React from "react";
import { Tabs } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ModeProvider } from "../../src/state/mode";
import { UI } from "../../src/theme/ui";
import { IconSymbol } from "../../components/ui/icon-symbol";

export default function TabsLayout() {
  const bg = UI.colors.bg;

  return (
    
      <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={["top", "bottom"]}>
        <StatusBar style="light" />

        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: bg,
              borderTopColor: UI.colors.cardBorder,
              borderTopWidth: 1,
              height: 58,
              paddingBottom: 4,
              paddingTop: 6,
            },
            tabBarActiveTintColor: UI.colors.primary.teal,
            tabBarInactiveTintColor: UI.colors.textMuted,
          }}
        >
          <Tabs.Screen name="index" options={{ title: "Home",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />, }} />

          <Tabs.Screen name="scan" options={{ title: "Scan",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="camera.fill" color={color} />, }} />

          <Tabs.Screen name="eat-out" options={{ title: "Eat Out",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="fork.knife" color={color} />, }} />

          <Tabs.Screen name="groups" options={{ title: "Groups",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.2.fill" color={color} />, }} />

          <Tabs.Screen name="logs" options={{ title: "Log",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="list.bullet" color={color} />, }} />

          <Tabs.Screen name="profile" options={{ title: "Profile",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.crop.circle.fill" color={color} />, }} />
        </Tabs>
      </SafeAreaView>
    
  );
}