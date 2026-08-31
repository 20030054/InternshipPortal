import { prisma } from "@/server/db/client";

/**
 * BR-03: "A student cannot be marked graduation-eligible without a
 * CLOSED_PASS case or an approved waiver." No prior module implemented
 * this — a real gap found auditing for M14's "every BR has a passing
 * named test" acceptance criterion, not just a missing test. Computed
 * fresh on every call, same "never a stored column" precedent BR-01's
 * own `computeEligibility()` already established — there is no
 * `graduationEligible` field anywhere in the schema, deliberately.
 */
export async function isGraduationEligible(studentId: string): Promise<boolean> {
  const passedCase = await prisma.case.findFirst({
    where: { studentId, state: "CLOSED_PASS" },
    select: { id: true },
  });
  if (passedCase) return true;

  const grantedWaiver = await prisma.waiver.findFirst({
    where: { studentId, outcome: "GRANTED" },
    select: { id: true },
  });
  return grantedWaiver !== null;
}
