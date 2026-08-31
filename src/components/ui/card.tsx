import { cn } from "@/lib/utils";

/** §10: "Tables over cards for lists. Cards are for single objects." —
 * used for the summary tiles (state counts) and section wrappers, never
 * for a list of rows. */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-deep/10 bg-white p-5 shadow-sm", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("font-serif text-lg text-deep", className)} {...props} />;
}
