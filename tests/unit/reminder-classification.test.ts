import { describe, expect, it } from "vitest";
import {
  classifyTokenForReminder,
  REMINDER_INTERVAL_DAYS,
} from "@/server/supervisor/reminders";

const SLA_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY);
}

describe("classifyTokenForReminder (BR-28)", () => {
  it("is none well before the SLA window", () => {
    const result = classifyTokenForReminder(
      { createdAt: daysAgo(1), reminderCount: 0 },
      new Date(),
      SLA_DAYS,
    );
    expect(result).toBe("none");
  });

  it("is first_reminder_due right at the SLA boundary with no reminders sent", () => {
    const result = classifyTokenForReminder(
      { createdAt: daysAgo(SLA_DAYS), reminderCount: 0 },
      new Date(),
      SLA_DAYS,
    );
    expect(result).toBe("first_reminder_due");
  });

  it("stays none just short of the SLA boundary", () => {
    const result = classifyTokenForReminder(
      { createdAt: daysAgo(SLA_DAYS - 1), reminderCount: 0 },
      new Date(),
      SLA_DAYS,
    );
    expect(result).toBe("none");
  });

  it("is none after one reminder until the interval has also passed", () => {
    const result = classifyTokenForReminder(
      { createdAt: daysAgo(SLA_DAYS), reminderCount: 1 },
      new Date(),
      SLA_DAYS,
    );
    expect(result).toBe("none");
  });

  it("is second_reminder_due after one reminder plus the interval", () => {
    const result = classifyTokenForReminder(
      { createdAt: daysAgo(SLA_DAYS + REMINDER_INTERVAL_DAYS), reminderCount: 1 },
      new Date(),
      SLA_DAYS,
    );
    expect(result).toBe("second_reminder_due");
  });

  it("is none after two reminders until the second interval has also passed", () => {
    const result = classifyTokenForReminder(
      { createdAt: daysAgo(SLA_DAYS + REMINDER_INTERVAL_DAYS), reminderCount: 2 },
      new Date(),
      SLA_DAYS,
    );
    expect(result).toBe("none");
  });

  it("is escalate after two reminders plus the second interval", () => {
    const result = classifyTokenForReminder(
      { createdAt: daysAgo(SLA_DAYS + 2 * REMINDER_INTERVAL_DAYS), reminderCount: 2 },
      new Date(),
      SLA_DAYS,
    );
    expect(result).toBe("escalate");
  });

  it("stays escalate however many reminders were recorded beyond two", () => {
    const result = classifyTokenForReminder(
      { createdAt: daysAgo(SLA_DAYS + 2 * REMINDER_INTERVAL_DAYS), reminderCount: 5 },
      new Date(),
      SLA_DAYS,
    );
    expect(result).toBe("escalate");
  });
});
