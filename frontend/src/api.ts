const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:5000";

async function request<T>(
  path: string,
  init?: RequestInit & { token?: string }
): Promise<T> {
  const { token, ...rest } = init ?? {};
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // 本人確認用メンバートークン（参加時に発行）。member 操作で送る。
  if (token) headers["x-member-token"] = token;
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers,
    ...rest,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface Member {
  id: string;
  name: string;
  joined_at: string;
}

export interface Option {
  id: string;
  label: string;
  sort_order: number;
}

export interface Topic {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

export interface Choice {
  member_id: string;
  option_id: string;
}

export interface RoomState {
  room: { id: string; code: string; name: string | null; status: string };
  members: Member[];
  activeTopic:
    | (Topic & { options: Option[]; choices: Choice[] })
    | null;
}

export interface PairMatch {
  memberAId: string;
  memberAName: string;
  memberBId: string;
  memberBName: string;
  sharedTopics: number;
  matchedTopics: number;
  rate: number | null;
}

export interface MatchingResult {
  pairs: PairMatch[];
  best: PairMatch | null;
}

export const api = {
  createRoom: (name?: string) =>
    request<{ room: RoomState["room"] }>("/rooms", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  joinRoom: (code: string, name: string) =>
    request<RoomState & { member: Member; token: string }>(
      `/rooms/${code}/join`,
      {
        method: "POST",
        body: JSON.stringify({ name }),
      }
    ),

  getRoom: (code: string) => request<RoomState>(`/rooms/${code}`),

  leaveRoom: (code: string, memberId: string, token: string) =>
    request<{ ok: boolean }>(`/rooms/${code}/leave`, {
      method: "POST",
      body: JSON.stringify({ memberId }),
      token,
    }),

  createTopic: (code: string, title: string, count = 6) =>
    request<{ topic: Topic; options: Option[]; usingMock: boolean }>(
      `/rooms/${code}/topics`,
      {
        method: "POST",
        body: JSON.stringify({ title, count }),
      }
    ),

  vote: (topicId: string, memberId: string, optionId: string, token: string) =>
    request<{ ok: boolean; voted: number; total: number }>(
      `/topics/${topicId}/choices`,
      {
        method: "POST",
        body: JSON.stringify({ memberId, optionId }),
        token,
      }
    ),

  topicResult: (topicId: string) =>
    request<MatchingResult>(`/topics/${topicId}/result`),

  roomResult: (code: string) =>
    request<MatchingResult>(`/rooms/${code}/result`),

  closeTopic: (topicId: string) =>
    request<{ ok: boolean }>(`/topics/${topicId}/close`, { method: "POST" }),
};
