/**
 * ルームごとのメンバー情報（ID・名前・本人確認トークン）を localStorage に永続化する。
 * リロードしても同じメンバーとして振る舞えるようにするため。
 */
export interface StoredMember {
  memberId: string;
  memberName: string;
  token: string;
}

function key(code: string): string {
  return `favoritq:${code.toUpperCase()}`;
}

export function saveMember(
  code: string,
  memberId: string,
  memberName: string,
  token: string
) {
  localStorage.setItem(key(code), JSON.stringify({ memberId, memberName, token }));
}

export function loadMember(code: string): StoredMember | null {
  const raw = localStorage.getItem(key(code));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredMember;
  } catch {
    // localStorage の値が破損していた場合は削除して null を返す
    localStorage.removeItem(key(code));
    return null;
  }
}

export function clearMember(code: string) {
  localStorage.removeItem(key(code));
}
