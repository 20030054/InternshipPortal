import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";

/**
 * MASTER_PROMPT.md §9: "Every mutating route calls requireCapability()
 * before touching data. A route without it fails a CI lint rule — write
 * that rule." This proves the rule (eslint-rules/require-capability-on-mutation.mjs)
 * actually does that, rather than trusting a one-off manual check.
 *
 * Uses ESLint's Node API directly against in-memory fixtures rather than
 * committing real broken route files under src/app/api — a permanently
 * broken fixture route would itself need excluding from every other check
 * (typecheck, build) and would be confusing to find in the tree. The
 * `filePath` passed to lintText is enough for flat config's `files`
 * globs to match without the file needing to exist on disk.
 */
describe("ESLint rule: local/require-capability-on-mutation", () => {
  async function lintAsRoute(code: string, filePath: string) {
    const eslint = new ESLint({ cwd: process.cwd() });
    const [result] = await eslint.lintText(code, { filePath });
    return result;
  }

  it("flags a mutating route with no requireCapability() call", async () => {
    const badRoute = `
      import { NextResponse } from "next/server";
      import { prisma } from "@/server/db/client";

      export async function POST() {
        await prisma.user.update({ where: { id: "x" }, data: { email: "y" } });
        return NextResponse.json({ ok: true });
      }
    `;

    const result = await lintAsRoute(
      badRoute,
      "src/app/api/_fixture_bad/route.ts",
    );

    const messages = result?.messages ?? [];
    expect(
      messages.some(
        (m) => m.ruleId === "local/require-capability-on-mutation",
      ),
    ).toBe(true);
  });

  it("passes a mutating route that does call requireCapability()", async () => {
    const goodRoute = `
      import { NextResponse } from "next/server";
      import { prisma } from "@/server/db/client";
      import { getCurrentIdentity } from "@/server/auth/current-identity";
      import { requireCapability } from "@/server/authz/require-capability";

      export async function POST() {
        const identity = await getCurrentIdentity();
        requireCapability(identity, "users.manage");
        await prisma.user.update({ where: { id: "x" }, data: { email: "y" } });
        return NextResponse.json({ ok: true });
      }
    `;

    const result = await lintAsRoute(
      goodRoute,
      "src/app/api/_fixture_good/route.ts",
    );

    const messages = result?.messages ?? [];
    expect(
      messages.some(
        (m) => m.ruleId === "local/require-capability-on-mutation",
      ),
    ).toBe(false);
  });

  it("does not apply to routes under src/app/api/auth/** (pre-authentication entry points)", async () => {
    const authRoute = `
      import { NextResponse } from "next/server";
      import { prisma } from "@/server/db/client";

      export async function POST() {
        await prisma.passwordResetToken.create({ data: {} });
        return NextResponse.json({ ok: true });
      }
    `;

    const result = await lintAsRoute(
      authRoute,
      "src/app/api/auth/password-reset/request/route.ts",
    );

    const messages = result?.messages ?? [];
    expect(
      messages.some(
        (m) => m.ruleId === "local/require-capability-on-mutation",
      ),
    ).toBe(false);
  });

  it("does not flag a non-mutating route with no requireCapability() call", async () => {
    const readOnlyRoute = `
      import { NextResponse } from "next/server";
      import { prisma } from "@/server/db/client";

      export async function GET() {
        const users = await prisma.user.findMany();
        return NextResponse.json(users);
      }
    `;

    const result = await lintAsRoute(
      readOnlyRoute,
      "src/app/api/_fixture_readonly/route.ts",
    );

    const messages = result?.messages ?? [];
    expect(
      messages.some(
        (m) => m.ruleId === "local/require-capability-on-mutation",
      ),
    ).toBe(false);
  });
});
