const fs = require("node:fs");
const path = require("node:path");

const rootEnv = readEnvFile(path.resolve(__dirname, "../../.env"));
const env = { ...rootEnv, ...process.env };

module.exports = {
  expo: {
    name: "Scribbl",
    slug: "scribbl-mobile",
    scheme: "scribbl",
    version: "0.1.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#F5F1E8",
      },
    },
    plugins: ["expo-router", "expo-status-bar"],
    extra: {
      apiBaseUrl: env.EXPO_PUBLIC_API_BASE_URL ?? env.APP_URL ?? "http://localhost:3000",
      supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      supabasePublishableKey:
        env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    },
  },
};

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return acc;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return acc;
    }

    const key = trimmed.slice(0, separatorIndex);
    const value = trimmed.slice(separatorIndex + 1).replace(/^["']|["']$/g, "");
    acc[key] = value;
    return acc;
  }, {});
}
