"use client";

import { toast } from "sonner";

export async function notifySavedSubscribers(
  send: () => Promise<{ success: boolean }>,
): Promise<void> {
  try {
    const result = await send();
    if (!result.success) throw new Error("Notifications unavailable");
  } catch {
    toast.error(
      "Gespeichert. Die Benachrichtigung konnte nicht gesendet werden.",
      {
        duration: Infinity,
        action: {
          label: "Erneut senden",
          onClick: () => {
            void notifySavedSubscribers(send);
          },
        },
      },
    );
  }
}
