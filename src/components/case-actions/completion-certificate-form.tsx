"use client";

import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Card, CardTitle } from "@/components/ui/card";

/** `POST /api/cases/:id/completion-certificate` — plain `file` field,
 * no Zod body (see the route's own comment). Automatically advances
 * the case to `PENDING_VERIFICATION` server-side once this is the
 * last of the three BR-10 deliverables to arrive — nothing for this
 * form to decide about that. */
export function CompletionCertificateForm({ caseId }: { caseId: string }) {
  return (
    <Card>
      <CardTitle>Upload your completion certificate</CardTitle>
      <ActionForm
        action={`/api/cases/${caseId}/completion-certificate`}
        encoding="multipart"
        submitLabel="Upload certificate"
      >
        <Field
          label="Completion certificate (PDF, JPEG or PNG)"
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          required
          className="mt-3"
        />
      </ActionForm>
    </Card>
  );
}
