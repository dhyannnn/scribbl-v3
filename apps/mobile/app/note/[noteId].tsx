import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import type { MobileNoteDetail } from "@scribbl/shared";
import { ErrorState, Header, LoadingState, Screen, colors, useTheme } from "@/components/ui";
import { getNote, webUrl } from "@/lib/api";

export default function NoteScreen() {
  const { colors: themeColors } = useTheme();
  const params = useLocalSearchParams<{ noteId: string; title?: string }>();
  const [note, setNote] = useState<MobileNoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      if (!params.noteId) return;

      try {
        const response = await getNote(params.noteId);
        setNote(response.note);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load note.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [params.noteId]);

  if (loading) return <LoadingState />;

  return (
    <Screen>
      <Header
        title={note?.title ?? params.title ?? "Note"}
        subtitle={note ? `${note.type.toLowerCase()} · by ${note.ownerName}` : undefined}
        action={note ? (
          <Pressable
            onPress={() => Linking.openURL(webUrl(note.webPath))}
            style={({ pressed }) => [local.openButton, { backgroundColor: themeColors.primary }, pressed && local.pressed]}
          >
            <Text style={local.openButtonText}>Open web</Text>
          </Pressable>
        ) : null}
      />
      {error ? <ErrorState message={error} /> : null}
      {note ? (
        <ScrollView contentContainerStyle={[local.body, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <Text style={[local.noteText, { color: themeColors.text }]}>
            {note.contentText || "This note does not have readable text content for mobile yet."}
          </Text>
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const local = StyleSheet.create({
  openButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  pressed: {
    opacity: 0.72,
  },
  openButtonText: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  body: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
    shadowColor: "#1A1B20",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  noteText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
});
