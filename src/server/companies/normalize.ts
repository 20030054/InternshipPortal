/**
 * Shared normalisation for `companies.normalised_name` — used both here
 * (find-or-create on submission) and by the restart gate's G1 guard
 * (`differentOrganization`, M04), which compares two already-normalised
 * names for an exact match. Exact-match only; fuzzy matching above
 * `COMPANY_MATCH_THRESHOLD` is M10's explicit job, not this function's.
 */
export function normalizeCompanyName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
