"use client";

import { GitHubIcon } from "@openstatus/icons/brand";
import { Button } from "@openstatus/ui/components/ui/button";
import { useFormStatus } from "react-dom";

export function GitHubLoginButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      <GitHubIcon aria-hidden="true" className="size-4" />
      {pending ? "Weiter zu GitHub…" : "Mit GitHub anmelden"}
    </Button>
  );
}
