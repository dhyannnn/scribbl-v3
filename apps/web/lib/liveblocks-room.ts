const workspaceNotePrefix = "scribbl:workspace:";

export function createNoteRoomId(workspaceId: string, noteId: string) {
  return `${workspaceNotePrefix}${workspaceId}:note:${noteId}`;
}

export function createMeetingChatRoomId(workspaceId: string, meetingId: string) {
  return `${workspaceNotePrefix}${workspaceId}:meeting:${meetingId}:chat`;
}

export function createChatRoomId(workspaceId: string, channelId: string) {
  return `${workspaceNotePrefix}${workspaceId}:chat:${channelId}`;
}

export function parseNoteRoomId(roomId: string) {
  if (!roomId.startsWith(workspaceNotePrefix)) {
    return null;
  }

  const parts = roomId.slice(workspaceNotePrefix.length).split(":");

  if (parts.length !== 3 || parts[1] !== "note" || !parts[0] || !parts[2]) {
    return null;
  }

  return {
    workspaceId: parts[0],
    noteId: parts[2],
  };
}

export function parseMeetingChatRoomId(roomId: string) {
  if (!roomId.startsWith(workspaceNotePrefix)) {
    return null;
  }

  const parts = roomId.slice(workspaceNotePrefix.length).split(":");

  if (parts.length !== 4 || parts[1] !== "meeting" || parts[3] !== "chat" || !parts[0] || !parts[2]) {
    return null;
  }

  return {
    workspaceId: parts[0],
    meetingId: parts[2],
  };
}

export function parseChatRoomId(roomId: string) {
  if (!roomId.startsWith(workspaceNotePrefix)) {
    return null;
  }

  const parts = roomId.slice(workspaceNotePrefix.length).split(":");

  if (parts.length !== 3 || parts[1] !== "chat" || !parts[0] || !parts[2]) {
    return null;
  }

  return {
    workspaceId: parts[0],
    channelId: parts[2],
  };
}
