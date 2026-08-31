import { describe, expect, it } from "vitest";
import { TRANSITIONS } from "@/server/state-machine/transitions";
import { templateForEvent } from "@/server/notifications/templates";

/** "Email templates for every status change" (MASTER_PROMPT.md §7) —
 * every distinct `emitsEvent` the real transition table can ever
 * produce must resolve to a registered template (even a deliberate
 * `recipients: []` no-op is a registered decision, not a gap). */
describe("notification template registry completeness", () => {
  it("has an entry for every distinct emitsEvent in the real transition table", () => {
    const distinctEvents = new Set(TRANSITIONS.map((t) => t.emitsEvent));
    for (const event of distinctEvents) {
      expect(templateForEvent(event), `missing template for emitsEvent "${event}"`).not.toBeNull();
    }
  });

  it("every registered template has a non-empty id and a version >= 1", () => {
    const distinctEvents = new Set(TRANSITIONS.map((t) => t.emitsEvent));
    for (const event of distinctEvents) {
      const template = templateForEvent(event);
      expect(template!.id.length).toBeGreaterThan(0);
      expect(template!.version).toBeGreaterThanOrEqual(1);
    }
  });

  it("an unknown event resolves to null, not a throw", () => {
    expect(templateForEvent("SOME_EVENT_THAT_DOES_NOT_EXIST")).toBeNull();
  });
});
