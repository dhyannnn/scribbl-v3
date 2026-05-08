import { describe, expect, it, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeFormData, makeMembership, makeUser, makeWorkspace } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  getSupabaseAuthUser: vi.fn(),
}));

const { saveMeetingNote } = await import("@/app/workspaces/[id]/meetings/[meetingId]/actions");

describe("saveMeetingNote", () => {
  const user = makeUser();
  const workspace = makeWorkspace(user.id);
  const meetingId = "00000000-0000-0000-0000-000000000099";
  const noteId = "00000000-0000-0000-0000-000000000100";

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(user);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(makeMembership(workspace.id, user.id));
    prismaMock.meetingArtifact.findFirst.mockResolvedValue({
      noteId,
      source: "CREATED_IN_MEETING",
      meeting: {
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        canceledAt: null,
      },
      note: {
        ownerUserId: user.id,
        collaboration: "COLLABORATIVE",
        visibility: "WORKSPACE_SHARED",
      },
    } as never);
  });

  it("stores TipTap contentJson instead of legacy plain text", async () => {
    const contentJson = {
      type: "tiptap",
      html: "<p><strong>Hello</strong> class</p>",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Hello class", marks: [{ type: "bold" }] }],
          },
        ],
      },
    };

    await saveMeetingNote(
      makeFormData({
        workspaceId: workspace.id,
        meetingId,
        noteId,
        title: "Shared lesson notes",
        contentJson: JSON.stringify(contentJson),
      }),
    );

    expect(prismaMock.note.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: noteId },
        data: {
          title: "Shared lesson notes",
          contentJson,
        },
      }),
    );
  });
});
