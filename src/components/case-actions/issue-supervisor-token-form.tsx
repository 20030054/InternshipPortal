"use client";

import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Card, CardTitle } from "@/components/ui/card";

/** `POST /api/cases/:id/supervisor-token` — `src/schemas/
 * supervisor.ts`'s `issueSupervisorTokenSchema`. The supervisor's
 * email is entered explicitly here (D-051: never inferred from
 * `Company.contact`, which is free text captured for a different
 * purpose). The resulting one-time link is emailed directly to that
 * address — nothing to display or copy here. */
export function IssueSupervisorTokenForm({ caseId }: { caseId: string }) {
  return (
    <Card>
      <CardTitle>Request a supervisor evaluation</CardTitle>
      <p className="mt-1 text-sm text-muted">
        Emails the industry supervisor a one-time link, valid for the configured window — they
        never get a portal login.
      </p>
      <ActionForm
        action={`/api/cases/${caseId}/supervisor-token`}
        submitLabel="Send evaluation link"
      >
        <Field
          label="Supervisor's email"
          name="supervisorEmail"
          type="email"
          required
          className="mt-3"
        />
      </ActionForm>
    </Card>
  );
}
