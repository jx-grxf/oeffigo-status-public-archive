"use client";

import { Turnstile } from "@openstatus/ui/components/custom/turnstile";
import { Input } from "@openstatus/ui/components/ui/input";
import { Label } from "@openstatus/ui/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";

import { signInWithResendAction } from "./actions";
import { LoginButton } from "./login-button";

export default function MagicLinkForm() {
  const [pending, setPending] = useState(false);
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);

  return (
    <form
      action={async (formData) => {
        if (pending || !token) return;
        setPending(true);
        formData.set("cf-turnstile-response", token);
        try {
          const result = await signInWithResendAction(formData);
          if (result.success)
            toast.success(
              "Der Anmeldelink wurde verschickt. Bitte prüfe dein Postfach.",
            );
          else
            toast.error(
              "Anmeldung nicht möglich. Bitte prüfe die Adresse und versuche es in einer Minute erneut.",
            );
        } catch {
          toast.error(
            "Anmeldung nicht möglich. Bitte versuche es später erneut.",
          );
        } finally {
          setPending(false);
          setToken("");
          setResetKey((value) => value + 1);
        }
      }}
      className="grid gap-3"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="email">E-Mail-Adresse</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <Turnstile action="status-login" onToken={setToken} resetKey={resetKey} />
      <LoginButton provider="email" disabled={pending || !token}>
        {pending ? "Wird verschickt…" : "Anmeldelink anfordern"}
      </LoginButton>
    </form>
  );
}
