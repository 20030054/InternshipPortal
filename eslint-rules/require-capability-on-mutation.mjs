// MASTER_PROMPT.md §9 "Access control": "Every mutating route calls
// requireCapability() before touching data. A route without it fails a
// CI lint rule — write that rule." This is that rule.
//
// Heuristic, not a precise dataflow analysis: if a route file (anywhere
// in it — including a helper function it calls) contains a call to one of
// Prisma's mutating methods, the file must also contain a call to
// requireCapability() somewhere. That's enough to catch the actual
// mistake this rule exists for — a new mutating route shipped with no
// authorization check at all — without needing to prove the
// requireCapability() call actually gates that specific mutation at
// runtime; a code reviewer, not a linter, is the right tool for "is the
// check in the right place."
//
// Wired up in eslint.config.mjs against src/app/api/**/route.ts, with
// src/app/api/auth/** excluded — see docs/modules/M02.md's routes-table
// footnote for why those routes have no capability to check.

const MUTATING_PRISMA_METHODS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
  "$transaction",
  "$executeRaw",
  "$executeRawUnsafe",
]);

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Route files under src/app/api/**/route.ts that call a Prisma mutation must also call requireCapability().",
    },
    schema: [],
    messages: {
      missingRequireCapability:
        "This route file calls a Prisma mutation ('{{method}}') but never calls requireCapability(). Every mutating route must authorize before touching data — see MASTER_PROMPT.md §9.",
    },
  },
  create(context) {
    let mutationNode = null;
    let mutationMethod = "";
    let hasRequireCapabilityCall = false;

    return {
      CallExpression(node) {
        const { callee } = node;

        if (
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          MUTATING_PRISMA_METHODS.has(callee.property.name)
        ) {
          if (!mutationNode) {
            mutationNode = node;
            mutationMethod = callee.property.name;
          }
        }

        if (callee.type === "Identifier" && callee.name === "requireCapability") {
          hasRequireCapabilityCall = true;
        }
      },
      "Program:exit"() {
        if (mutationNode && !hasRequireCapabilityCall) {
          context.report({
            node: mutationNode,
            messageId: "missingRequireCapability",
            data: { method: mutationMethod },
          });
        }
      },
    };
  },
};

export default rule;
