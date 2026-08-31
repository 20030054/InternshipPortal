"use client";

import { ActionForm } from "@/components/action-form";
import { SelectField } from "@/components/ui/field";

/** `POST /api/documents/:id/verify` — `src/schemas/grading.ts`'s
 * `verifyDocumentSchema`. BR-11: any single one of the four listed
 * methods suffices (OQ-02) — a plain select, not a checklist. Rendered
 * once per still-unverified `ACTIVE` document on the case, inline next
 * to it rather than as its own `Card`, since a case can have up to two
 * of these at once (offer letter, completion certificate). */
export function VerifyDocumentForm({ documentId }: { documentId: string }) {
  return (
    <ActionForm action={`/api/documents/${documentId}/verify`} submitLabel="Mark verified">
      <SelectField label="Verification method" name="method" required defaultValue="">
        <option value="" disabled>
          Choose a method
        </option>
        <option value="DOCUMENT_INSPECTED">Document inspected</option>
        <option value="EMPLOYER_CONTACTED_PHONE">Employer contacted (phone)</option>
        <option value="EMPLOYER_CONTACTED_EMAIL">Employer contacted (email)</option>
        <option value="SUPERVISOR_LINK_CONFIRMED">Supervisor link confirmed</option>
      </SelectField>
    </ActionForm>
  );
}
