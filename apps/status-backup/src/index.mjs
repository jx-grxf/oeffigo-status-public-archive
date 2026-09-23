import { runBackup } from "./backup.mjs";

try {
  await runBackup();
} catch (error) {
  console.error(
    `Status backup failed: ${error instanceof Error ? error.name : "unknown error"}`,
  );
  process.exitCode = 1;
}
