import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ErrorState, Header, LoadingState, Screen } from "@/components/ui";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function IndexScreen() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      router.replace(data.session ? "/dashboard" : "/login");
    });
  }, []);

  if (!isSupabaseConfigured || !supabase) {
    return (
      <Screen>
        <Header title="Set up mobile" subtitle="Add Expo public Supabase env vars before signing in." />
        <ErrorState message="Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY." />
      </Screen>
    );
  }

  if (ready) {
    return null;
  }

  return <LoadingState />;
}
