import { ArrowUpRight } from "lucide-react";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background min-h-svh">
      <header className="border-border flex items-center justify-between gap-4 border-b px-6 py-5 sm:px-10">
        <a
          href="https://oeffigo.app"
          className="text-xl font-semibold tracking-tight"
        >
          ÖffiGo
          <span className="text-muted-foreground ml-2 text-sm font-normal">
            Status
          </span>
        </a>
        <a
          href="https://status.oeffigo.app"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm transition-colors"
        >
          Zur Statusseite <ArrowUpRight aria-hidden="true" className="size-4" />
        </a>
      </header>
      <div className="mx-auto grid min-h-[calc(100svh-77px)] max-w-2xl">
        <main className="flex items-center justify-center px-6 py-12 sm:px-10 lg:py-20">
          {children}
        </main>
      </div>
    </div>
  );
}
