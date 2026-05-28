import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Header, Screen, colors, fonts, useTheme } from "@/components/ui";
import { supabase } from "@/lib/supabase";

export default function AccountMenuScreen() {
  const { colors: themeColors } = useTheme();

  async function signOut() {
    await supabase?.auth.signOut();
    router.replace("/login");
  }

  return (
    <Screen>
      <Header title="Profile" subtitle="Read-only companion app controls." />
      <View style={local.actions}>
        <MenuButton label="Account" onPress={() => router.replace("/account")} />
        <MenuButton label="Settings" onPress={() => router.replace("/settings")} />
        <Pressable
          onPress={signOut}
          style={({ pressed }) => [
            local.button,
            { backgroundColor: themeColors.dangerDim, borderColor: themeColors.danger, opacity: pressed ? 0.72 : 1 },
          ]}
        >
          <Text style={[local.buttonText, { color: themeColors.danger }]}>Sign out</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function MenuButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors: themeColors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        local.button,
        { backgroundColor: themeColors.surface, borderColor: themeColors.border, opacity: pressed ? 0.72 : 1 },
      ]}
    >
      <Text style={[local.buttonText, { color: themeColors.text }]}>{label}</Text>
      <Text style={[local.buttonMeta, { color: themeColors.secondary }]}>Open</Text>
    </Pressable>
  );
}

const local = StyleSheet.create({
  actions: {
    gap: 10,
  },
  button: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
  },
  buttonText: {
    color: colors.text,
    fontFamily: fonts.sansBold,
    fontSize: 16,
    fontWeight: "800",
  },
  buttonMeta: {
    color: colors.secondary,
    fontFamily: fonts.sansBold,
    fontSize: 13,
    fontWeight: "900",
  },
});
