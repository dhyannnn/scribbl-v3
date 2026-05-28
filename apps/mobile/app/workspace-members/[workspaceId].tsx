import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { MobileWorkspaceMember } from "@scribbl/shared";
import { formatShortDateTime } from "@scribbl/shared";
import { EmptyState, ErrorState, Header, LoadingState, Screen, colors, fonts, useTheme } from "@/components/ui";
import { getWorkspaceMembers } from "@/lib/api";

export default function WorkspaceMembersScreen() {
  const { colors: themeColors } = useTheme();
  const params = useLocalSearchParams<{ workspaceId: string; name?: string }>();
  const [members, setMembers] = useState<MobileWorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      if (!params.workspaceId) return;

      setError("");
      try {
        const response = await getWorkspaceMembers(params.workspaceId);
        setMembers(response.members);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load workspace members.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [params.workspaceId]);

  if (loading) return <LoadingState />;

  return (
    <Screen>
      <Header title="Members" subtitle={params.name ?? "Workspace members"} />
      {error ? <ErrorState message={error} /> : null}
      <ScrollView contentContainerStyle={local.list}>
        {members.length === 0 ? (
          <EmptyState title="No members" body="Workspace members will show here." />
        ) : (
          members.map((member) => (
            <View key={member.id} style={[local.memberCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={[local.avatar, { backgroundColor: themeColors.secondaryDim }]}>
                <Text style={[local.avatarText, { color: themeColors.secondary }]}>{member.displayName.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={local.memberBody}>
                <Text style={[local.memberName, { color: themeColors.text }]}>{member.displayName}</Text>
                <Text style={[local.memberMeta, { color: themeColors.muted }]}>{member.email}</Text>
                <Text style={[local.memberMeta, { color: themeColors.subtle }]}>
                  {member.role.toLowerCase()} · joined {formatShortDateTime(member.joinedAt)}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const local = StyleSheet.create({
  list: {
    gap: 10,
    paddingBottom: 32,
  },
  memberCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.secondaryDim,
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  avatarText: {
    color: colors.secondary,
    fontFamily: fonts.sansBold,
    fontSize: 12,
    fontWeight: "900",
  },
  memberBody: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    color: colors.text,
    fontFamily: fonts.sansBold,
    fontSize: 16,
    fontWeight: "900",
  },
  memberMeta: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 13,
    marginTop: 3,
  },
});
