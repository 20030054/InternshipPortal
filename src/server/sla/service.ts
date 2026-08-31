import type { CaseState } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { isFocalSlaBreached } from "./focal-sla";
import { classifyTokenForReminder } from "@/server/supervisor/reminders";
import { recordReminderSent } from "@/server/supervisor/service";
import {
  sendNotification,
  sendNotificationToAddress,
  usersWithRole,
} from "@/server/notifications/service";
import {
  FOCAL_SLA_ESCALATION_TEMPLATE,
  SUPERVISOR_FIRST_REMINDER_TEMPLATE,
  SUPERVISOR_SECOND_REMINDER_TEMPLATE,
  SUPERVISOR_UNRESPONSIVE_TEMPLATE,
  type NotificationTemplate,
} from "@/server/notifications/templates";

function focalSlaDays(): number {
  return Number(process.env.SLA_DAYS ?? 10);
}

function supervisorSlaDays(): number {
  return Number(process.env.SUPERVISOR_SLA_DAYS ?? 14);
}

/** BR-27: the two states a case can genuinely sit in awaiting Focal
 * Person action — see docs/modules/M12.md "Scope decisions" for why no
 * other state qualifies. */
const FOCAL_PENDING_STATES: readonly CaseState[] = [
  "OFFER_UNDER_REVIEW",
  "PENDING_VERIFICATION",
];

export type FocalSlaSweepResult = { escalated: number; caseIds: string[] };

/**
 * BR-27. For every case currently sitting in a Focal-pending state past
 * `SLA_DAYS` working days since it most recently *entered* that state,
 * sends one escalation notification per `HOD` user — but only once per
 * stay (re-running this immediately after produces zero more). Scoped
 * to the current stay, not "ever for this case," because
 * `OFFER_UNDER_REVIEW` is re-enterable after a rejection/resubmission
 * cycle — see docs/modules/M12.md.
 */
export async function runFocalSlaSweep(now: Date = new Date()): Promise<FocalSlaSweepResult> {
  const slaDays = focalSlaDays();
  const pendingCases = await prisma.case.findMany({
    where: { state: { in: [...FOCAL_PENDING_STATES] } },
    select: { id: true, state: true },
  });

  const escalatedCaseIds: string[] = [];

  for (const kase of pendingCases) {
    const mostRecentEntry = await prisma.caseEvent.findFirst({
      where: { caseId: kase.id, toState: kase.state },
      orderBy: { createdAt: "desc" },
    });
    if (!mostRecentEntry) continue; // defensive; every real case has one

    if (!isFocalSlaBreached(mostRecentEntry.createdAt, now, slaDays)) continue;

    const alreadyEscalated = await prisma.notification.findFirst({
      where: {
        caseId: kase.id,
        templateId: FOCAL_SLA_ESCALATION_TEMPLATE.id,
        createdAt: { gte: mostRecentEntry.createdAt },
      },
    });
    if (alreadyEscalated) continue;

    await sendNotification(FOCAL_SLA_ESCALATION_TEMPLATE, kase.id, {
      caseId: kase.id,
      fromState: "",
      toState: kase.state,
      reason: null,
    });
    escalatedCaseIds.push(kase.id);
  }

  return { escalated: escalatedCaseIds.length, caseIds: escalatedCaseIds };
}

export type SupervisorReminderSweepResult = {
  firstReminders: number;
  secondReminders: number;
  escalations: number;
};

/**
 * BR-28. M08 already built the detection logic
 * (`classifyTokenForReminder()`) — this is purely the delivery side: a
 * reminder to the supervisor's own email at the first/second threshold,
 * then a one-time escalation to every `FOCAL` user once both reminders
 * have gone unanswered past the third threshold.
 */
export async function runSupervisorReminderSweep(
  now: Date = new Date(),
): Promise<SupervisorReminderSweepResult> {
  const slaDays = supervisorSlaDays();
  const liveTokens = await prisma.supervisorToken.findMany({
    where: { usedAt: null, revokedAt: null },
  });

  let firstReminders = 0;
  let secondReminders = 0;
  let escalations = 0;

  for (const token of liveTokens) {
    const classification = classifyTokenForReminder(
      { createdAt: token.createdAt, reminderCount: token.reminderCount },
      now,
      slaDays,
    );

    if (classification === "first_reminder_due") {
      await sendNotificationToAddress(
        SUPERVISOR_FIRST_REMINDER_TEMPLATE,
        token.caseId,
        token.supervisorEmail,
        { caseId: token.caseId, fromState: "", toState: "", reason: null },
      );
      await recordReminderSent(token.id);
      firstReminders++;
    } else if (classification === "second_reminder_due") {
      await sendNotificationToAddress(
        SUPERVISOR_SECOND_REMINDER_TEMPLATE,
        token.caseId,
        token.supervisorEmail,
        { caseId: token.caseId, fromState: "", toState: "", reason: null },
      );
      await recordReminderSent(token.id);
      secondReminders++;
    } else if (classification === "escalate") {
      const alreadyEscalated = await prisma.notification.findFirst({
        where: {
          caseId: token.caseId,
          templateId: SUPERVISOR_UNRESPONSIVE_TEMPLATE.id,
          createdAt: { gte: token.lastReminderSentAt ?? token.createdAt },
        },
      });
      if (alreadyEscalated) continue;

      await sendNotification(SUPERVISOR_UNRESPONSIVE_TEMPLATE, token.caseId, {
        caseId: token.caseId,
        fromState: "",
        toState: "",
        reason: null,
      });
      escalations++;
    }
  }

  return { firstReminders, secondReminders, escalations };
}

export type HodDigestResult = { sent: boolean; recipients: number };

/**
 * A periodic summary of exactly what this module tracks — current
 * Focal-SLA breaches and supervisor-escalated cases. Full dashboard
 * content (all waivers, all restarts, counts by state) is M13's job —
 * see docs/modules/M12.md "Scope decisions." Skipped entirely (no
 * email, no `Notification` rows) when there's nothing to report.
 */
export async function runHodDigest(now: Date = new Date()): Promise<HodDigestResult> {
  const slaDays = focalSlaDays();
  const breachedCases = await prisma.case.findMany({
    where: { state: { in: [...FOCAL_PENDING_STATES] } },
    select: { id: true, state: true },
  });

  const breachedIds: string[] = [];
  for (const kase of breachedCases) {
    const mostRecentEntry = await prisma.caseEvent.findFirst({
      where: { caseId: kase.id, toState: kase.state },
      orderBy: { createdAt: "desc" },
    });
    if (mostRecentEntry && isFocalSlaBreached(mostRecentEntry.createdAt, now, slaDays)) {
      breachedIds.push(kase.id);
    }
  }

  const escalatedTokens = await prisma.supervisorToken.count({
    where: { usedAt: null, revokedAt: null, reminderCount: { gte: 2 } },
  });

  if (breachedIds.length === 0 && escalatedTokens === 0) {
    return { sent: false, recipients: 0 };
  }

  const hods = await usersWithRole("HOD");
  const digestBody = [
    `Cases past the Focal Person SLA: ${breachedIds.length}`,
    `Cases with an unresponsive supervisor: ${escalatedTokens}`,
  ].join("\n");

  // `reason` doubles as the digest's own computed body here — the one
  // template in this registry whose content varies per run (a report,
  // not a fixed message) rather than per case/event.
  for (const hod of hods) {
    await sendNotificationToAddress(HOD_DIGEST_TEMPLATE, null, hod.email, {
      caseId: "",
      fromState: "",
      toState: "",
      reason: digestBody,
    });
  }

  return { sent: true, recipients: hods.length };
}

const HOD_DIGEST_TEMPLATE: NotificationTemplate = {
  id: "hod-digest",
  version: 1,
  recipients: [],
  render: (ctx) => ({
    subject: "SCIT Internship Portal — daily digest",
    text: ctx.reason ?? "",
  }),
};
