"use server";

import { getWorkspaceByVerifiedSsoDomain } from "@openstatus/services/sso";
import { cookies, headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";

import { signIn } from "@/lib/auth";
import { isGitHubLoginConfigured } from "@/lib/auth/github-owner";
import { ssoLookupRateLimit } from "@/lib/rate-limit/sso-lookup";
import { SSO_ORG_COOKIE } from "@/lib/sso-cookie";

export async function signInWithResendAction(
  formData: FormData,
): Promise<{ success: boolean }> {
  try {
    const destination = await signIn("resend", {
      email: String(formData.get("email") ?? ""),
      "cf-turnstile-response": String(
        formData.get("cf-turnstile-response") ?? "",
      ),
      redirect: false,
      redirectTo: "/overview",
    });
    return {
      success:
        typeof destination === "string" &&
        new URL(destination).pathname.endsWith("/verify-request"),
    };
  } catch {
    return { success: false };
  }
}

export type SsoFormState = { error?: string };

export async function signInWithGitHubAction(): Promise<void> {
  if (!isGitHubLoginConfigured()) redirect("/login?error=Configuration");
  try {
    await signIn("github", { redirectTo: "/overview" });
  } catch (error) {
    unstable_rethrow(error);
    redirect("/login?error=OAuthSignin");
  }
}

// Deliberately identical for "no such domain", "SSO disabled" and "rate
// limited": a specific message would tell an unauthenticated caller which
// companies use openstatus and which of them have SSO.
const GENERIC_ERROR =
  "We couldn't start SSO for that email. Try GitHub or Google.";

export async function startSsoSignIn(
  _prevState: SsoFormState,
  formData: FormData,
): Promise<SsoFormState> {
  const email = String(formData.get("email") ?? "");
  const redirectToRaw = String(formData.get("redirectTo") ?? "");
  const redirectTo =
    redirectToRaw.startsWith("/") && !redirectToRaw.startsWith("//")
      ? redirectToRaw
      : "/overview";

  if (!email.includes("@")) return { error: GENERIC_ERROR };

  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await ssoLookupRateLimit(ip))) return { error: GENERIC_ERROR };

  const workspace = await getWorkspaceByVerifiedSsoDomain(email);
  if (!workspace?.workosOrganizationId) return { error: GENERIC_ERROR };

  const cookieStore = await cookies();
  cookieStore.set(SSO_ORG_COOKIE, workspace.workosOrganizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

  await signIn(
    "workos",
    { redirectTo },
    { organization: workspace.workosOrganizationId },
  );

  return {};
}
