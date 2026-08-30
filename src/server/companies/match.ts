/**
 * G1's fuzzy-match half (BR-17), explicitly deferred to M10 by
 * `normalizeCompanyName`'s and `differentOrganization`'s own doc
 * comments. Dependency-free — this is a five-line function, not worth a
 * new npm package for the one place in the codebase that needs it.
 */

/** Classic Levenshtein edit distance, iterative two-row DP (no need for
 * the full matrix). Pure, no I/O. */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const currentRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow.push(
        Math.min(
          previousRow[j]! + 1, // deletion
          currentRow[j - 1]! + 1, // insertion
          previousRow[j - 1]! + cost, // substitution
        ),
      );
    }
    previousRow = currentRow;
  }
  return previousRow[b.length]!;
}

/** 1.0 = identical, 0.0 = nothing in common (bounded by the longer
 * string's length). Two empty strings are defined as identical (1.0) —
 * never actually reachable here since normalised company names are
 * always non-empty, but keeps the function total. */
export function companyNameSimilarity(a: string, b: string): number {
  const longer = Math.max(a.length, b.length);
  if (longer === 0) return 1;
  return 1 - levenshteinDistance(a, b) / longer;
}

export type CompanyMatchInput = {
  normalizedName: string;
  registrationNumber: string | null;
};

export type CompanyMatchResult = {
  exactNameMatch: boolean;
  exactRegistrationMatch: boolean;
  similarity: number;
  /** True only when neither exact check fired but similarity still
   * clears the configured threshold — BR-17's "flagged match," requiring
   * an explicit HoD override to proceed (M10's restart service, not a
   * transition guard — see docs/modules/M10.md "Scope decisions"). */
  flagged: boolean;
};

export function matchCompany(
  failedCaseCompany: CompanyMatchInput,
  newCompany: CompanyMatchInput,
  threshold: number,
): CompanyMatchResult {
  const exactNameMatch =
    failedCaseCompany.normalizedName === newCompany.normalizedName;
  const exactRegistrationMatch =
    failedCaseCompany.registrationNumber !== null &&
    newCompany.registrationNumber !== null &&
    failedCaseCompany.registrationNumber === newCompany.registrationNumber;
  const similarity = companyNameSimilarity(
    failedCaseCompany.normalizedName,
    newCompany.normalizedName,
  );
  return {
    exactNameMatch,
    exactRegistrationMatch,
    similarity,
    flagged:
      !exactNameMatch && !exactRegistrationMatch && similarity >= threshold,
  };
}
