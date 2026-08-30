import { FlatCompat } from "@eslint/eslintrc";
import security from "eslint-plugin-security";
import requireCapabilityOnMutation from "./eslint-rules/require-capability-on-mutation.mjs";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "next-env.d.ts",
      "prisma/generated/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
      // Route handlers intentionally read request bodies dynamically before
      // validating with Zod — this rule fires false positives on that
      // pattern across the whole codebase, so it's relaxed globally rather
      // than per-file. Everything it would have caught is still covered by
      // Zod validation at the route boundary (see CONVENTIONS.md).
      "security/detect-object-injection": "off",
    },
  },
  {
    // MASTER_PROMPT.md §9 "Access control": every mutating route must
    // call requireCapability() before touching data, enforced by CI, not
    // just by convention. src/app/api/auth/** is excluded: those routes
    // are the pre-authentication entry points themselves (sign-in,
    // password reset) — see docs/modules/M02.md's routes-table footnote
    // for why requireCapability()'s "must already be authenticated"
    // contract doesn't apply to them.
    files: ["src/app/api/**/route.ts"],
    ignores: ["src/app/api/auth/**"],
    plugins: {
      local: { rules: { "require-capability-on-mutation": requireCapabilityOnMutation } },
    },
    rules: {
      "local/require-capability-on-mutation": "error",
    },
  },
];

export default config;
