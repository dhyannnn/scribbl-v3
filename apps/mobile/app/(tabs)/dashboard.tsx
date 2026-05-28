import { router } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { MobileMeeting, MobileUser, MobileWorkspace } from "@scribbl/shared";
import { formatShortDateTime } from "@scribbl/shared";
import { AppHeaderActions, CardButton, EmptyState, ErrorState, Header, LoadingState, Screen, colors, fonts, useTheme } from "@/components/ui";
import { getMe, getNotifications, getSessions, getWorkspaces } from "@/lib/api";

export default function DashboardScreen() {
  const { colors: themeColors } = useTheme();
  const [user, setUser] = useState<MobileUser | null>(null);
  const [workspaces, setWorkspaces] = useState<MobileWorkspace[]>([]);
  const [sessions, setSessions] = useState<MobileMeeting[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const [meResponse, workspacesResponse, sessionsResponse, notificationsResponse] = await Promise.all([
        getMe(),
        getWorkspaces(),
        getSessions(),
        getNotifications(),
      ]);
      setUser(meResponse.user);
      setWorkspaces(workspacesResponse.workspaces);
      setSessions(sessionsResponse.meetings);
      setNotificationCount(notificationsResponse.unattendedCount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Scribbl.");
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
      <Header
        title={user ? `Hi, ${user.displayName.split(" ")[0]}` : "Scribbl"}
        subtitle="Workspaces, sessions, notes, and chat previews."
        action={<AppHeaderActions displayName={user?.displayName ?? "Scribbl"} notificationCount={notificationCount} />}
      />
      {error ? <ErrorState message={error} /> : null}
      <FlatList
        data={workspaces}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={local.section}>
            <Text style={[local.sectionTitle, { color: themeColors.text }]}>Upcoming sessions</Text>
            {sessions.length === 0 ? (
              <EmptyState title="No upcoming sessions" body="Scheduled meetings will show here." />
            ) : (
              sessions.slice(0, 3).map((session) => (
                <View key={session.id} style={local.sessionRow}>
                  <View style={local.liveBadge}>
                    <Text style={local.liveBadgeText}>Session</Text>
                  </View>
                  <Text style={local.sessionTitle}>{session.title}</Text>
                  <Text style={local.sessionMeta}>{session.workspaceName} · {formatShortDateTime(session.startsAt)}</Text>
                </View>
              ))
            )}
            <Text style={[local.sectionTitle, { color: themeColors.text, marginTop: 20 }]}>Workspaces</Text>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No workspaces" body="Join or create a workspace on the web app first." />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        renderItem={({ item }) => (
          <CardButton
            onPress={() => router.push({ pathname: "/workspace/[workspaceId]", params: { workspaceId: item.id, name: item.name, memberCount: String(item.memberCount) } })}
            style={local.workspaceCard}
          >
            <Text style={[local.rowTitle, { color: themeColors.text }]}>{item.name}</Text>
            <Text style={[local.rowMeta, { color: themeColors.muted }]}>{item.type.toLowerCase()} · {item.role.toLowerCase()} · {item.memberCount} members</Text>
          </CardButton>
        )}
      />
    </Screen>
  );
}

const local = StyleSheet.create({
  section: {
    gap: 10,
    marginBottom: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.sansBold,
    fontSize: 18,
    fontWeight: "800",
  },
  sessionRow: {
    backgroundColor: colors.live,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  liveBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.successDim,
    borderRadius: 999,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  liveBadgeText: {
    color: colors.success,
    fontFamily: fonts.sansBold,
    fontSize: 12,
    fontWeight: "900",
  },
  sessionTitle: {
    color: colors.onPrimary,
    fontFamily: fonts.sansBold,
    fontSize: 17,
    fontWeight: "900",
  },
  sessionMeta: {
    color: "rgba(255,255,255,0.72)",
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
  },
  workspaceCard: {
    marginBottom: 10,
  },
  rowTitle: {
    color: colors.text,
    fontFamily: fonts.sansBold,
    fontSize: 16,
    fontWeight: "800",
  },
  rowMeta: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
});
