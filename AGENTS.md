# Repository Guidelines

## Project Structure & Module Organization

The implemented application is 拾日 (SHIRI), a three-part project for collaborative tasks and name generation. Product scope lives in `PLAN.md`; current status and verification results live in `STATUS.md` and `REVIEW.md`.

- `原型/` is the React 18, TypeScript, and Vite web client. It defaults to online mode; `src/OnlineApp.tsx` handles login, sync, tasks, libraries, records and sharing. `src/App.tsx` is the embedded local demo. `src/components.tsx`, `src/data.ts`, `src/icons.tsx` and the CSS files are shared UI/utilities.
- `原型/tests/` contains Happy DOM tests for the standalone demo and for the online UI against a deterministic fake API.
- `原型/scripts/build-standalone.mjs` produces `原型/prototype.html` from `原型/dist/`.
- `server/` is the Fastify / TypeScript / PostgreSQL API. `src/app.ts` holds routes and authorization; `src/state.ts` shapes the per-user snapshot; `migrations/` holds schema changes; `tests/` runs against a real temporary PostgreSQL and the actual Harmony business client.
- `harmony/` is the ArkTS / ArkUI Stage client. `entry/src/main/ets/pages/Index.ets` contains views and interactions; `domain/` holds models, rules, the HTTP client and reminder reconciliation; `services/` holds file, secure-storage, HTTP and system-reminder adapters; `tests/` contains Node tests and `entry/src/ohosTest/` contains device tests.
- `compose.yaml` starts only PostgreSQL for local development. The backend and clients run on the host.

## Build, Test, and Development Commands

Use Node.js 22+ and the declared package manager, `pnpm@11.25.0`. Keep lockfiles in sync.

### Web (`原型/`)

```bash
pnpm install --frozen-lockfile
pnpm dev          # Vite on http://localhost:5173; proxies /api to 127.0.0.1:3000
pnpm build        # Type-check, bundle, regenerate prototype.html
pnpm test         # pretest builds, then runs demo and online UI tests
pnpm preview      # Serve the production bundle with the same /api proxy
```

Directly opening `prototype.html` is for the local demo; online mode needs the Vite server or a same-origin reverse proxy.

### Server (`server/`)

```bash
pnpm install --frozen-lockfile
cp .env.example .env    # set DATABASE_URL; root .env holds POSTGRES_PASSWORD
pnpm migrate
pnpm seed                # optional: creates xiaoman / yizhou from DEMO_PASSWORD
pnpm dev
pnpm build
pnpm test                # embedded real PostgreSQL; no Docker required
pnpm start
```

From the repository root, `docker compose up -d db` starts PostgreSQL. Migrations are separate from service startup and must be run before a new version.

### Harmony (`harmony/`)

```bash
pnpm install --frozen-lockfile
pnpm test                # compiles domain/*.ets to temporary TypeScript, then runs Node tests
pnpm check:project       # checks entry, pages and resource references
pnpm build:native        # Linux/macOS command-line tools only; requires HARMONY_COMMAND_LINE_TOOLS and JAVA_HOME
pnpm build:device-tests  # Linux/macOS only; compiles the ohosTest target
```

On Windows use DevEco Studio to build. `build:native` does not prove NetworkKit, Asset Store, ArkUI or notification behavior on a device. Signing configuration is intentionally not committed; configure it locally in DevEco Studio and do not commit `signingConfigs`, certificates or passwords.

## Coding Style & Naming Conventions

Follow the existing TypeScript/ArkTS conventions: two-space indentation, single-quoted strings, and semicolons. Use PascalCase for components and types, camelCase for functions and variables, and kebab-case for CSS classes. Preserve Chinese UI copy and accessible labels. TypeScript strict mode rejects unused locals and parameters. No dedicated lint or formatting scripts are configured; keep new JSX readable and avoid the very long single-line blocks in the existing web views.

## Testing Guidelines

Tests use `node:test` and strict assertions. Add behavioral cases with descriptive scenario names.

- Web: `tests/*.test.mjs` with Happy DOM. Cover the online UI separately from the demo. `pnpm test` builds first so the standalone artifact is current.
- Server: `tests/*.test.ts` against a temporary real PostgreSQL 18; cover permissions, concurrency, migration, sharing, privacy and the actual Harmony client. Do not rely on a shared `DATABASE_URL`.
- Harmony: `tests/*.test.mjs` run against the compiled `domain/*.ets`; platform adapters and ArkUI need the device tests or manual validation.

No numeric coverage threshold is configured. For visual changes, also check desktop and mobile layouts in a browser.

## Commit & Pull Request Guidelines

Use short, imperative messages such as `Fix shared-list task assignment`. Include a change description, relevant issue links, validation commands and results, and screenshots for UI changes. Do not commit generated `dist/`, HAP/build output, signing material, `.env`, or local device files; `原型/prototype.html` is the intentional standalone deliverable and should be regenerated with `pnpm build`.

## Boundaries

Online mode is server-authoritative: permissions, version checks and conflict handling must stay in the API. The web demo and Harmony local experience are simulations and must not be treated as security mechanisms. Offline editing, remote push, Harmony 7 verification and cloud deployment remain outside the implemented scope; see `PLAN.md` and `STATUS.md`. Preserve the independence of task and name workflows.
