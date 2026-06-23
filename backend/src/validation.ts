/**
 * 入力バリデーションの共通ヘルパー。
 * 各値の長さ・範囲を検証し、問題があればメッセージを返す（OK なら null）。
 */

export const LIMITS = {
  NAME_MAX: 30,
  ROOM_NAME_MAX: 50,
  TITLE_MAX: 100,
  COUNT_MIN: 2,
  COUNT_MAX: 12,
} as const;

/**
 * 必須テキストを検証し、trim 済みの値を返す。
 * 空・非文字列・長すぎる場合はエラーメッセージ（string）を返す。
 */
export function validateRequiredText(
  value: unknown,
  field: string,
  maxLen: number
): { value: string } | { error: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { error: `${field} is required` };
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLen) {
    return { error: `${field} must be at most ${maxLen} characters` };
  }
  return { value: trimmed };
}

/**
 * 任意テキスト（未指定可）を検証し、trim 済みの値 or null を返す。
 * 長すぎる場合はエラーメッセージを返す。
 */
export function validateOptionalText(
  value: unknown,
  field: string,
  maxLen: number
): { value: string | null } | { error: string } {
  if (value === undefined || value === null || value === "") {
    return { value: null };
  }
  if (typeof value !== "string") {
    return { error: `${field} must be a string` };
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLen) {
    return { error: `${field} must be at most ${maxLen} characters` };
  }
  return { value: trimmed || null };
}

/**
 * 選択肢数 count を [min, max] にクランプする。
 * 不正値（NaN・非数）は fallback を使う。
 */
export function clampCount(
  value: unknown,
  fallback = 6,
  min = LIMITS.COUNT_MIN,
  max = LIMITS.COUNT_MAX
): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(min, Math.min(n, max));
}
