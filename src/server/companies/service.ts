import type { Company } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { normalizeCompanyName } from "./normalize";

/**
 * Find-or-create by normalised name. `companies.normalised_name` has no
 * unique constraint (M01 only indexed it, for G1's lookup), so this is a
 * plain find-then-create rather than a Prisma `upsert` — a benign race
 * under real concurrency could create two rows for the same company on
 * a simultaneous first submission from two students, which is a cosmetic
 * duplicate (G1's exact-match guard still works off whichever row a
 * given case points at), not a correctness bug. Not worth a unique
 * constraint + retry loop for what BR-07/BR-17 actually need.
 *
 * An existing company's `contact` is never overwritten by a later
 * submission — a student's self-reported contact shouldn't silently
 * clobber whatever the Focal Person or a prior submission already
 * recorded. Only fills it in if it was previously unset.
 */
export async function findOrCreateCompany(input: {
  name: string;
  contact: string;
}): Promise<Company> {
  const normalisedName = normalizeCompanyName(input.name);

  const existing = await prisma.company.findFirst({
    where: { normalisedName },
  });
  if (existing) {
    if (!existing.contact && input.contact) {
      return prisma.company.update({
        where: { id: existing.id },
        data: { contact: input.contact },
      });
    }
    return existing;
  }

  return prisma.company.create({
    data: { name: input.name, normalisedName, contact: input.contact },
  });
}
