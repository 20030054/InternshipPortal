import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
// Side-effect import: forces TS to resolve this module so the
// `declare module "next-auth/jwt"` augmentation below actually attaches
// (a bare `declare module` with no other reference to that module path
// fails to resolve under this project's moduleResolution setting).
import "next-auth/jwt";
import type { RoleName } from "@prisma/client";
import { loadIdentity } from "./identity";
import { authorizeCredentials } from "./authorize-credentials";

// Module augmentation: the session/JWT shapes this app actually uses.
// Only `sub` (user id, built in) and `tokenVersion` are trusted from the
// token itself — `roles` is refreshed from the database on every request
// by the `jwt` callback below, never trusted as a stable claim (see
// docs/modules/M02.md "Session and JWT design").
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      roles: RoleName[];
      tokenVersion: number;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    roles?: RoleName[];
    tokenVersion?: number;
  }
}

// TODO(OQ-05): BNU has not confirmed whether an OIDC/SAML identity
// provider will be available. Implemented per the restrictive-default
// reading of §0.2: self-managed argon2id credentials only. Auth.js's
// provider model makes adding an OIDC provider later additive — a new
// entry in `providers`, not a rewrite of this file.
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.SESSION_SECRET,
  // Required behind a reverse proxy (Caddy) that terminates TLS and
  // forwards the original Host header — without this Auth.js rejects the
  // request as an untrusted host.
  trustHost: true,
  session: {
    strategy: "jwt",
    // "Short session lifetime with sliding renewal" (§9). Neither number
    // is specified by the master prompt; both are logged in
    // DECISIONS.md.
    maxAge: 8 * 60 * 60,
    updateAge: 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Password" },
      },
      authorize: authorizeCredentials,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const userId = user?.id ?? token.sub;
      if (!userId) return token;

      // Re-read on every call (sign-in AND every subsequent request),
      // not just at sign-in. This is what makes password-change and
      // role-change invalidation true by construction rather than
      // something a revoke-path has to remember to do.
      const identity = await loadIdentity(userId);
      if (!identity) {
        // Missing or disabled account — invalidate the session outright.
        return null;
      }

      token.sub = identity.userId;
      token.roles = identity.roles;
      token.tokenVersion = identity.tokenVersion;
      return token;
    },
    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
        session.user.roles = token.roles ?? [];
        session.user.tokenVersion = token.tokenVersion ?? -1;
      }
      return session;
    },
  },
});
