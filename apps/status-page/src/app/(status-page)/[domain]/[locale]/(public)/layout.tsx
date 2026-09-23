import {
  StatusPageMain,
  StatusPageShell,
} from "@openstatus/ui/components/blocks/status-page-shell";
import { Suspense } from "react";

import { EmbedShell } from "../../../../../components/layout/embed-shell";
import { Footer } from "../../../../../components/nav/footer";
import { Header } from "../../../../../components/nav/header";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <EmbedShell>
        <StatusPageShell className="gap-0 overflow-x-clip group-data-[embed=true]/embed:min-h-0">
          <Header className="bg-background/70 sticky top-0 z-30 w-full border-b backdrop-blur-xl" />
          <StatusPageMain className="relative max-w-6xl px-4 py-0 group-data-[embed=true]/embed:mx-0 group-data-[embed=true]/embed:max-w-none sm:px-6">
            {children}
          </StatusPageMain>
          <Footer className="mt-16 w-full border-t" />
        </StatusPageShell>
      </EmbedShell>
    </Suspense>
  );
}
