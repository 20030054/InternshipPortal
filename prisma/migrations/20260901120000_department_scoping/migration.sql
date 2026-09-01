-- Department-scoped access, answered by the user (post-master-prompt,
-- M15): Admin assigns each Focal Person and HoD to one or more
-- departments; an account with none assigned sees nothing. See
-- prisma/schema.prisma's Department/UserDepartment doc comments and
-- docs/DECISIONS.md D-127.
CREATE TYPE "Department" AS ENUM ('CS', 'SE', 'AI', 'MBC');

ALTER TABLE "students" ADD COLUMN "department" "Department";

CREATE TABLE "user_departments" (
    "user_id" UUID NOT NULL,
    "department" "Department" NOT NULL,

    CONSTRAINT "user_departments_pkey" PRIMARY KEY ("user_id", "department")
);

ALTER TABLE "user_departments" ADD CONSTRAINT "user_departments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
