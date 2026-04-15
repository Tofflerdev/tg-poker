# Testing Patterns

**Analysis Date:** 2026-04-13

## Current State: No Test Suite

**The project has no automated tests.** This was verified by:

- No test files under `server/`, `client/src/`, or `types/` (only matches for `*.test.*` / `*.spec.*` are inside `node_modules/`)
- No `vitest.config.*`, `jest.config.*`, `playwright.config.*`, or `cypress.config.*` in the project (only inside `node_modules/`)
- No `test`, `test:unit`, or `test:e2e` scripts in either `package.json` (root) or `client/package.json`
- No testing libraries in dependencies: no `vitest`, `jest`, `@testing-library/*`, `supertest`, `playwright`, `cypress`, `mocha`, `chai`
- No `__tests__/` directories anywhere in the project
- No `.github/workflows/` — no CI pipeline exists

## Manual Verification Artifacts

The following files suggest testing is currently manual:

- `prod-check.png` — screenshot-based production verification
- `screenshots/` — directory of manual UI checks
- `client/21429.png`, `client/315254.png` — design reference images
- `DevToolbar` component (`client/src/components/DevToolbar.tsx`) — lazy-loaded dev-only toolbar, used for multi-tab manual testing
- `?player=1..6` URL parameter in `App.tsx:36-48` — enables multi-tab local testing with deterministic player IDs (100001–100006)
- Dev-mode auth bypass in `server/middleware/auth.ts` — accepts empty `initData` with optional `devId`

## Runtime Diagnostic Endpoints

- `GET /` on the server returns a status JSON: table count, active player count, table summary (`server/index.ts:40-48`). This is the only exposed health-check surface.

## CI / CD

- No GitHub Actions, GitLab CI, or other CI config present
- Deployment is script-driven: `deploy.sh`, `deploy_part2_remote.sh`, `update.sh`, `docker-entrypoint.sh`, `Dockerfile`, `docker-compose.prod.yml`, `nginx/`
- No pre-commit hooks (`husky`, `lint-staged`) configured

## Recommendations

Given the poker engine is the highest-risk area, adding tests should be prioritized in this order:

1. **Unit tests for `server/Game.ts`** (828-line core engine)
   - Recommended: **Vitest** (aligns with existing Vite on client; single framework covers both sides)
   - Cover: betting round transitions, side-pot calculation, showdown winner determination, all-in edge cases, fold-to-win short-circuit, turn timer expiry
   - File layout: co-locate as `server/Game.test.ts` or create `server/__tests__/Game.test.ts`

2. **Unit tests for `server/Deck.ts`** — deterministic shuffle with seeded RNG; verify no duplicates, full 52-card deal

3. **Unit tests for `server/db/UserRepository.ts`** — daily bonus rules (balance < 1000 AND >24h since last claim → set to exactly 1000), balance adjustments, stats increments. Use a test Postgres container or swap in a mocked Prisma client.

4. **Integration tests for socket flow** — spin up `socket.io` server + `socket.io-client` in-process; cover auth → join table → full hand. Vitest works here via `node` test environment.

5. **Component tests for critical UI** — `GameControls.tsx`, `SeatsDisplay.tsx` with React Testing Library + Vitest + `jsdom` environment. Focus on: correct button enable/disable per `GameState`, fold-confirm flow, all-in styling.

6. **E2E smoke test** — Playwright scripted flow: two dev players (`?player=1`, `?player=2`) complete one hand. Run headless in CI.

7. **Add CI workflow** — `.github/workflows/ci.yml` running `tsc --noEmit` (server + client), then `vitest run`. Gate PRs on green CI.

8. **Add strict mode to client `tsconfig.json`** — currently missing `strict: true` (server has it). Enabling will surface type issues before they hit runtime.

## Suggested Minimal Setup

```bash
# Add to root package.json devDependencies
npm i -D vitest @vitest/ui

# Add scripts
"test": "vitest run",
"test:watch": "vitest",
"typecheck": "tsc --noEmit && cd client && tsc --noEmit"
```

Minimal `vitest.config.ts` at project root:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', include: ['server/**/*.test.ts', 'types/**/*.test.ts'] },
});
```

Separate `client/vitest.config.ts` with `environment: 'jsdom'` for component tests.

---

*Testing analysis: 2026-04-13*
