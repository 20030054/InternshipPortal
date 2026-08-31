"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * M15: the one generic form wrapper every action-taking form in the
 * new `/cases/:id` page (and the student's "open case" entry point)
 * is built on. Deliberately thin — it exists only to remove the
 * fetch/loading/error/refresh boilerplate every one of the ~11 forms
 * would otherwise repeat, not to hide any business logic: every field
 * name here must match the target route's own Zod schema (D-101)
 * exactly, since this component does no validation of its own beyond
 * what the browser's native `required`/`type` attributes give for
 * free — the real API route is still the only authority on whether a
 * submission is actually valid (MASTER_PROMPT.md §9: "the UI hides
 * what the API forbids — but the API forbidding it is the control").
 *
 * `credentials: "same-origin"` is what carries the session cookie;
 * no `Origin`/`Referer` header needs setting explicitly — the browser
 * sets both on every same-origin fetch already, which is exactly what
 * `src/middleware.ts`'s CSRF check (M14) validates against.
 *
 * `encoding: "multipart"` sends the raw `FormData` as-is (for the
 * three file-upload routes); `"json"` (the default) walks the form's
 * own elements rather than `FormData.entries()` so native input
 * `type`s survive the trip — a `type="number"` input becomes a JSON
 * number, `type="checkbox"` becomes a JSON boolean, everything else
 * (including `type="date"`, whose native `YYYY-MM-DD` value already
 * matches every date field's `z.string().date()` schema exactly) stays
 * a trimmed string.
 */
export function ActionForm({
  action,
  encoding = "json",
  submitLabel,
  confirmMessage,
  variant = "primary",
  children,
}: {
  action: string;
  encoding?: "json" | "multipart";
  submitLabel: string;
  /** A native `window.confirm()` prompt before submitting — used only
   * for the handful of actions with no undo (reject, deny, escalate). */
  confirmMessage?: string;
  variant?: "primary" | "secondary";
  children?: ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    const form = event.currentTarget;
    setPending(true);
    setError(null);

    try {
      const response = await fetch(action, {
        method: "POST",
        credentials: "same-origin",
        ...(encoding === "multipart"
          ? { body: new FormData(form) }
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(collectJsonBody(form)),
            }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(
          body?.message ??
            formatIssues(body?.issues) ??
            formatReasons(body?.reasons) ??
            body?.error ??
            `Request failed (${response.status}).`,
        );
        return;
      }

      form.reset();
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {children}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" variant={variant} disabled={pending} size="sm">
        {pending ? "Submitting…" : submitLabel}
      </Button>
    </form>
  );
}

function collectJsonBody(
  form: HTMLFormElement,
): Record<string, string | number | boolean | string[]> {
  const elements = Array.from(form.elements).filter(
    (el): el is HTMLInputElement =>
      el instanceof HTMLInputElement && el.type === "checkbox" && el.name !== "",
  );
  // A checkbox *group* — more than one checkbox sharing the same
  // `name`, each with its own explicit `value` (a role, a method,
  // etc.) — collects into a string array (e.g. createUserSchema's
  // `roles: z.array(...)`). A single checkbox with that name is the
  // existing "boolean flag" shape (e.g. `relevanceConfirmed`) instead;
  // distinguishing the two by count, not by markup, means no extra
  // prop is needed on `CheckboxField` to say which kind it is.
  const checkboxNameCounts = new Map<string, number>();
  for (const el of elements) {
    checkboxNameCounts.set(el.name, (checkboxNameCounts.get(el.name) ?? 0) + 1);
  }
  const groupNames = new Set(
    [...checkboxNameCounts.entries()].filter(([, count]) => count > 1).map(([name]) => name),
  );

  const body: Record<string, string | number | boolean | string[]> = {};
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement) && !(element instanceof HTMLSelectElement)) {
      continue;
    }
    if (!element.name) continue;

    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      if (groupNames.has(element.name)) {
        if (!element.checked) continue;
        const existing = body[element.name];
        const group = Array.isArray(existing) ? existing : [];
        group.push(element.value);
        body[element.name] = group;
      } else {
        body[element.name] = element.checked;
      }
    } else if (element instanceof HTMLInputElement && element.type === "number") {
      body[element.name] = element.value === "" ? NaN : Number(element.value);
    } else {
      const value = element.value.trim();
      // An empty, non-required text field is omitted rather than sent
      // as `""` — several schemas (e.g. awardGradeSchema's `reason`)
      // use `z.string().min(1).optional()`, where `.optional()` only
      // treats a genuinely *absent* key as "not provided"; an empty
      // string is a present value that fails `.min(1)` even though
      // the field itself is meant to be skippable.
      if (value === "" && !element.required) continue;
      body[element.name] = value;
    }
  }

  // A group with nothing checked never appears in the loop above at
  // all (every checkbox in it was skipped as unchecked) — but the
  // route's own schema (`.min(1)`) needs to see an explicit empty
  // array to reject it cleanly, not a missing key that reads as
  // "field omitted."
  for (const name of groupNames) {
    if (!(name in body)) body[name] = [];
  }

  return body;
}

/** `TransitionGuardError`'s serialized shape (e.g.
 * `POST /api/cases/:id/mark-verified`'s 422: `{reasons: [...]}`) —
 * plain strings, not Zod's `{message, path}` issue objects. */
function formatReasons(reasons: unknown): string | null {
  if (!Array.isArray(reasons) || reasons.length === 0) return null;
  return reasons.filter((r): r is string => typeof r === "string").join("; ") || null;
}

/** Zod's `safeParse` failures arrive as `{issues: [{message, path}]}` —
 * every route that validates a body this way returns that shape
 * verbatim (see e.g. `src/schemas/offers.ts`'s consumers), so this is
 * the one place that turns it into one readable line rather than each
 * form re-deriving it. */
function formatIssues(issues: unknown): string | null {
  if (!Array.isArray(issues) || issues.length === 0) return null;
  return issues
    .map((issue) => (typeof issue === "object" && issue && "message" in issue ? String(issue.message) : null))
    .filter((message): message is string => message !== null)
    .join("; ") || null;
}
