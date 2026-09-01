import { prisma } from "@/server/db/client";

/**
 * "Admin can view each one's activity" — the two append-only logs
 * already in this codebase (`audit_events` since M01, `case_events`
 * since M04) already record real activity; nothing before this let an
 * Admin actually *see* either one. Merges both into one feed rather
 * than building a third table — `case_events` is "what state did this
 * case move through and who moved it," `audit_events` is everything
 * else this codebase already logs (waiver initiation, denied
 * transitions, document downloads/denials, supervisor token issuance,
 * auto-enrollment, restarts). Both are genuinely append-only at the
 * database privilege level (BR-26, M01) — this reads them, never
 * writes.
 */
export type ActivityLogEntry = {
  id: string;
  kind: "audit" | "transition";
  actorUserId: string | null;
  actorEmail: string | null;
  systemJob: string | null;
  description: string;
  createdAt: Date;
};

const PAGE_SIZE = 50;

export async function listActivityLog(filters: {
  actorEmail?: string;
  limit?: number;
}): Promise<ActivityLogEntry[]> {
  const limit = Math.min(filters.limit ?? PAGE_SIZE, 200);

  let actorUserId: string | undefined;
  if (filters.actorEmail) {
    const user = await prisma.user.findUnique({ where: { email: filters.actorEmail } });
    if (!user) return []; // a real email that doesn't exist -- no activity, not an error
    actorUserId = user.id;
  }

  const [auditEvents, caseEvents] = await Promise.all([
    prisma.auditEvent.findMany({
      where: actorUserId ? { actorUserId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { actor: { select: { email: true } } },
    }),
    prisma.caseEvent.findMany({
      where: actorUserId ? { actorUserId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { actor: { select: { email: true } } },
    }),
  ]);

  const entries: ActivityLogEntry[] = [
    ...auditEvents.map((e): ActivityLogEntry => ({
      id: e.id,
      kind: "audit",
      actorUserId: e.actorUserId,
      actorEmail: e.actor?.email ?? null,
      systemJob: e.systemJob,
      description: `${e.eventType} — ${e.entityType} ${e.entityId}`,
      createdAt: e.createdAt,
    })),
    ...caseEvents.map((e): ActivityLogEntry => ({
      id: e.id,
      kind: "transition",
      actorUserId: e.actorUserId,
      actorEmail: e.actor?.email ?? null,
      systemJob: e.systemJob,
      description: `Case ${e.caseId}: ${e.fromState} → ${e.toState}${e.reason ? ` (${e.reason})` : ""}`,
      createdAt: e.createdAt,
    })),
  ];

  entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return entries.slice(0, limit);
}
