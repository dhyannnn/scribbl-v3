import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { mobileEnv } from "@/lib/env";

export const isSupabaseConfigured = Boolean(mobileEnv.supabaseUrl && mobileEnv.supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(mobileEnv.supabaseUrl, mobileEnv.supabasePublishableKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
