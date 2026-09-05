import Constants from "expo-constants";
import { Platform } from "react-native";

const raw = process.env.EXPO_PUBLIC_BACKEND_URL || (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_BACKEND_URL;
export const BACKEND_URL = (raw || "").replace(/\/$/, "");
export const API_URL = `${BACKEND_URL}/api`;

let inMemoryToken: string | null = null;

export function setAuthToken(token: string | null) {
  inMemoryToken = token;
}

export function getAuthToken() {
  return inMemoryToken;
}

async function request(path: string, options: RequestInit = {}, auth = true) {
  const headers: Record<string, string> = { ...(options.headers as any) };
  if (auth && inMemoryToken) {
    headers["Authorization"] = `Bearer ${inMemoryToken}`;
  }
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err: any = new Error((data && data.detail) || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  createSession: (session_id: string) =>
    request("/auth/session", { method: "POST", body: JSON.stringify({ session_id }) }, false),
  me: () => request("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),

  listProfiles: () => request("/profiles"),
  createProfile: (body: any) => request("/profiles", { method: "POST", body: JSON.stringify(body) }),
  updateProfile: (id: string, body: any) => request(`/profiles/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteProfile: (id: string) => request(`/profiles/${id}`, { method: "DELETE" }),

  listContacts: () => request("/contacts"),
  createContact: (body: any) => request("/contacts", { method: "POST", body: JSON.stringify(body) }),
  updateContact: (id: string, body: any) => request(`/contacts/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteContact: (id: string) => request(`/contacts/${id}`, { method: "DELETE" }),

  uploadPhoto: async (uri: string, name = "photo.jpg", type = "image/jpeg") => {
    const form = new FormData();
    if (Platform.OS === "web") {
      const blob = await (await fetch(uri)).blob();
      form.append("file", blob, name);
    } else {
      form.append("file", { uri, name, type } as any);
    }
    return request("/upload", { method: "POST", body: form });
  },

  uploadAudio: async (uri: string, name = "voice.m4a", type = "audio/mp4") => {
    const form = new FormData();
    if (Platform.OS === "web") {
      const blob = await (await fetch(uri)).blob();
      form.append("file", blob, name);
    } else {
      form.append("file", { uri, name, type } as any);
    }
    return request("/upload/audio", { method: "POST", body: form });
  },

  quota: () => request("/quota"),

  activate: () => request("/activate", { method: "POST" }),
  activeEvent: () => request("/events/active"),
  resolveEvent: (id: string) => request(`/events/${id}/resolve`, { method: "POST" }),

  listPlanned: () => request("/planned"),
  createPlanned: (body: any) => request("/planned", { method: "POST", body: JSON.stringify(body) }),
  updatePlanned: (id: string, body: any) => request(`/planned/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  cancelPlanned: (id: string) => request(`/planned/${id}`, { method: "DELETE" }),

  share: (token: string) => request(`/share/${token}`, {}, false),
  upgrade: (tier: string) => {
    const form = new FormData();
    form.append("tier", tier);
    return request("/subscription/upgrade", { method: "POST", body: form });
  },
  deleteAccount: () => request("/account", { method: "DELETE" }),
};

export function fileUrl(path: string, token?: string) {
  const q = token ? `?token=${token}` : "";
  return `${API_URL}/files/${path}${q}`;
}
