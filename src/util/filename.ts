/**
 * Turn an arbitrary bank/file name into a safe ".json" download filename.
 * Strips any existing extension, replaces filesystem-unsafe characters with
 * "_", caps length, and falls back to a default when the result is empty.
 */
export function toJsonFileName(name: string): string {
  const base = (name ?? '').replace(/\.[^.]+$/, '').trim();
  if (!base) return 'examdump-questions.json';
  // Replace only filesystem-reserved characters; keep hyphens/spaces intact
  // so names like "CY0-001" survive unchanged.
  const safe = base.replace(/[<>:"/\\|?*]/g, '_').slice(0, 100);
  return `${safe}.json`;
}
