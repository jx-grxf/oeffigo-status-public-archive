"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function Turnstile({
  action,
  onToken,
  resetKey = 0,
  language = "de",
}: {
  action: "status-subscribe" | "status-login";
  onToken: (token: string) => void;
  resetKey?: number;
  language?: "de" | "en";
}) {
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!ready || !sitekey || !container.current || !window.turnstile) return;
    let active = true;
    callback.current("");
    widget.current = window.turnstile.render(container.current, {
      sitekey,
      action,
      theme: "auto",
      language,
      size: "flexible",
      "response-field": false,
      callback: (token: string) => {
        if (active) {
          setError(false);
          callback.current(token);
        }
      },
      "expired-callback": () => {
        if (!active) return;
        callback.current("");
        if (widget.current !== null) window.turnstile?.reset(widget.current);
      },
      "timeout-callback": () => {
        if (active) {
          callback.current("");
          setError(true);
        }
      },
      "error-callback": () => {
        if (active) {
          callback.current("");
          setError(true);
        }
      },
    });
    return () => {
      active = false;
      if (widget.current !== null) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [ready, sitekey, action, resetKey, retry, language]);

  return (
    <div className="grid gap-2">
      {sitekey ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          onReady={() => setReady(true)}
          onError={() => {
            setError(true);
            callback.current("");
          }}
        />
      ) : null}
      <div ref={container} data-action={action} />
      {!sitekey || error ? (
        <p role="alert" className="text-muted-foreground text-sm">
          {language === "en"
            ? "The security check is currently unavailable. Please try again."
            : "Die Sicherheitsprüfung ist derzeit nicht verfügbar. Bitte versuche es erneut."}
          {sitekey ? (
            <button
              type="button"
              className="ml-1 underline"
              onClick={() => {
                if (!ready) {
                  window.location.reload();
                  return;
                }
                setError(false);
                setRetry((value) => value + 1);
              }}
            >
              {language === "en" ? "Try again" : "Erneut prüfen"}
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
