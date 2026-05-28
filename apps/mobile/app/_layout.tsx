import {
  HankenGrotesk_700Bold,
  HankenGrotesk_900Black,
} from "@expo-google-fonts/hanken-grotesk";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import { useFonts } from "expo-font";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, Text } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { fonts, ThemeProvider, useTheme } from "@/components/ui";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    HankenGrotesk_700Bold,
    HankenGrotesk_900Black,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <RootStack />
    </ThemeProvider>
  );
}

function RootStack() {
  const { colors: themeColors, mode } = useTheme();

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.bg }}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: themeColors.bg },
            headerShadowVisible: false,
            headerTintColor: themeColors.text,
            headerTitleStyle: { color: themeColors.text, fontFamily: fonts.displayBlack, fontWeight: "900" },
            contentStyle: { backgroundColor: themeColors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false,
              title: "Dashboard",
            }}
          />
          <Stack.Screen
            name="login"
            options={{
              title: "Welcome",
              headerRight: () => (
                <Pressable
                  onPress={() => router.push("/settings")}
                  style={({ pressed }) => [
                    {
                      backgroundColor: themeColors.surfaceMid,
                      borderRadius: 999,
                      opacity: pressed ? 0.65 : 1,
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                    },
                  ]}
                >
                  <Text style={{ color: themeColors.text, fontFamily: fonts.sansBold, fontSize: 14, fontWeight: "900" }}>Settings</Text>
                </Pressable>
              ),
            }}
          />
          <Stack.Screen name="account" options={{ title: "Account" }} />
          <Stack.Screen
            name="account-menu"
            options={{
              presentation: "modal",
              title: "Profile",
            }}
          />
          <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
          <Stack.Screen name="settings" options={{ title: "Settings" }} />
          <Stack.Screen
            name="workspace/[workspaceId]"
            options={{
              title: "Workspace",
              headerBackTitle: "Dashboard",
            }}
          />
          <Stack.Screen
            name="workspace-members/[workspaceId]"
            options={{
              title: "Members",
              headerBackTitle: "Workspace",
            }}
          />
          <Stack.Screen
            name="channel/[channelId]"
            options={{
              title: "Chat",
              headerBackTitle: "Workspace",
            }}
          />
          <Stack.Screen
            name="note/[noteId]"
            options={{
              title: "Note",
              headerBackTitle: "Workspace",
            }}
          />
        </Stack>
        <StatusBar style={mode === "dark" ? "light" : "dark"} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
