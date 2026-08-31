"use client";

import { ActionForm } from "@/components/action-form";

/** `POST /api/cases/:id/withdraw` — no body, no reason (D-118). Only
 * rendered by the case detail page while the case is still in one of
 * the five pre-approval states M04's transition table allows this
 * from — the route itself would 409 outside those anyway, but the
 * button shouldn't offer an action that can't succeed. */
export function WithdrawCaseButton({ caseId }: { caseId: string }) {
  return (
    <ActionForm
      action={`/api/cases/${caseId}/withdraw`}
      submitLabel="Withdraw this case"
      confirmMessage="Withdraw this case? This can't be undone — you'll need to open a new one to try again."
    />
  );
}
