export function sanitizeText(input: unknown, maxLength: number): string {
  if (typeof input !== "string") {
    return "";
  }

  return input
    .replace(/[<>&"'`]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function looksSafeId(id: unknown): id is string {
  return typeof id === "string" && /^[a-z0-9_-]{8,64}$/i.test(id);
}
