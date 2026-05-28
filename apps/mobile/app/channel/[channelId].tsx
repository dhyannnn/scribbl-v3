import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { MobileChatMessage } from "@scribbl/shared";
import { formatShortDateTime } from "@scribbl/shared";
import { EmptyState, ErrorState, Header, LoadingState, Screen, colors, useTheme } from "@/components/ui";
import { getChannelMessages, sendChannelMessage } from "@/lib/api";
import { supabase } from "@/lib/supabase";

const chatRefreshMs = 2000;

export default function ChannelScreen() {
  const { colors: themeColors } = useTheme();
  const params = useLocalSearchParams<{ channelId: string; name?: string }>();
  const listRef = useRef<FlatList<MobileChatMessage>>(null);
  const appIsActiveRef = useRef(AppState.currentState === "active");
  const [messages, setMessages] = useState<MobileChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (options: { reportErrors?: boolean } = {}) => {
    if (!params.channelId) return;

    const reportErrors = options.reportErrors ?? true;
    if (reportErrors) setError("");

    try {
      const response = await getChannelMessages(params.channelId);
      setMessages(response.messages);
    } catch (loadError) {
      if (reportErrors) {
        setError(loadError instanceof Error ? loadError.message : "Could not load messages.");
      }
    } finally {
      setLoading(false);
    }
  }, [params.channelId]);

  useEffect(() => {
    void load({ reportErrors: true });
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
          void load({ reportErrors: false });
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(subscription);
    };
  }, [load, params.channelId]);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      appIsActiveRef.current = state === "active";
      if (appIsActiveRef.current) {
        void load({ reportErrors: false });
      }
    });

    const interval = setInterval(() => {
      if (appIsActiveRef.current) {
        void load({ reportErrors: false });
      }
    }, chatRefreshMs);

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [load]);

  async function sendMessage() {
    if (!params.channelId || sending) return;

    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setError("");
    try {
      const response = await sendChannelMessage(params.channelId, { body });
      setMessages((current) => (
        current.some((message) => message.id === response.message.id)
          ? current
          : [...current, response.message]
      ));
      setDraft("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <Screen>
      <Header title={params.name ? `#${params.name}` : "Chat"} subtitle="Read-only workspace messages." />
      {error ? <ErrorState message={error} /> : null}
      <FlatList
        ref={listRef}
        contentContainerStyle={local.messages}
        data={messages}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<EmptyState title="No messages" body="Start the conversation from mobile." />}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        style={local.messageList}
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
      <View style={[local.composer, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <TextInput
          editable={!sending}
          multiline
          onChangeText={setDraft}
          placeholder="Message this channel"
          placeholderTextColor={themeColors.muted}
          style={[local.input, { color: themeColors.text }]}
          value={draft}
        />
        <Pressable
          disabled={sending || !draft.trim()}
          onPress={sendMessage}
          style={({ pressed }) => [
            local.sendButton,
            { backgroundColor: themeColors.primary },
            (pressed || sending || !draft.trim()) && local.sendButtonDisabled,
          ]}
        >
          <Text style={local.sendButtonText}>{sending ? "Sending" : "Send"}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const local = StyleSheet.create({
  messageList: {
    flex: 1,
  },
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
  composer: {
    alignItems: "flex-end",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
    padding: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    maxHeight: 120,
    minHeight: 42,
    paddingHorizontal: 2,
    paddingVertical: 9,
  },
  sendButton: {
    alignItems: "center",
    borderRadius: 999,
    justifyContent: "center",
    minWidth: 72,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  sendButtonDisabled: {
    opacity: 0.55,
  },
  sendButtonText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: "900",
  },
});
