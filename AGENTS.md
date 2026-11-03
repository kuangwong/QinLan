# Repository Guidelines

## Project Structure & Module Organization

The implemented application is 拾日 (SHIRI), a React 18, TypeScript, and Vite browser prototype for collaborative tasks and name generation.

- `PLAN.md` describes the broader roadmap; backend, database, and HarmonyOS work remain planned.
- `原型/src/` contains `App.tsx` (views and interactions), `components.tsx` (shared UI), `data.ts` (types, seed data, persistence), `icons.tsx`, and `style.css`.
- `原型/public/` contains static assets, including the favicon.
- `原型/tests/prototype.test.mjs` exercises the generated standalone application.
- `原型/scripts/build-standalone.mjs` produces `原型/prototype.html` from `原型/dist/`.
- The root `src/` directory is currently empty; develop inside `原型/`.

## Build, Test, and Development Commands

Use Node.js 22+ and the declared package manager, `pnpm@11.25.0`. Run commands from `原型/`:

```bash
cd 原型
pnpm install          # Install dependencies using the lockfile
pnpm dev              # Start Vite, normally at http://localhost:5173
pnpm build            # Type-check, bundle, and regenerate prototype.html
pnpm test             # Run Node tests against prototype.html
pnpm preview          # Serve the production bundle locally
```

Build before testing source changes: tests load `prototype.html`, not source files. Rebuild the standalone deliverable rather than editing it manually. Keep dependency changes consistent with `pnpm-lock.yaml`; generated `dist/`, `node_modules/`, and `*.tsbuildinfo` are ignored.

## Coding Style & Naming Conventions

Follow existing TypeScript conventions: two-space indentation, single-quoted strings, and semicolons. Use PascalCase for components and types, camelCase for functions and variables, and kebab-case for CSS classes. Preserve Chinese UI copy and accessible labels. TypeScript enables strict checking and rejects unused locals and parameters. No dedicated lint or formatting scripts are configured.

## Testing Guidelines

Tests use `node:test`, strict assertions, and Happy DOM. Add behavioral cases to `tests/*.test.mjs` with descriptive scenario names. Cover affected task, sharing, membership, name-generation, and persistence flows. No numeric coverage threshold is configured. For visual changes, also check desktop and mobile layouts in a browser.

## Commit & Pull Request Guidelines

Git history is unavailable in this checkout, so existing commit conventions cannot be verified. Prefer short, imperative messages such as `Fix shared-list task assignment`. Include a change description, relevant issue links, validation commands and results, and screenshots for UI changes.

## Prototype Boundaries

Data lives in browser localStorage. Demo identities and invitations provide interface simulations; real authentication, server authorization, and cross-device synchronization are not implemented. Preserve the independence of task and name workflows.
