import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Header, Screen, useTheme } from "@/components/ui";
import { webUrl } from "@/lib/api";

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const isDark = mode === "dark";

  return (
    <Screen>
      <Header title="Settings" subtitle="Choose your app appearance and get support." />

      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.text }]}>Appearance</Text>
        <View style={[styles.segment, { backgroundColor: colors.surfaceMid }]}>
          <Pressable
            onPress={() => setMode("light")}
            style={[styles.segmentButton, !isDark && { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.segmentText, { color: !isDark ? colors.onPrimary : colors.muted }]}>Light</Text>
          </Pressable>
          <Pressable
            onPress={() => setMode("dark")}
            style={[styles.segmentButton, isDark && { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.segmentText, { color: isDark ? colors.onPrimary : colors.muted }]}>Dark</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.actions}>
        <SettingsLink label="Contact support" onPress={() => Linking.openURL("mailto:inquiry@scribblapp.ca")} />
        <SettingsLink label="Terms and conditions" onPress={() => Linking.openURL(webUrl("/terms"))} />
      </View>
    </Screen>
  );
}

function SettingsLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.linkButton,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.72 : 1 },
      ]}
    >
      <Text style={[styles.linkText, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.linkArrow, { color: colors.secondary }]}>Open</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 12,
  },
  segment: {
    borderRadius: 8,
    flexDirection: "row",
    gap: 4,
    padding: 4,
  },
  segmentButton: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    paddingVertical: 11,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "900",
  },
  actions: {
    gap: 10,
    marginTop: 16,
  },
  linkButton: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
  },
  linkText: {
    fontSize: 16,
    fontWeight: "800",
  },
  linkArrow: {
    fontSize: 13,
    fontWeight: "900",
  },
});
