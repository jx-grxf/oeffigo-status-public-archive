export type EnglishCopy = {
  reports: Record<number, { title: string | null }>;
  updates: Record<number, { message: string | null }>;
  maintenances: Record<
    number,
    { title: string | null; message: string | null }
  >;
};

type Report = {
  id: number;
  title: string;
  statusReportUpdates: { id: number; message: string }[];
};
type Maintenance = { id: number; title: string; message: string };

/** Replaces German report text with its English copy; `german` marks what is left. */
export function localizeReport<T extends Report>(
  report: T,
  copy: EnglishCopy | null | undefined,
): T & { german: boolean; germanTitle: boolean } {
  if (!copy) return { ...report, german: true, germanTitle: true };
  const title = copy.reports[report.id]?.title;
  let german = !title;
  const statusReportUpdates = report.statusReportUpdates.map((update) => {
    const message = copy.updates[update.id]?.message;
    if (!message) german = true;
    return message ? { ...update, message } : update;
  });
  return {
    ...report,
    title: title ?? report.title,
    statusReportUpdates,
    german,
    germanTitle: !title,
  };
}

export function localizeMaintenance<T extends Maintenance>(
  maintenance: T,
  copy: EnglishCopy | null | undefined,
): T & { german: boolean; germanTitle: boolean } {
  const english = copy?.maintenances[maintenance.id];
  return {
    ...maintenance,
    title: english?.title ?? maintenance.title,
    message: english?.message ?? maintenance.message,
    german: !english?.title || !english?.message,
    germanTitle: !english?.title,
  };
}
