// One-off: restore a single demo account's password to the documented
// dev value (`scripts/dev/local-demo.sh`'s own printed credentials),
// after it was legitimately changed by exercising the real forgot/
// reset-password flow during live verification. `setDevPasswordIfMissing`
// (prisma/seed.ts) won't touch an account that already has a
// `passwordHash`, by design — this reuses the same `hashPassword` and
// writes it directly, for exactly one account, on purpose.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../src/server/auth/password";

const DEV_PASSWORD = "dev-password-not-for-prod";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: tsx scripts/dev/reset-demo-password.ts <email>");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const passwordHash = await hashPassword(DEV_PASSWORD);
    const user = await prisma.user.update({
      where: { email },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      select: { id: true, email: true },
    });
    console.log(`Reset password for ${user.email} (${user.id}) to the documented dev value.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
