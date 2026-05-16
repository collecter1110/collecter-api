export function emptyToNull(value: string | null): string | null {
  return value === null || value === "" ? null : value;
}
