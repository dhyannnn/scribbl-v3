import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { MobileChannel, MobileMeeting, MobileNoteSummary } from "@scribbl/shared";
import { formatShortDateTime } from "@scribbl/shared";
import { CardButton, EmptyState, ErrorState, LoadingState, LogoMark, Screen, colors, fonts, useTheme } from "@/components/ui";
import { getWorkspaceChannels, getWorkspaceMeetings, getWorkspaceNotes, webUrl } from "@/lib/api";

type Tab = "notes" | "chat" | "meetings";

export default function WorkspaceScreen() {
  const { colors: themeColors } = useTheme();
  const params = useLocalSearchParams<{ workspaceId: string; name?: string; memberCount?: string }>();
  const workspaceId = params.workspaceId;
  const [tab, setTab] = useState<Tab>("notes");
  const [notes, setNotes] = useState<MobileNoteSummary[]>([]);
  const [channels, setChannels] = useState<MobileChannel[]>([]);
  const [meetings, setMeetings] = useState<MobileMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const memberCount = getMemberCount(params.memberCount);

  useEffect(() => {
    async function load() {
      if (!workspaceId) return;

      setError("");
      try {
        const [notesResponse, channelsResponse, meetingsResponse] = await Promise.all([
          getWorkspaceNotes(workspaceId),
          getWorkspaceChannels(workspaceId),
          getWorkspaceMeetings(workspaceId),
        ]);
        setNotes(notesResponse.notes);
        setChannels(channelsResponse.channels);
        setMeetings(meetingsResponse.meetings);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load workspace.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [workspaceId]);

  if (loading) return <LoadingState />;

  return (
    <Screen>
      <View style={local.header}>
        <View style={local.headerText}>
          <LogoMark compact />
          <Text style={[local.headerTitle, { color: themeColors.text }]}>{params.name ?? "Workspace"}</Text>
        </View>
        <View style={local.headerAction}>
          <MemberCountButton
            count={memberCount}
            onPress={() => router.push({ pathname: "/workspace-members/[workspaceId]", params: { workspaceId, name: params.name } })}
          />
        </View>
      </View>
      {error ? <ErrorState message={error} /> : null}
      <View style={[local.tabs, { backgroundColor: themeColors.surfaceMid, borderColor: themeColors.border }]}>
        <TabButton active={tab === "notes"} label="Notes" onPress={() => setTab("notes")} />
        <TabButton active={tab === "chat"} label="Chat" onPress={() => setTab("chat")} />
        <TabButton active={tab === "meetings"} label="Meetings" onPress={() => setTab("meetings")} />
      </View>
      <ScrollView contentContainerStyle={local.list}>
        {tab === "notes" ? <NotesList notes={notes} /> : null}
        {tab === "chat" ? <ChannelsList channels={channels} /> : null}
        {tab === "meetings" ? <MeetingsList meetings={meetings} /> : null}
      </ScrollView>
    </Screen>
  );
}

function MemberCountButton({ count, onPress }: { count: number | null; onPress: () => void }) {
  const { colors: themeColors } = useTheme();
  const label = count === null ? "Members" : `${count} ${count === 1 ? "member" : "members"}`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        local.membersButton,
        { backgroundColor: themeColors.secondary, opacity: pressed ? 0.72 : 1 },
      ]}
    >
      <Text style={local.membersButtonText}>{label}</Text>
    </Pressable>
  );
}

function getMemberCount(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const count = Number(rawValue);
  return Number.isFinite(count) ? count : null;
}

function TabButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const { colors: themeColors } = useTheme();

  return (
    <Pressable onPress={onPress} style={[local.tab, active && { backgroundColor: themeColors.primary }]}>
      <Text style={[local.tabText, { color: active ? themeColors.onPrimary : themeColors.muted }]}>{label}</Text>
    </Pressable>
  );
}

function NotesList({ notes }: { notes: MobileNoteSummary[] }) {
  const { colors: themeColors } = useTheme();

  if (notes.length === 0) {
    return <EmptyState title="No notes" body="Workspace notes will show here." />;
  }

  return notes.map((note) => (
    <CardButton
      key={note.id}
      onPress={() => router.push({ pathname: "/note/[noteId]", params: { noteId: note.id, title: note.title } })}
    >
      <View style={local.itemHeader}>
        <Text style={[local.typeBadge, { backgroundColor: themeColors.secondaryDim, color: themeColors.secondary }]}>{note.type.toLowerCase()}</Text>
        <Text style={[local.timeText, { color: themeColors.subtle }]}>{formatShortDateTime(note.updatedAt)}</Text>
      </View>
      <Text style={[local.title, { color: themeColors.text }]}>{note.title}</Text>
      <Text style={[local.meta, { color: themeColors.muted }]}>{note.visibility.toLowerCase()} · {note.ownerName}</Text>
    </CardButton>
  ));
}

function ChannelsList({ channels }: { channels: MobileChannel[] }) {
  const { colors: themeColors } = useTheme();

  if (channels.length === 0) {
    return <EmptyState title="No channels" body="Workspace chat channels will show here." />;
  }

  return channels.map((channel) => (
    <CardButton
      key={channel.id}
      onPress={() => router.push({ pathname: "/channel/[channelId]", params: { channelId: channel.id, name: channel.name } })}
    >
      <View style={local.itemHeader}>
        <Text style={[local.typeBadge, { backgroundColor: themeColors.secondaryDim, color: themeColors.secondary }]}>{channel.type.toLowerCase()}</Text>
        <Text style={[local.timeText, { color: themeColors.subtle }]}>{formatShortDateTime(channel.updatedAt)}</Text>
      </View>
      <Text style={[local.title, { color: themeColors.text }]}>{channel.type === "DIRECT" ? channel.name : `#${channel.name}`}</Text>
      <Text style={[local.meta, { color: themeColors.muted }]}>Updated recently</Text>
    </CardButton>
  ));
}

function MeetingsList({ meetings }: { meetings: MobileMeeting[] }) {
  const { colors: themeColors } = useTheme();

  if (meetings.length === 0) {
    return <EmptyState title="No meetings" body="Workspace meetings will show here." />;
  }

  return meetings.map((meeting) => (
    <CardButton key={meeting.id} onPress={() => Linking.openURL(webUrl(meeting.webPath))}>
      <View style={local.itemHeader}>
        <Text style={[local.typeBadge, local.sessionBadge, { backgroundColor: themeColors.successDim, color: themeColors.success }]}>session</Text>
        <Text style={[local.timeText, { color: themeColors.subtle }]}>{formatShortDateTime(meeting.startsAt)}</Text>
      </View>
      <Text style={[local.title, { color: themeColors.text }]}>{meeting.title}</Text>
      <Text style={[local.meta, { color: themeColors.muted }]}>Opens web meeting room</Text>
    </CardButton>
  ));
}

const local = StyleSheet.create({
  header: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 14,
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: colors.text,
    fontFamily: fonts.displayBlack,
    fontSize: 32,
    fontWeight: "900",
  },
  headerAction: {
    paddingBottom: 2,
  },
  tabs: {
    backgroundColor: colors.surfaceMid,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    marginBottom: 14,
    padding: 4,
  },
  membersButton: {
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  membersButtonText: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: "900",
  },
  tab: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    paddingVertical: 10,
  },
  activeTab: {
    backgroundColor: colors.primary,
  },
  tabText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "800",
  },
  activeTabText: {
    color: colors.onPrimary,
  },
  list: {
    gap: 10,
    paddingBottom: 32,
  },
  itemHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 11,
  },
  typeBadge: {
    backgroundColor: colors.secondaryDim,
    borderRadius: 999,
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sessionBadge: {
    backgroundColor: colors.successDim,
    color: colors.success,
  },
  timeText: {
    color: colors.subtle,
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
  },
});
