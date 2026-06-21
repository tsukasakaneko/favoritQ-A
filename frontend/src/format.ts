/** マッチング率(%)を表示用文字列に整形する。null（比較不能）は "—"。 */
export function rateLabel(rate: number | null): string {
  return rate === null ? "—" : `${rate}%`;
}
