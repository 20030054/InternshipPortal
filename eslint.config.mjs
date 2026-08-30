import { FlatCompat } from "@eslint/eslintrc";
import security from "eslint-plugin-security";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "next-env.d.ts",
      "worker/**",
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
    // TODO(M02): once mutating routes exist, add a custom rule here (or a
    // small local plugin) that fails the build if a route handler under
    // src/app/api/**/route.ts performs a mutation without a preceding
    // requireCapability() call — see MASTER_PROMPT.md §9 "Access control".
    // No mutating routes exist yet in M00, so there's nothing to lint.
    files: ["src/app/api/**/route.ts"],
    rules: {},
  },
];

export default config;
