import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useEffect, useState } from "react";
import type { ColorValue } from "react-native";
import { fonts, useTheme } from "@/components/ui";
import { supabase } from "@/lib/supabase";

export default function AuthenticatedTabsLayout() {
  const { colors } = useTheme();
  const [status, setStatus] = useState<"checking" | "signed-in" | "signed-out">("checking");

  useEffect(() => {
    if (!supabase) {
      setStatus("signed-out");
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? "signed-in" : "signed-out");
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? "signed-in" : "signed-out");
    });

    return () => data.subscription.unsubscribe();
  }, []);

  if (status === "checking") {
    return null;
  }

  if (status === "signed-out") {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      initialRouteName="dashboard"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.sansBold, fontSize: 12 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 78,
          paddingBottom: 14,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <TabIcon color={color} name="grid-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color, size }) => <TabIcon color={color} name="calendar-outline" size={size} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ color, name, size }: { color: ColorValue; name: keyof typeof Ionicons.glyphMap; size: number }) {
  return <Ionicons color={color} name={name} size={size} />;
}
