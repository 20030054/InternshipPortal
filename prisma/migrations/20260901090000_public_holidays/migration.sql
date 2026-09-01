-- OQ-14, answered (D-121): BR-27's "working days" SLA clock now
-- pauses on Admin-managed holiday dates, not just Sat/Sun.
CREATE TABLE "public_holidays" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_holidays_date_key" ON "public_holidays"("date");
