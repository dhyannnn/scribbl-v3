import { useEffect, useState } from "react";
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { MobileMeeting, MobileUser } from "@scribbl/shared";
import { AppHeaderActions, CardButton, EmptyState, ErrorState, Header, LoadingState, Screen, colors, fonts, useTheme } from "@/components/ui";
import { getMe, getNotifications, getSessions, webUrl } from "@/lib/api";

type SessionGroup = {
  dateLabel: string;
  sessions: MobileMeeting[];
};

export default function CalendarScreen() {
  const { colors: themeColors } = useTheme();
  const [user, setUser] = useState<MobileUser | null>(null);
  const [sessions, setSessions] = useState<MobileMeeting[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const [meResponse, sessionsResponse, notificationsResponse] = await Promise.all([getMe(), getSessions(), getNotifications()]);
      setUser(meResponse.user);
      setSessions(sessionsResponse.meetings);
      setNotificationCount(notificationsResponse.unattendedCount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load calendar.");
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

  const groups = groupSessionsByDay(sessions);

  return (
    <Screen>
      <Header
        title="Calendar"
        subtitle="Read-only agenda for your upcoming sessions."
        action={<AppHeaderActions displayName={user?.displayName ?? "Scribbl"} notificationCount={notificationCount} />}
      />
      {error ? <ErrorState message={error} /> : null}
      <ScrollView
        contentContainerStyle={local.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        {groups.length === 0 ? (
          <EmptyState title="No sessions" body="Upcoming sessions across your workspaces will show here." />
        ) : (
          groups.map((group) => (
            <View key={group.dateLabel} style={local.group}>
              <Text style={[local.dateLabel, { color: themeColors.text }]}>{group.dateLabel}</Text>
              {group.sessions.map((session) => (
                <CardButton key={session.id} onPress={() => Linking.openURL(webUrl(session.webPath))}>
                  <View style={local.sessionHeader}>
                    <Text style={[local.time, { color: themeColors.secondary }]}>{formatTimeRange(session)}</Text>
                    <Text style={[local.status, { backgroundColor: themeColors.secondaryDim, color: themeColors.secondary }]}>
                      {session.participantStatus?.toLowerCase() ?? "session"}
                    </Text>
                  </View>
                  <Text style={[local.title, { color: themeColors.text }]}>{session.title}</Text>
                  <Text style={[local.meta, { color: themeColors.muted }]}>{session.workspaceName}</Text>
                </CardButton>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function groupSessionsByDay(sessions: MobileMeeting[]): SessionGroup[] {
  const formatter = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const groups = new Map<string, MobileMeeting[]>();

  for (const session of sessions) {
    const label = formatter.format(new Date(session.startsAt));
    groups.set(label, [...(groups.get(label) ?? []), session]);
  }

  return Array.from(groups.entries()).map(([dateLabel, groupedSessions]) => ({
    dateLabel,
    sessions: groupedSessions,
  }));
}

function formatTimeRange(session: MobileMeeting) {
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const start = timeFormatter.format(new Date(session.startsAt));
  const end = session.endsAt ? timeFormatter.format(new Date(session.endsAt)) : null;

  return end ? `${start} - ${end}` : start;
}

const local = StyleSheet.create({
  list: {
    gap: 18,
    paddingBottom: 32,
  },
  group: {
    gap: 10,
  },
  dateLabel: {
    color: colors.text,
    fontFamily: fonts.displayBold,
    fontSize: 20,
    fontWeight: "700",
  },
  sessionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  time: {
    color: colors.secondary,
    fontFamily: fonts.sansBold,
    fontSize: 13,
    fontWeight: "800",
  },
  status: {
    backgroundColor: colors.secondaryDim,
    borderRadius: 999,
    color: colors.secondary,
    fontFamily: fonts.sansBold,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 4,
    textTransform: "capitalize",
  },
  title: {
    color: colors.text,
    fontFamily: fonts.sansBold,
    fontSize: 17,
    fontWeight: "900",
  },
  meta: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 13,
    marginTop: 5,
  },
});
