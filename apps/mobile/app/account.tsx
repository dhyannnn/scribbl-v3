import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import type { MobileUser } from "@scribbl/shared";
import { CardButton, ErrorState, Header, LoadingState, Screen, colors, fonts, useTheme } from "@/components/ui";
import { getMe, webUrl } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export default function AccountScreen() {
  const { colors: themeColors } = useTheme();
  const [user, setUser] = useState<MobileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getMe()
      .then((response) => setUser(response.user))
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Could not load account.");
        void loadAuthFallback().then((fallbackUser) => setUser(fallbackUser));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <LoadingState />;
  }

  return (
    <Screen>
      <Header title="Account" subtitle="Read-only profile information from Scribbl." />
      {error ? <ErrorState message={error} /> : null}
      {user ? (
        <ScrollView contentContainerStyle={local.content}>
          <View style={[local.profileCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={[local.avatar, { backgroundColor: themeColors.secondary }]}>
              <Text style={local.avatarText}>{initialFor(user.displayName)}</Text>
            </View>
            <Text style={[local.name, { color: themeColors.text }]}>{user.displayName}</Text>
            <Text style={[local.email, { color: themeColors.muted }]}>{user.email}</Text>
          </View>

          <View style={local.fields}>
            <ReadOnlyField label="First name" value={user.firstName || "Not set"} />
            <ReadOnlyField label="Last name" value={user.lastName || "Not set"} />
            <ReadOnlyField label="Institution" value={user.institution || "Not set"} />
            <ReadOnlyField label="Role" value={user.jobTitle || "Not set"} />
            <ReadOnlyField label="Bio" value={user.bio || "Not set"} />
          </View>

          <CardButton onPress={() => router.push("/settings")}>
            <Text style={[local.actionTitle, { color: themeColors.text }]}>App settings</Text>
            <Text style={[local.actionBody, { color: themeColors.muted }]}>Theme, support, and terms.</Text>
          </CardButton>
          <CardButton onPress={() => Linking.openURL(webUrl("/account"))}>
            <Text style={[local.actionTitle, { color: themeColors.text }]}>Manage account on web</Text>
            <Text style={[local.actionBody, { color: themeColors.muted }]}>Edit profile, password, and account deletion from the web app.</Text>
          </CardButton>
        </ScrollView>
      ) : null}
    </Screen>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  const { colors: themeColors } = useTheme();

  return (
    <View style={[local.field, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
      <Text style={[local.fieldLabel, { color: themeColors.subtle }]}>{label}</Text>
      <Text style={[local.fieldValue, { color: themeColors.text }]}>{value}</Text>
    </View>
  );
}

function initialFor(displayName: string) {
  return displayName.trim().slice(0, 1).toUpperCase() || "S";
}

async function loadAuthFallback(): Promise<MobileUser | null> {
  if (!supabase) return null;

  const { data } = await supabase.auth.getUser();
  const authUser = data.user;
  const email = authUser?.email?.toLowerCase();

  if (!authUser || !email) return null;

  const metadata = authUser.user_metadata ?? {};
  const firstName = stringMetadata(metadata.first_name);
  const lastName = stringMetadata(metadata.last_name);
  const displayName =
    stringMetadata(metadata.display_name) ||
    stringMetadata(metadata.full_name) ||
    stringMetadata(metadata.name) ||
    [firstName, lastName].filter(Boolean).join(" ") ||
    email.split("@")[0];

  return {
    id: authUser.id,
    email,
    firstName,
    lastName,
    displayName,
    avatarUrl: stringMetadata(metadata.avatar_url) || null,
    institution: null,
    jobTitle: null,
    bio: null,
  };
}

function stringMetadata(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const local = StyleSheet.create({
  content: {
    gap: 10,
    paddingBottom: 32,
  },
  profileCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 20,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.secondary,
    borderRadius: 999,
    height: 62,
    justifyContent: "center",
    marginBottom: 12,
    width: 62,
  },
  avatarText: {
    color: colors.onPrimary,
    fontFamily: fonts.displayBlack,
    fontSize: 25,
    fontWeight: "900",
  },
  name: {
    color: colors.text,
    fontFamily: fonts.displayBold,
    fontSize: 22,
    fontWeight: "700",
  },
  email: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
    marginTop: 4,
  },
  fields: {
    gap: 10,
  },
  field: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  fieldLabel: {
    color: colors.subtle,
    fontFamily: fonts.monoBold,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  fieldValue: {
    color: colors.text,
    fontFamily: fonts.sansBold,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 5,
  },
  actionTitle: {
    color: colors.text,
    fontFamily: fonts.sansBold,
    fontSize: 16,
    fontWeight: "900",
  },
  actionBody: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
});
