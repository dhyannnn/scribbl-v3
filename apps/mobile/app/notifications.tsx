import { useEffect, useState } from "react";
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { MobileNotification } from "@scribbl/shared";
import { formatShortDateTime } from "@scribbl/shared";
import { CardButton, EmptyState, ErrorState, Header, LoadingState, Screen, colors, fonts, useTheme } from "@/components/ui";
import { getNotifications, webUrl } from "@/lib/api";

export default function NotificationsScreen() {
  const { colors: themeColors } = useTheme();
  const [notifications, setNotifications] = useState<MobileNotification[]>([]);
  const [unattendedCount, setUnattendedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const response = await getNotifications();
      setNotifications(response.notifications);
      setUnattendedCount(response.unattendedCount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load notifications.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return <LoadingState />;
  }

  return (
    <Screen>
      <Header title="Notifications" subtitle={`${unattendedCount} pending workspace ${unattendedCount === 1 ? "invite" : "invites"}.`} />
      {error ? <ErrorState message={error} /> : null}
      <ScrollView
        contentContainerStyle={local.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        {notifications.length === 0 ? (
          <EmptyState title="No notifications" body="Workspace invites, chat updates, and session activity will show here." />
        ) : (
          notifications.map((notification) => (
            <CardButton key={notification.id} onPress={() => Linking.openURL(webUrl(notification.href))}>
              <View style={local.rowTop}>
                <Text style={[local.type, { color: notification.kind === "workspace_invite" ? themeColors.success : themeColors.secondary }]}>
                  {notification.kind === "workspace_invite" ? "workspace invite" : formatNotificationType(notification.type)}
                </Text>
                <Text style={[local.time, { color: themeColors.subtle }]}>{formatShortDateTime(notification.createdAt)}</Text>
              </View>
              <Text style={[local.title, { color: themeColors.text }]}>{notification.title}</Text>
              {notification.body ? <Text style={[local.body, { color: themeColors.muted }]}>{notification.body}</Text> : null}
              <Text style={[local.meta, { color: themeColors.subtle }]}>
                {notification.kind === "workspace_invite" && notification.expiresAt
                  ? `Expires ${formatShortDateTime(notification.expiresAt)}`
                  : ([notification.workspaceName, notification.actorName].filter(Boolean).join(" · ") || "Scribbl")}
              </Text>
            </CardButton>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function formatNotificationType(type: MobileNotification["type"]) {
  return type.toLowerCase().replaceAll("_", " ");
}

const local = StyleSheet.create({
  list: {
    gap: 10,
    paddingBottom: 32,
  },
  rowTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  type: {
    color: colors.secondary,
    fontFamily: fonts.monoBold,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  time: {
    color: colors.subtle,
    fontFamily: fonts.sansBold,
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    color: colors.text,
    fontFamily: fonts.sansBold,
    fontSize: 16,
    fontWeight: "900",
  },
  body: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  meta: {
    color: colors.subtle,
    fontFamily: fonts.sans,
    fontSize: 12,
    marginTop: 10,
  },
});
