import Link from "next/link";

/**
 * M15: no shared layout/nav existed anywhere (each M13 screen is
 * standalone) — the smallest possible way to make `/waivers` actually
 * reachable from the three dashboards whose roles can all act on it
 * (`case.view_any`: FOCAL/HOD/DEAN), without a bigger navigation-shell
 * rework this fix doesn't need.
 */
export function WaiversNavLink() {
  return (
    <Link href="/waivers" className="text-sm text-mid underline-offset-2 hover:underline">
      Waivers →
    </Link>
  );
}
