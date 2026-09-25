# ÖffiGo Status — Public Source Archive

This repository publishes versioned source snapshots for the [ÖffiGo Status](https://status.oeffigo.app) website, its administration service, and the encrypted backup worker. The site is a customized, self-hosted fork of [OpenStatus](https://github.com/openstatusHQ/openstatus), licensed under the [GNU Affero General Public License v3.0](LICENSE).

**Source revision:** `8908824785723ec02f436305852fc51141359d86`

Each snapshot is tagged `source-<private commit SHA>`. The live website links to the tag for its running deployment. The default branch may contain a newer candidate while a deployment is in progress; use the tag linked by the website when you need the corresponding source for the version you are using.

## Contents

- `apps/status-page` — the public status website.
- `apps/dashboard` — the administration application.
- `apps/status-backup` — the private database backup worker; no credentials or recovery key are included.
- `packages` — shared code required by those applications.
- `ops` — Docker build and bootstrap scripts.
- Root manifests and lockfiles required to reproduce the builds.

This is a source mirror, not a copy of production data. It contains no subscriber database, operator notes, deployment credentials, or private configuration. It intentionally omits unrelated OpenStatus applications that are not part of the running status service.

## Build

The repository uses Node.js 24.18.0 and pnpm 11.2.1. From the repository root:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @openstatus/react build
pnpm --filter @openstatus/status-page exec tsc --noEmit
pnpm --filter @openstatus/dashboard exec tsc --noEmit
```

The application Dockerfiles are `ops/status-page.Dockerfile`, `ops/dashboard.Dockerfile`, and `ops/status-backup.Dockerfile`. Running a private instance requires your own libSQL database, authentication secrets, mail configuration, object storage, and encryption identity. No production credentials are provided here.

## Licensing and attribution

The source retains the original OpenStatus license and attribution. ÖffiGo's modifications are available under the same AGPL-3.0 terms. The official transit app, its API, and their data are separate projects and are not included in this archive.
