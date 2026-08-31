"use client";

import { ActionForm } from "@/components/action-form";

/** `POST /api/admin/roster/sweep-now` — no body. Manually triggers
 * BR-02's auto-enrollment sweep on demand; the scheduled BullMQ job
 * calls the exact same function on its own timer regardless of
 * whether this button is ever used (see the route's own comment). */
export function SweepNowButton() {
  return (
    <ActionForm
      action="/api/admin/roster/sweep-now"
      submitLabel="Run auto-enrollment sweep now"
      variant="secondary"
    />
  );
}
