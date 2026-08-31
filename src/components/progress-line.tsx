import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProgressLineResult } from "@/server/dashboards/progress-line";
import { Badge } from "@/components/ui/badge";

/**
 * §10: "The eight-step progress line is the student's entire home
 * page. It is the same graphic as the departmental poster, rendered
 * live." Pure rendering of `computeProgressLine()`'s output — no data
 * fetching here, so it's trivially reusable for the case-summary PDF's
 * layout logic later without duplicating step semantics.
 */
export function ProgressLine({ progress }: { progress: ProgressLineResult }) {
  if (progress.type === "exception") {
    const variant = progress.kind === "withdrawn" ? "neutral" : progress.terminal ? "deep" : "gold";
    return (
      <div className="rounded-lg border border-deep/10 bg-tint p-4">
        <Badge variant={variant}>{progress.kind === "restart" ? "Restart" : progress.kind === "waiver" ? "Waiver" : "Withdrawn"}</Badge>
        <p className="mt-2 text-sm text-ink">{progress.label}</p>
      </div>
    );
  }

  return (
    <div>
      <ol className="flex flex-col gap-0 sm:flex-row sm:items-start">
        {progress.steps.map((step, i) => (
          <li key={step.step} className="flex flex-1 flex-col sm:items-center">
            <div className="flex items-center gap-2 sm:w-full sm:flex-col sm:gap-1">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium",
                  step.status === "done" && "bg-ok text-white",
                  step.status === "current" && "bg-gold text-white",
                  step.status === "upcoming" && "bg-tint text-muted",
                )}
                aria-hidden
              >
                {step.status === "done" ? <Check className="h-4 w-4" /> : step.step}
              </span>
              <div className="sm:text-center">
                <p
                  className={cn(
                    "text-sm font-medium",
                    step.status === "current" ? "text-deep" : "text-ink",
                  )}
                >
                  {step.label}
                  {step.status === "current" && <span className="sr-only"> (current step)</span>}
                </p>
                <p className="text-xs text-muted">{step.actor}</p>
              </div>
            </div>
            {i < progress.steps.length - 1 && (
              <div
                className="my-2 h-px w-full bg-deep/10 sm:my-3"
                aria-hidden
              />
            )}
          </li>
        ))}
      </ol>
      {progress.terminal && progress.outcome && (
        <p className="mt-4 text-sm font-medium">
          Final grade:{" "}
          <Badge variant={progress.outcome === "pass" ? "ok" : "danger"}>
            {progress.outcome === "pass" ? "Pass" : "Incomplete"}
          </Badge>
        </p>
      )}
    </div>
  );
}
