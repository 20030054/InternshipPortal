import type { CaseState, DocumentType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { getEvaluationForCase } from "@/server/supervisor/service";

/**
 * M15: the one data-aggregation function behind `/cases/:id` — every
 * other module's dashboard already fetches its own shape of case data
 * directly via Prisma from inside a Server Component (see
 * `src/server/dashboards/*.ts`); this follows the same convention
 * rather than having the new page `fetch()` its own API.
 *
 * Deliberately read-only and free of any authorization decision of its
 * own — the caller (the page) has already run the same `case.view_own`/
 * `case.view_any` + "404, not 403" ownership check every other per-case
 * route uses (M05 onward) before calling this. `viewerCanSeeEvaluation`
 * is passed in rather than re-read here so this function has no direct
 * dependency on `SHOW_EVALUATION_TO_STUDENT`/the caller's identity —
 * one caller, one place the flag is actually read
 * (`src/app/api/cases/:id/evaluation/route.ts`'s existing check is
 * mirrored, not duplicated, at the one new call site in
 * `src/app/cases/[id]/page.tsx`).
 */

export type CaseDetailDocument = {
  id: string;
  type: DocumentType;
  originalFilename: string;
  status: "ACTIVE" | "SUPERSEDED";
  verified: boolean;
  verificationMethod: string | null;
};

export type CaseDetail = {
  id: string;
  state: CaseState;
  studentName: string;
  studentEmail: string;
  companyName: string | null;
  companyContact: string | null;
  workDescription: string | null;
  relevanceConfirmed: boolean | null;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  documents: CaseDetailDocument[];
  liveSupervisorToken: { supervisorEmail: string; usedAt: Date | null; expiresAt: Date } | null;
  evaluation: { performanceRating: number; comments: string } | null;
  recommendedGradeValue: "P" | "I" | null;
  grade: { value: "P" | "I" } | null;
};

export async function getCaseDetail(
  caseId: string,
  viewerCanSeeEvaluation: boolean,
): Promise<CaseDetail | null> {
  const kase = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      state: true,
      workDescription: true,
      relevanceConfirmed: true,
      plannedStart: true,
      plannedEnd: true,
      actualStart: true,
      actualEnd: true,
      recommendedGradeValue: true,
      student: { select: { user: { select: { email: true, fullName: true } } } },
      company: { select: { name: true, contact: true } },
      documents: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          type: true,
          originalFilename: true,
          status: true,
          verifications: { select: { method: true }, take: 1 },
        },
      },
      supervisorTokens: {
        where: { revokedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { supervisorEmail: true, usedAt: true, expiresAt: true },
      },
      grade: { select: { value: true } },
    },
  });
  if (!kase) return null;

  const evaluation = viewerCanSeeEvaluation ? await getEvaluationForCase(caseId) : null;

  return {
    id: kase.id,
    state: kase.state,
    studentName: kase.student.user.fullName ?? kase.student.user.email,
    studentEmail: kase.student.user.email,
    companyName: kase.company?.name ?? null,
    companyContact: kase.company?.contact ?? null,
    workDescription: kase.workDescription,
    relevanceConfirmed: kase.relevanceConfirmed,
    plannedStart: kase.plannedStart,
    plannedEnd: kase.plannedEnd,
    actualStart: kase.actualStart,
    actualEnd: kase.actualEnd,
    documents: kase.documents.map((doc) => ({
      id: doc.id,
      type: doc.type,
      originalFilename: doc.originalFilename,
      status: doc.status,
      verified: doc.verifications.length > 0,
      verificationMethod: doc.verifications[0]?.method ?? null,
    })),
    liveSupervisorToken: kase.supervisorTokens[0] ?? null,
    evaluation: evaluation
      ? (evaluation.content as { performanceRating: number; comments: string })
      : null,
    recommendedGradeValue: kase.recommendedGradeValue,
    grade: kase.grade,
  };
}
