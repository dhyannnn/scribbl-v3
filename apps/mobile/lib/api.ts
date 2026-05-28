import type {
  MobileChannelsResponse,
  MobileMeetingsResponse,
  MobileMeResponse,
  MobileMessagesResponse,
  MobileNotificationsResponse,
  MobileNoteResponse,
  MobileNotesResponse,
  MobileWorkspaceMembersResponse,
  MobileWorkspacesResponse,
} from "@scribbl/shared";
import { mobileEnv } from "@/lib/env";
import { supabase } from "@/lib/supabase";

const apiBaseUrl = mobileEnv.apiBaseUrl.replace(/\/$/, "");

export function webUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

export async function getMe() {
  return apiGet<MobileMeResponse>("/api/mobile/me");
}

export async function getWorkspaces() {
  return apiGet<MobileWorkspacesResponse>("/api/mobile/workspaces");
}

export async function getSessions() {
  return apiGet<MobileMeetingsResponse>("/api/mobile/sessions");
}

export async function getWorkspaceNotes(workspaceId: string) {
  return apiGet<MobileNotesResponse>(`/api/mobile/workspaces/${workspaceId}/notes`);
}

export async function getWorkspaceMembers(workspaceId: string) {
  return apiGet<MobileWorkspaceMembersResponse>(`/api/mobile/workspaces/${workspaceId}/members`);
}

export async function getNote(noteId: string) {
  return apiGet<MobileNoteResponse>(`/api/mobile/notes/${noteId}`);
}

export async function getWorkspaceChannels(workspaceId: string) {
  return apiGet<MobileChannelsResponse>(`/api/mobile/workspaces/${workspaceId}/channels`);
}

export async function getChannelMessages(channelId: string) {
  return apiGet<MobileMessagesResponse>(`/api/mobile/channels/${channelId}/messages`);
}

export async function getNotifications() {
  return apiGet<MobileNotificationsResponse>("/api/mobile/notifications");
}

export async function getWorkspaceMeetings(workspaceId: string) {
  return apiGet<MobileMeetingsResponse>(`/api/mobile/workspaces/${workspaceId}/meetings`);
}

async function apiGet<T>(path: string) {
  return apiRequest<T>(path);
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
  } catch {
    throw new Error(`Cannot reach Scribbl web API at ${apiBaseUrl}. Start the web app or set EXPO_PUBLIC_API_BASE_URL.`);
  }

  const json = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(json, response));
  }

  return json as T;
}

async function readJsonResponse(response: Response) {
  const body = await response.text();

  if (!body.trim()) {
    return null;
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error(`Scribbl web API returned an invalid response from ${response.url}.`);
  }
}

function getErrorMessage(json: unknown, response: Response) {
  if (json && typeof json === "object" && "error" in json && typeof json.error === "string") {
    return json.error;
  }

  return `Request failed (${response.status}) from ${response.url}.`;
}

async function getAccessToken() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (error || !token) {
    throw new Error("Sign in again to continue.");
  }

  return token;
}
