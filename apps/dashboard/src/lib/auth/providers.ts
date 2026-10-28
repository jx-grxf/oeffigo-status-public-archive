import { claimMailCooldown } from "@openstatus/api/src/security/mail-cooldown";
import { verifyTurnstile } from "@openstatus/api/src/security/turnstile";
import { EmailClient } from "@openstatus/emails";
import type { Profile } from "next-auth";
import type { OIDCConfig } from "next-auth/providers";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import WorkOS from "next-auth/providers/workos";

import { fetchGitHubOwnerProfile, mapGitHubOwnerProfile } from "./github-owner";
import { isAllowedOwner } from "./owner";

export const GitHubProvider = GitHub({
  clientId: process.env.AUTH_GITHUB_ID,
  clientSecret: process.env.AUTH_GITHUB_SECRET,
  authorization: { params: { scope: "read:user user:email" } },
  userinfo: {
    request: ({ tokens }: { tokens: { access_token?: string } }) =>
      fetchGitHubOwnerProfile(tokens.access_token),
  },
  profile: mapGitHubOwnerProfile,
  // Only the fixed GitHub owner can reach this mapping to the canonical owner email.
  allowDangerousEmailAccountLinking: true,
});

export const GoogleProvider = Google({
  allowDangerousEmailAccountLinking: true,
  authorization: {
    params: {
      // See https://openid.net/specs/openid-connect-core-1_0.html#AuthRequest
      prompt: "select_account",
      // scope:
      //   "https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email",
    },
  },
});

export const OIDCProvider: OIDCConfig<Profile> = {
  id: "oidc",
  name: process.env.AUTH_OIDC_NAME ?? "SSO",
  type: "oidc",
  issuer: process.env.AUTH_OIDC_ISSUER,
  clientId: process.env.AUTH_OIDC_ID,
  clientSecret: process.env.AUTH_OIDC_SECRET,
  checks: ["pkce", "state"],
};

// The stock provider bakes an empty `connection=` into the authorize URL, and
// WorkOS requires exactly one of connection/organization/provider — so the
// empty one collides with the per-request `organization` we pass at signIn.
export const WorkOSProvider = WorkOS({
  clientId: process.env.AUTH_WORKOS_ID,
  clientSecret: process.env.AUTH_WORKOS_SECRET,
  authorization: { url: "https://api.workos.com/sso/authorize", params: {} },
  allowDangerousEmailAccountLinking: true,
});

export const ResendProvider = Resend({
  apiKey: process.env.RESEND_API_KEY,
  async sendVerificationRequest(params) {
    if (!isAllowedOwner(params.identifier)) {
      throw new Error("Access denied");
    }
    const body: unknown = await params.request.json();
    const token =
      body && typeof body === "object" && "cf-turnstile-response" in body
        ? body["cf-turnstile-response"]
        : undefined;
    await verifyTurnstile({
      token,
      action: "status-login",
      requestHostname: new URL(params.request.url).hostname,
    });
    await claimMailCooldown("login", params.identifier);
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is required");
    }
    const client = new EmailClient({ apiKey: process.env.RESEND_API_KEY });
    await client.sendStatusPageMagicLink({
      to: params.identifier.trim().toLowerCase(),
      page: "ÖffiGo Statusverwaltung",
      link: params.url,
    });
  },
});
