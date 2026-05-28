import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ErrorState, LogoMark, Screen, colors, fonts, useTheme } from "@/components/ui";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type AuthMode = "signin" | "signup";

export default function LoginScreen() {
  const { colors: themeColors } = useTheme();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/dashboard");
      }
    });
  }, []);

  async function signIn() {
    if (!supabase) return;

    setLoading(true);
    setError("");
    setMessage("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace("/dashboard");
  }

  async function signUp() {
    if (!supabase) return;

    setLoading(true);
    setError("");
    setMessage("");
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const cleanDisplayName = displayName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const fallbackName = [cleanFirstName, cleanLastName].filter(Boolean).join(" ") || cleanDisplayName || cleanEmail.split("@")[0];

    const { error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          first_name: cleanFirstName,
          last_name: cleanLastName,
          display_name: cleanDisplayName || fallbackName,
          full_name: fallbackName,
        },
      },
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setMessage("Check your email to confirm your account.");
    setMode("signin");
  }

  if (!isSupabaseConfigured || !supabase) {
    return (
      <Screen>
        <ErrorState message="Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY." />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={local.loginScroll}>
        <View style={local.loginCenter}>
          <View style={local.loginHero}>
            <LogoMark />
            <Text style={local.loginTitle}>One workspace for every working session.</Text>
            <Text style={local.loginSubtitle}>Notes, chat, meetings, files, and session context in one mobile place.</Text>
          </View>

          <View style={[local.authTabs, { backgroundColor: themeColors.surfaceMid, borderColor: themeColors.border }]}>
            <AuthTab active={mode === "signin"} label="Sign in" onPress={() => setMode("signin")} />
            <AuthTab active={mode === "signup"} label="Create account" onPress={() => setMode("signup")} />
          </View>

          <View style={local.form}>
            {mode === "signup" ? (
              <>
                <View style={local.nameGrid}>
                  <TextInput
                    autoComplete="given-name"
                    onChangeText={setFirstName}
                    placeholder="First name"
                    placeholderTextColor={themeColors.muted}
                    style={[local.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
                    value={firstName}
                  />
                  <TextInput
                    autoComplete="family-name"
                    onChangeText={setLastName}
                    placeholder="Last name"
                    placeholderTextColor={themeColors.muted}
                    style={[local.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
                    value={lastName}
                  />
                </View>
                <TextInput
                  autoComplete="nickname"
                  onChangeText={setDisplayName}
                  placeholder="Display name"
                  placeholderTextColor={themeColors.muted}
                  style={[local.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
                  value={displayName}
                />
              </>
            ) : null}

            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={themeColors.muted}
              style={[local.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
              value={email}
            />
            <TextInput
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={themeColors.muted}
              secureTextEntry
              style={[local.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
              value={password}
            />
            {error ? <ErrorState message={error} /> : null}
            {message ? <Text style={[local.successMessage, { color: themeColors.success, backgroundColor: themeColors.successDim }]}>{message}</Text> : null}
            <Pressable
              disabled={loading}
              onPress={mode === "signup" ? signUp : signIn}
              style={({ pressed }) => [local.primaryButton, { backgroundColor: themeColors.primary }, pressed && local.pressed]}
            >
              <Text style={local.primaryButtonText}>
                {loading ? (mode === "signup" ? "Creating account..." : "Signing in...") : (mode === "signup" ? "Create account" : "Sign in")}
              </Text>
            </Pressable>
          </View>
        </View>
        <Text style={[local.copyright, { color: themeColors.subtle }]}>© 2026 Scribbl. All rights reserved.</Text>
      </ScrollView>
    </Screen>
  );
}

function AuthTab({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const { colors: themeColors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[local.authTab, { backgroundColor: active ? themeColors.primary : "transparent" }]}
    >
      <Text style={[local.authTabText, { color: active ? themeColors.onPrimary : themeColors.muted }]}>{label}</Text>
    </Pressable>
  );
}

const local = StyleSheet.create({
  loginScroll: {
    flexGrow: 1,
    paddingBottom: 18,
  },
  loginCenter: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: 16,
  },
  loginHero: {
    alignItems: "center",
    backgroundColor: colors.live,
    borderRadius: 8,
    marginBottom: 14,
    overflow: "hidden",
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  loginTitle: {
    color: colors.onPrimary,
    fontFamily: fonts.displayBlack,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 38,
    textAlign: "center",
  },
  loginSubtitle: {
    color: "rgba(255,255,255,0.82)",
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 14,
    textAlign: "center",
  },
  authTabs: {
    backgroundColor: colors.surfaceMid,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    marginBottom: 12,
    padding: 4,
  },
  authTab: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    paddingVertical: 11,
  },
  authTabText: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    fontWeight: "900",
  },
  form: {
    gap: 12,
  },
  nameGrid: {
    flexDirection: "row",
    gap: 10,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  pressed: {
    opacity: 0.72,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: colors.onPrimary,
    fontFamily: fonts.sansBold,
    fontSize: 16,
    fontWeight: "800",
  },
  successMessage: {
    borderRadius: 8,
    fontFamily: fonts.sansBold,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    padding: 12,
  },
  copyright: {
    fontFamily: fonts.sansBold,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 18,
    textAlign: "center",
  },
});
