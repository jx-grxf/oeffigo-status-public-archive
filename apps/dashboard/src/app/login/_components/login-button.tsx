"use client";

import { Badge } from "@openstatus/ui/components/ui/badge";
import { Button } from "@openstatus/ui/components/ui/button";
import { cn } from "@openstatus/ui/lib/utils";
import { useEffect, useState } from "react";

const STORAGE_KEY = "openstatus:last-login-provider";

type Provider = "github" | "google" | "oidc" | "email";

export function LoginButton({
  provider,
  children,
  onClick,
  className,
  ...props
}: {
  provider: Provider;
} & React.ComponentProps<typeof Button>) {
  const [isLastUsed, setIsLastUsed] = useState(false);

  useEffect(() => {
    try {
      const lastUsed = localStorage.getItem(STORAGE_KEY);
      setIsLastUsed(lastUsed === provider);
    } catch {
      setIsLastUsed(false);
    }
  }, [provider]);

  return (
    <Button
      variant="secondary"
      className={cn(
        "relative w-full",
        isLastUsed && "border-primary border",
        className,
      )}
      onClick={(e) => {
        try {
          localStorage.setItem(STORAGE_KEY, provider);
        } catch {
          /* Browser storage is optional. */
        }
        onClick?.(e);
      }}
      {...props}
    >
      {children}
      {isLastUsed ? (
        <Badge
          variant="secondary"
          className="border-primary bg-background absolute -top-2.5 -right-2.5 border text-[10px]"
        >
          Zuletzt verwendet
        </Badge>
      ) : null}
    </Button>
  );
}
