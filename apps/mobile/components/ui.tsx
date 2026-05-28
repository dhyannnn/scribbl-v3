import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const scribblLogo = require("@/assets/scribbl-logo.png");
const themeStorageKey = "scribbl-mobile-theme";

type ThemeMode = "light" | "dark";

const lightColors = {
  bg: "#F9F9FF",
  surface: "#FFFFFF",
  surfaceLow: "#EFF4FF",
  surfaceMid: "#EDEDF4",
  surfaceHigh: "#E8E7EE",
  text: "#1A1B20",
  muted: "#45464D",
  subtle: "#7E7576",
  border: "#C6C6CD",
  borderStrong: "#9E9EA6",
  primary: "#000000",
  onPrimary: "#FFFFFF",
  secondary: "#085AC0",
  secondaryHover: "#2170E4",
  secondaryDim: "#D8E2FF",
  live: "#131B2E",
  success: "#1A6B3C",
  successDim: "#D3F0E3",
  danger: "#BA1A1A",
  dangerDim: "#FFDAD6",
};

type AppColors = typeof lightColors;

const darkColors: AppColors = {
  bg: "#111118",
  surface: "#1A1A24",
  surfaceLow: "#14141E",
  surfaceMid: "#222230",
  surfaceHigh: "#2A2A3C",
  text: "#E4E4F0",
  muted: "#9898B2",
  subtle: "#606078",
  border: "#2E2E42",
  borderStrong: "#48486A",
  primary: "#4A8EF0",
  onPrimary: "#FFFFFF",
  secondary: "#5B9CF6",
  secondaryHover: "#7AB4FF",
  secondaryDim: "#1A2D50",
  live: "#080D18",
  success: "#6BCF8F",
  successDim: "#152D1E",
  danger: "#F28B82",
  dangerDim: "#2D1515",
};

const ThemeContext = createContext<{
  colors: AppColors;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}>({
  colors: lightColors,
  mode: "light",
  setMode: () => undefined,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");

  useEffect(() => {
    AsyncStorage.getItem(themeStorageKey).then((stored) => {
      if (stored === "dark" || stored === "light") {
        setModeState(stored);
      }
    });
  }, []);

  const value = useMemo(() => {
    function setMode(nextMode: ThemeMode) {
      setModeState(nextMode);
      void AsyncStorage.setItem(themeStorageKey, nextMode);
    }

    return {
      colors: mode === "dark" ? darkColors : lightColors,
      mode,
      setMode,
    };
  }, [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function Screen({ children }: { children: ReactNode }) {
  const { colors: themeColors } = useTheme();

  return <View style={[styles.screen, { backgroundColor: themeColors.bg }]}>{children}</View>;
}

export function LogoMark({ compact = false }: { compact?: boolean }) {
  const { colors: themeColors } = useTheme();

  return (
    <View
      style={[
        styles.logoPill,
        { backgroundColor: lightColors.surface, borderColor: themeColors.border },
        compact && styles.logoPillCompact,
      ]}
    >
      <Image
        accessibilityLabel="Scribbl"
        resizeMode="contain"
        source={scribblLogo}
        style={[styles.logoImage, compact && styles.logoImageCompact]}
      />
    </View>
  );
}

export function Header({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const { colors: themeColors } = useTheme();

  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <LogoMark compact />
        <Text style={[styles.title, { color: themeColors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: themeColors.muted }]}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  const { colors: themeColors } = useTheme();

  return (
    <View style={[styles.empty, { backgroundColor: themeColors.surfaceLow, borderColor: themeColors.secondaryDim }]}>
      <Text style={[styles.emptyTitle, { color: themeColors.text }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: themeColors.muted }]}>{body}</Text>
    </View>
  );
}

export function LoadingState() {
  const { colors: themeColors } = useTheme();

  return (
    <View style={[styles.loading, { backgroundColor: themeColors.bg }]}>
      <ActivityIndicator />
    </View>
  );
}

export function ErrorState({ message }: { message: string }) {
  const { colors: themeColors } = useTheme();

  return (
    <View style={[styles.error, { backgroundColor: themeColors.dangerDim, borderColor: themeColors.danger }]}>
      <Text style={[styles.errorText, { color: themeColors.danger }]}>{message}</Text>
    </View>
  );
}

type CardButtonProps = Omit<PressableProps, "style"> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function CardButton({ children, style, ...props }: CardButtonProps) {
  const { colors: themeColors } = useTheme();

  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.cardButton,
        { backgroundColor: themeColors.surface, borderColor: themeColors.border },
        pressed && styles.cardButtonPressed,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function AvatarMenuButton({ displayName }: { displayName: string }) {
  const { colors: themeColors } = useTheme();
  const initial = displayName.trim().slice(0, 1).toUpperCase() || "S";

  return (
    <Pressable
      accessibilityLabel="Open account menu"
      onPress={() => router.push("/account-menu")}
      style={({ pressed }) => [
        styles.avatarButton,
        { backgroundColor: themeColors.secondary, opacity: pressed ? 0.72 : 1 },
      ]}
    >
      <Text style={styles.avatarButtonText}>{initial}</Text>
    </Pressable>
  );
}

export function AppHeaderActions({ displayName, notificationCount = 0 }: { displayName: string; notificationCount?: number }) {
  const { colors: themeColors } = useTheme();
  const visibleCount = Math.min(notificationCount, 99);

  return (
    <View style={styles.headerActions}>
      <Pressable
        accessibilityLabel="Open notifications"
        onPress={() => router.push("/notifications")}
        style={({ pressed }) => [
          styles.notificationButton,
          {
            backgroundColor: themeColors.surface,
            borderColor: themeColors.border,
            opacity: pressed ? 0.72 : 1,
          },
        ]}
      >
        <Ionicons color={themeColors.text} name="notifications-outline" size={21} />
        {visibleCount > 0 ? (
          <View style={[styles.notificationBadge, { backgroundColor: themeColors.danger }]}>
            <Text style={styles.notificationBadgeText}>{visibleCount}</Text>
          </View>
        ) : null}
      </Pressable>
      <AvatarMenuButton displayName={displayName} />
    </View>
  );
}

export const colors = lightColors;

export const fonts = {
  displayBold: "HankenGrotesk_700Bold",
  displayBlack: "HankenGrotesk_900Black",
  monoBold: "JetBrainsMono_700Bold",
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemiBold: "Inter_600SemiBold",
  sansBold: "Inter_700Bold",
};

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 16,
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  logoPill: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    shadowColor: "#1A1B20",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  logoPillCompact: {
    marginBottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  logoImage: {
    height: 31,
    width: 60,
  },
  logoImageCompact: {
    height: 24,
    width: 46,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.displayBlack,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 0,
  },
  subtitle: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 6,
  },
  cardButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#1A1B20",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  cardButtonPressed: {
    opacity: 0.72,
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  notificationButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    position: "relative",
    width: 42,
  },
  notificationBadge: {
    alignItems: "center",
    backgroundColor: colors.danger,
    borderRadius: 999,
    minWidth: 18,
    paddingHorizontal: 4,
    paddingVertical: 2,
    position: "absolute",
    right: -3,
    top: -4,
  },
  notificationBadgeText: {
    color: colors.onPrimary,
    fontFamily: fonts.sansBold,
    fontSize: 10,
    fontWeight: "900",
  },
  avatarButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  avatarButtonText: {
    color: colors.onPrimary,
    fontFamily: fonts.displayBlack,
    fontSize: 17,
    fontWeight: "900",
  },
  empty: {
    backgroundColor: colors.surfaceLow,
    borderColor: colors.secondaryDim,
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: fonts.sansBold,
    fontSize: 16,
    fontWeight: "800",
  },
  emptyBody: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  loading: {
    alignItems: "center",
    backgroundColor: colors.bg,
    flex: 1,
    justifyContent: "center",
  },
  error: {
    backgroundColor: colors.dangerDim,
    borderColor: colors.danger,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  errorText: {
    color: colors.danger,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
});
