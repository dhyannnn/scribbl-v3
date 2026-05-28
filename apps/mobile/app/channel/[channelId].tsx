import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import type { MobileChatMessage } from "@scribbl/shared";
import { formatShortDateTime } from "@scribbl/shared";
import { EmptyState, ErrorState, Header, LoadingState, Screen, colors, useTheme } from "@/components/ui";
import { getChannelMessages } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export default function ChannelScreen() {
  const { colors: themeColors } = useTheme();
  const params = useLocalSearchParams<{ channelId: string; name?: string }>();
  const [messages, setMessages] = useState<MobileChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!params.channelId) return;

    setError("");
    try {
      const response = await getChannelMessages(params.channelId);
      setMessages(response.messages);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [params.channelId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!supabase || !params.channelId) return;

    const channelId = params.channelId;
    const client = supabase;
    const subscription = client
      .channel(`mobile-channel-messages:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "Message",
          filter: `channelId=eq.${channelId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(subscription);
    };
  }, [load, params.channelId]);

  if (loading) return <LoadingState />;

  return (
    <Screen>
      <Header title={params.name ? `#${params.name}` : "Chat"} subtitle="Read-only workspace messages." />
      {error ? <ErrorState message={error} /> : null}
      <FlatList
        contentContainerStyle={local.messages}
        data={messages}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<EmptyState title="No messages" body="Start the conversation from mobile." />}
        renderItem={({ item }) => (
          <View style={[local.message, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={local.messageHeader}>
              <View style={local.senderGroup}>
                <View style={[local.avatar, { backgroundColor: themeColors.secondaryDim }]}>
                  <Text style={[local.avatarText, { color: themeColors.secondary }]}>{item.sender.displayName.slice(0, 2).toUpperCase()}</Text>
                </View>
                <Text style={[local.sender, { color: themeColors.text }]}>{item.sender.displayName}</Text>
              </View>
              <Text style={[local.time, { color: themeColors.muted }]}>{formatShortDateTime(item.createdAt)}</Text>
            </View>
            <Text style={[local.body, { color: themeColors.text }]}>{item.body}</Text>
          </View>
        )}
      />
    </Screen>
  );
}

const local = StyleSheet.create({
  messages: {
    gap: 10,
    paddingBottom: 16,
  },
  message: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  messageHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  senderGroup: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 9,
    minWidth: 0,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.secondaryDim,
    borderRadius: 999,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  avatarText: {
    color: colors.secondary,
    fontSize: 11,
    fontWeight: "900",
  },
  sender: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  time: {
    color: colors.muted,
    fontSize: 12,
  },
  body: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 6,
  },
});
