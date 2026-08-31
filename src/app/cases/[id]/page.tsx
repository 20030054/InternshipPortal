import { notFound, redirect } from "next/navigation";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability, UnauthenticatedError } from "@/server/authz/require-capability";
import { prisma } from "@/server/db/client";
import { getCaseDetail } from "@/server/cases/detail";
import { rolesGrantCapability } from "@/server/authz/matrix";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubmitOfferForm } from "@/components/case-actions/submit-offer-form";
import { OfferReviewForms } from "@/components/case-actions/offer-review-forms";
import { ProgressLogForm } from "@/components/case-actions/progress-log-form";
import { CompleteInternshipForm } from "@/components/case-actions/complete-internship-form";
import { CompletionCertificateForm } from "@/components/case-actions/completion-certificate-form";
import { IssueSupervisorTokenForm } from "@/components/case-actions/issue-supervisor-token-form";
import { VerifyDocumentForm } from "@/components/case-actions/verify-document-form";
import { MarkVerifiedButton } from "@/components/case-actions/mark-verified-button";
import { RecommendGradeForm } from "@/components/case-actions/recommend-grade-form";
import { AwardGradeForm } from "@/components/case-actions/award-grade-form";
import { RestartRequestForm } from "@/components/case-actions/restart-request-form";
import { RestartRequestsPanel } from "@/components/case-actions/restart-requests-panel";
import { ReverseGradeForm } from "@/components/case-actions/reverse-grade-form";

/**
 * M15: one screen per case, the thing every dashboard row now links
 * to. Same `case.view_own`/`case.view_any` + "404, not 403" ownership
 * pattern every per-case API route has used since M05 — `notFound()`
 * is the page-rendering equivalent of those routes' `404` JSON
 * response, not a new authorization decision of its own.
 *
 * Which action forms render is decided by two independent, narrow
 * checks per action — the capability the viewer's roles hold (cheap,
 * already-known), and the case's raw `state` compared against a
 * single expected value — never a re-implementation of the real
 * guards those routes themselves enforce. See docs/modules/M15.md
 * "Design decisions."
 */
export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rawIdentity = await getCurrentIdentity();
  if (!rawIdentity) redirect("/login");

  let identity;
  let ownershipRequired: boolean;
  try {
    identity = requireCapability(rawIdentity, "case.view_any");
    ownershipRequired = false;
  } catch (err) {
    if (err instanceof UnauthenticatedError) redirect("/login");
    try {
      identity = requireCapability(rawIdentity, "case.view_own");
      ownershipRequired = true;
    } catch {
      notFound();
    }
  }

  const caseRow = await prisma.case.findUnique({
    where: { id },
    select: { studentId: true },
  });
  if (!caseRow) notFound();

  if (ownershipRequired) {
    const student = await prisma.student.findUnique({
      where: { userId: identity.userId },
      select: { id: true },
    });
    if (student?.id !== caseRow.studentId) notFound();
  }

  // Same rule GET /api/cases/:id/evaluation already enforces (§9
  // "Privacy"): FOCAL/HOD/DEAN (case.view_any) always see it; a
  // Student only if the department has flipped the config flag.
  const viewerCanSeeEvaluation = !ownershipRequired || process.env.SHOW_EVALUATION_TO_STUDENT === "true";

  const detail = await getCaseDetail(id, viewerCanSeeEvaluation);
  if (!detail) notFound();

  const isOwner = ownershipRequired;
  const canApproveOffer = rolesGrantCapability(identity.roles, "offer.approve");
  const canIssueToken = rolesGrantCapability(identity.roles, "supervisor_token.issue");
  const canVerify = rolesGrantCapability(identity.roles, "deliverable.verify");
  const canRecommend = rolesGrantCapability(identity.roles, "grade.recommend");
  const canAward = rolesGrantCapability(identity.roles, "grade.award");
  const canInitiateRestart = rolesGrantCapability(identity.roles, "restart.initiate");
  const canCountersignRestart = rolesGrantCapability(identity.roles, "restart.countersign");
  const canEscalateRestart = rolesGrantCapability(identity.roles, "escalation.rule_restart");
  const canReverseGrade = rolesGrantCapability(identity.roles, "grade.reverse");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <div>
        <p className="text-sm font-medium tracking-wide text-muted">{detail.studentName}</p>
        <h1 className="font-serif text-3xl text-deep">
          {detail.companyName ?? "Internship case"}
        </h1>
        <Badge variant="deep" className="mt-2">
          {detail.state.replaceAll("_", " ")}
        </Badge>
        <a
          href={`/api/cases/${id}/summary-pdf`}
          className="ml-3 text-sm text-mid underline-offset-2 hover:underline"
        >
          Download case summary (PDF)
        </a>
      </div>

      <Card>
        <CardTitle>Details</CardTitle>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Company</dt>
          <dd className="text-ink">{detail.companyName ?? "—"}</dd>
          <dt className="text-muted">Planned dates</dt>
          <dd className="text-ink">{formatRange(detail.plannedStart, detail.plannedEnd)}</dd>
          <dt className="text-muted">Actual dates</dt>
          <dd className="text-ink">{formatRange(detail.actualStart, detail.actualEnd)}</dd>
          {detail.grade && (
            <>
              <dt className="text-muted">Final grade</dt>
              <dd className="text-ink">{detail.grade.value === "P" ? "Pass" : "Incomplete"}</dd>
            </>
          )}
        </dl>
        {detail.documents.length > 0 && (
          <div className="mt-4 border-t border-deep/10 pt-4">
            <p className="text-sm font-medium text-deep">Documents</p>
            <ul className="mt-2 flex flex-col gap-3">
              {detail.documents.map((doc) => (
                <li key={doc.id} className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    {doc.type.replaceAll("_", " ")} —{" "}
                    <a
                      href={`/api/documents/${doc.id}/download`}
                      className="text-mid underline-offset-2 hover:underline"
                    >
                      {doc.originalFilename}
                    </a>{" "}
                    {doc.verified ? (
                      <Badge variant="ok">Verified</Badge>
                    ) : (
                      <Badge variant="neutral">Not yet verified</Badge>
                    )}
                  </span>
                  {!doc.verified && canVerify && detail.state === "PENDING_VERIFICATION" && (
                    <VerifyDocumentForm documentId={doc.id} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {detail.evaluation && (
          <div className="mt-4 border-t border-deep/10 pt-4">
            <p className="text-sm font-medium text-deep">Supervisor evaluation</p>
            <p className="mt-1 text-sm text-ink">Rating: {detail.evaluation.performanceRating}/5</p>
            <p className="mt-1 text-sm text-ink">{detail.evaluation.comments}</p>
          </div>
        )}
      </Card>

      {isOwner && (detail.state === "ELIGIBLE" || detail.state === "OFFER_REJECTED") && (
        <SubmitOfferForm caseId={id} />
      )}
      {isOwner && detail.state === "IN_PROGRESS" && (
        <>
          <ProgressLogForm caseId={id} />
          <CompleteInternshipForm caseId={id} />
        </>
      )}
      {isOwner && (detail.state === "IN_PROGRESS" || detail.state === "DOCS_PENDING") && (
        <CompletionCertificateForm caseId={id} />
      )}

      {canApproveOffer && detail.state === "OFFER_UNDER_REVIEW" && (
        <OfferReviewForms caseId={id} />
      )}
      {canIssueToken && detail.state === "DOCS_PENDING" && !detail.liveSupervisorToken && (
        <IssueSupervisorTokenForm caseId={id} />
      )}
      {canIssueToken && detail.liveSupervisorToken && !detail.evaluation && (
        <Card>
          <CardTitle>Evaluation link sent</CardTitle>
          <p className="mt-1 text-sm text-ink">
            Sent to {detail.liveSupervisorToken.supervisorEmail}, expires{" "}
            {detail.liveSupervisorToken.expiresAt.toLocaleDateString()}
            {detail.liveSupervisorToken.usedAt ? " — already submitted." : " — awaiting response."}
          </p>
        </Card>
      )}
      {canVerify && detail.state === "PENDING_VERIFICATION" && <MarkVerifiedButton caseId={id} />}
      {canRecommend && detail.state === "VERIFIED" && <RecommendGradeForm caseId={id} />}
      {canAward && detail.state === "GRADE_RECOMMENDED" && (
        <AwardGradeForm caseId={id} recommendedGradeValue={detail.recommendedGradeValue} />
      )}

      {/* The restart gate (§1.2's first exception path) — reachable
          only from CLOSED_INCOMPLETE (BR-16). */}
      {canInitiateRestart && detail.state === "CLOSED_INCOMPLETE" && (
        <RestartRequestForm caseId={id} />
      )}
      <RestartRequestsPanel
        requests={detail.restartRequests}
        canCountersign={canCountersignRestart}
        canEscalate={canEscalateRestart}
      />

      {/* BR-14's correction mechanism — available on any case with an
          awarded grade, Pass or Incomplete, not state-gated the way
          everything else on this page is (a reversal can legitimately
          happen well after a case has closed). */}
      {canReverseGrade && detail.grade && <ReverseGradeForm gradeId={detail.grade.id} />}
    </main>
  );
}

function formatRange(start: Date | null, end: Date | null): string {
  if (!start || !end) return "—";
  return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
}
