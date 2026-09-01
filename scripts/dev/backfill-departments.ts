// One-off: D-127 (department-scoped access) leaves every pre-existing
// student and every pre-existing Focal/HoD account unassigned after
// the migration — invisible to each other until configured. For a
// real production rollout an Admin would assign these deliberately;
// for this demo/dev environment, backfilling everything into "CS"
// (the same default this session's own test fixtures use) keeps the
// live demo working exactly as it did before this feature existed,
// while leaving the new admin UI fully available to reconfigure.
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const studentResult = await prisma.student.updateMany({
      where: { department: null },
      data: { department: "CS" },
    });
    console.log(`Backfilled department=CS on ${studentResult.count} student(s).`);

    const focalHodUsers = await prisma.user.findMany({
      where: { roleAssignments: { some: { role: { name: { in: ["FOCAL", "HOD"] } } } } },
      select: { id: true, email: true, departmentAssignments: { select: { department: true } } },
    });

    let assignedCount = 0;
    for (const user of focalHodUsers) {
      if (user.departmentAssignments.length === 0) {
        await prisma.userDepartment.create({ data: { userId: user.id, department: "CS" } });
        assignedCount++;
        console.log(`  Assigned ${user.email} to CS.`);
      }
    }
    console.log(`Assigned ${assignedCount} previously-unassigned Focal/HoD account(s) to CS.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
