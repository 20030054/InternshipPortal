import { prisma } from "@/server/db/client";

/**
 * M15: the one, narrow way a Focal Person can find a student's
 * internal id from the outside — by registration number, which they'd
 * realistically already have on hand (a phone call, an email, a
 * physical file), backing waiver initiation
 * (`POST /api/students/:id/waiver`, which needs that id directly).
 * Deliberately not a general "browse/search all students" directory:
 * §9 "Privacy" is explicit that no such directory exists anywhere in
 * this system, and this single lookup-by-exact-registration-number
 * doesn't become one — it can't be used to enumerate students, only to
 * resolve one already-known identifier.
 */
export async function findStudentByRegistrationNumber(registrationNumber: string): Promise<{
  id: string;
  registrationNumber: string;
  name: string;
} | null> {
  const student = await prisma.student.findUnique({
    where: { registrationNumber },
    select: {
      id: true,
      registrationNumber: true,
      user: { select: { fullName: true, email: true } },
    },
  });
  if (!student) return null;
  return {
    id: student.id,
    registrationNumber: student.registrationNumber,
    name: student.user.fullName ?? student.user.email,
  };
}
