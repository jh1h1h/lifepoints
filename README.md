# LifePoints

LifePoints has two sections in one React/Firebase site: **Points**, a quiet weekly tracker for Growth, People, Life, and Play / Novelty, and **Docs**, one flexible multiline document per friend or project. Each Points category contributes at most 25 points per local Monday–Sunday week, so the weekly total is at most 100. The app stores every activity at its original value, even when a category reaches its cap. Google sign-in and Firestore sync your records across devices.

## Local development

Requirements: Node 22 or newer, Python 3.13, and a Firebase project. Emulator tests also need Java 21.

```bash
npm install
python3.13 -m venv functions/venv
functions/venv/bin/python -m pip install -r functions/requirements-dev.txt
cp .env.example .env
# Fill in the Firebase web app values in .env
npm run dev
```

Open the URL printed by Vite. Missing Firebase settings show a setup message instead of a broken sign-in screen.

## Editing tasks

Tasks are edited in **Settings → Your tasks**. Add, edit, or delete tasks there; names, categories, descriptions, icons, points, and task notes sync through Firestore. Points may be positive fractions. On the Dashboard, `+ note` saves a note on the task card without logging an activity or awarding points; use `(edit)` beside the displayed note to change it. Clicking the task name/icon logs an activity.

New accounts receive a one-time starter list from `src/data/taskSeeds.ts`. The account `cjh.t01snake@gmail.com` receives the preserved former `tasks.py` list on its first login; all other users receive the general template. After initialization, Firestore is the only live source for that user's tasks. The marker at `users/{uid}/settings/taskList` prevents reseeding, even if the user deletes every task. Changing the seed file later does not overwrite anyone's list. Task IDs stay stable when a task is edited, and historical activities retain their original snapshots.

Task seed lists are only for new accounts, not an alternative way to edit an existing account's task list.
Because GitHub Pages serves public JavaScript, both first-login seed lists are visible to site visitors. Do not put secrets or private notes in seed definitions; personal notes added through the app are stored in the user's Firestore collection instead.

## Firebase setup

1. Create a Firebase project and register a Web app. Copy its config values into `.env` using `.env.example` as the template. Firebase web API keys identify the project; Firestore rules enforce access.
2. In Authentication, enable the Google provider. Add `localhost` and every deployed GitHub Pages domain to Authentication → Settings → Authorized domains. For a repository site, the domain is `USERNAME.github.io`.
3. Create a Firestore database. Upgrade the project to the Blaze plan to deploy second-generation Cloud Functions. Store the DeepSeek key with `npx firebase-tools functions:secrets:set DEEPSEEK_API_KEY --project YOUR_PROJECT_ID` (enter it at the private prompt). Deploy the rules and Python callables with `npx firebase-tools deploy --only firestore:rules,functions --project YOUR_PROJECT_ID` after logging in with `npx firebase-tools login`. Never put this key in `.env`, a `VITE_` variable, GitHub Actions, or Firestore.
4. Refresh the app and sign in with Google. Firebase Auth persists the session across refreshes. Each user reads and writes only their own Points documents; Docs writes are authenticated callable operations that use the token's UID.

The activity documents store `taskId`, `taskName`, `taskDescription`, `category`, `configuredPoints`, ISO `timestamp`, `note`, `createdAt`, and `updatedAt`. The document ID and authenticated path provide the activity ID and owner UID. Rules permit later edits only to `note` and `updatedAt`, keeping task snapshots fixed.

Tasks live in `users/{uid}/tasks/{taskId}` with their editable fields and a persistent task note. Editing or deleting one does not rewrite activities already logged from it. Deploy the updated `firestore.rules` before releasing the task editor; older rules do not grant access to the new task collection.

## GitHub Pages

Push this repository to GitHub and select **GitHub Actions** as the Pages source under Settings → Pages. The workflow in `.github/workflows/ci.yml` runs validation on pushes and pull requests. A push to `main` or a manually dispatched run on `main` deploys only after lint, TypeScript, unit and component tests, Firestore emulator tests, Playwright tests, and the build pass. Pull requests never deploy.

In repository Settings → Secrets and variables → Actions, add secret `VITE_FIREBASE_API_KEY` and variables `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, plus `VITE_FIREBASE_STORAGE_BUCKET` and `VITE_FIREBASE_MESSAGING_SENDER_ID` if supplied by Firebase. The Firebase web config is embedded in the public site; access control lives in Firebase rules. The workflow uses `/<repository-name>/` as Vite's base path. Set variable `VITE_BASE_PATH` to `/` for a `USERNAME.github.io` repository or a custom root domain, or to the appropriate subpath for another deployment.

Deploy Firestore rules and Functions separately when they change; Pages hosts only the frontend. The build copies `index.html` to `404.html`, giving GitHub Pages a static fallback for direct visits or refreshes at `/points`, `/docs/friends/:id`, and `/docs/projects/:id`. Asset URLs use the configured Vite base path, so repository subpaths work. The fallback is rendered as an HTTP 404 by Pages, but the application displays the requested route.

## Docs model and manual editing

The Docs section uses `users/{uid}/docs/{autoId}` for current records, with `entityType`, `name`, `normalizedName`, `aliases`, arbitrary multiline `content`, `revision`, `deleted`, and timestamps. Display names can repeat; immutable auto-generated IDs disambiguate records. There are no database topic categories or prescribed headings. Search matches names and aliases.

Every creation, changed content, rename, alias edit, and soft deletion atomically writes an event under `users/{uid}/docs/{autoId}/edits/{operationId}`. Creation is revision 0→1, even for empty content. Each event has a deterministic line delta, SHA-256 before/after hashes, source (`manual` or `ai_approved`), change type, and revision metadata. `functions/docs_delta.py` applies and verifies each patch independently of any AI model; missing or corrupted history is rejected. Soft deletion hides a record from lists but retains the record and all edits. Saving unchanged content creates no new revision.

The authenticated `docs_api` callable handles manual Docs writes. It checks the expected revision in a Firestore transaction, rejects stale edits, and stores a per-user operation record at `users/{uid}/docOperations/{operationId}` so retries with the same request cannot duplicate an edit. The UID comes from Firebase Auth, never from the browser request. Firestore rules grant only owner reads of Docs and edits and deny all direct client writes; the Admin SDK in the callables performs validated writes. Docs backup/import/export and general recovery are not included.

## Docs AI and approval

The `/docs` landing page is a chat. Type a question or describe a change, then review the suggested action before approving or rejecting it. The compact **Include full history** checkbox defaults off and keeps its choice within the current browser tab's chat session. Current-only mode retrieves matching current records without reading edits; full-history mode verifies and sends complete, chronological deltas for matching entities. If relevant history exceeds `AI_MAX_CONTEXT_CHARS` (default 45,000 characters), interpretation fails instead of truncating it. DeepSeek chooses whether to answer, clarify, or suggest an edit, including when an edit request is phrased as a question. It can ask about ambiguous names; the conversation ID and selected immutable entity ID are retained for a bounded follow-up. A query or clarification never writes an entity. Chat messages stay in browser session storage for that signed-in account, not in Firestore or analytics.

`interpretMessage` invokes DeepSeek from the Python backend only. The default model is `deepseek-v4-pro` at `https://api.deepseek.com`, using JSON mode, non-thinking responses, a 45-second timeout, and a 1,400-token output limit. The Python action engine strictly parses exactly one `create`, `add`, `modify`, `delete`, `query`, or `clarify` action. It does not classify intent with app-side punctuation, keyword, or duplicate-name rules. It still checks retrieved IDs, revisions, exact text spans, scope, and source references before offering a proposal. Versioned instructions live in `functions/ai_prompt.py`; the model is never allowed to execute tools or write Firestore. `DEEPSEEK_MODEL`, `DEEPSEEK_TIMEOUT_SECONDS`, `DEEPSEEK_MAX_OUTPUT_TOKENS`, `DEEPSEEK_MAX_RETRIES`, and `AI_MAX_CONTEXT_CHARS` are optional **backend-only** configuration variables.

Mutations become pending server-generated proposals at `users/{uid}/aiProposals/{proposalId}` for 24 hours. They do **not** update Docs until approved. The preview shows the exact insertion, replacement, selected deletion, or new document. Entire-document deletion requires an additional confirmation. The user may edit a proposed replacement or a new entity's name, but not the target ID or exact scope. `approveAction` verifies owner, status, expiry, revision, and original content, then commits the edit delta, current record, approval result, and proposal status in one Firestore transaction. `rejectAction` discards a pending proposal. Per-user `aiRequests` and `aiApprovals` records prevent duplicate interpretations and approvals; all AI bookkeeping is inaccessible to browser Firestore clients. AI-approved edit events are marked `ai_approved`. After confirmation, chat refreshes the affected document and history; a stale proposal can be regenerated against the latest content.

DeepSeek's [Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/) documents the JSON output, model and thinking-mode parameters used here. Timeouts are not retried automatically because the provider may have completed a billable response; the chat's retry control first reuses the same request ID to inspect a saved completed result.

The optional live evaluation uses synthetic data only and **is never run in CI**. Supply `DEEPSEEK_API_KEY` securely in your local environment (avoid putting its value in shell history), then run `functions/venv/bin/python functions/live_eval.py --max-calls 3 --max-usd 0.10`. It reports case pass/fail, latency, token usage, and an estimated running cost. Its budget is a preflight estimate, not an API-enforced hard spending limit; timeouts and provider pricing changes may affect actual charges. Check [current DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/) before using it.

The Functions emulator uses anonymous credentials only when `FIRESTORE_EMULATOR_HOST` is set; no local Google Application Default Credentials or service-account key is needed for these tests. Deployed Functions continue to use the Firebase Admin SDK's normal credentials.

## Tests

```bash
npm run test:unit        # scoring, dates, task seeds, history, backups, components
npm run lint
npm run typecheck
npm run test:rules       # Firestore emulator security tests; requires Java
npm run test:docs        # pytest delta and transaction tests against Firestore emulator
functions/venv/bin/python -m pytest tests/python/test_ai_provider.py -q  # provider/schema unit tests
npx playwright install --only-shell chromium
npm run test:e2e         # auth + Firestore + Functions emulators and browser flows
npm run validate         # lint, types, Vitest, build
```

Emulator and browser tests use the local Firebase emulators with a demo project ID. They never connect to production Firestore. Playwright uses anonymous accounts only inside the Auth emulator to exercise the signed-in app; production sign-in offers Google only. Its synthetic AI server runs locally on port 4319 and is selected only while `FIRESTORE_EMULATOR_HOST` is set; production requests remain directed to DeepSeek. `DEEPSEEK_API_KEY=e2e-only` in the browser test script is a non-secret test value, not a real key. The Python venv at `functions/venv` is required by Firebase's Functions emulator and is ignored by Git.

### Verification for Docs phase (2026-10-04)

Lint, Prettier, TypeScript, 32 Vitest tests, 8 Firestore rules tests, 9 Python tests (including emulator transactions), 18 Playwright tests, and a production build with `VITE_BASE_PATH=/lifepoints/` passed locally. The browser tests also passed with `GOOGLE_APPLICATION_CREDENTIALS` set to a nonexistent path, reproducing a CI runner without local ADC. The build produced identical `index.html` and `404.html` files with `/lifepoints/` asset URLs. Docs screens were visually inspected at 375px and 1280px; browser tests also checked 768px and no horizontal overflow. Cloud deployment and real Google sign-in were not exercised locally and require the Firebase/Pages configuration above.

### Verification for AI approval phase (2026-10-04)

Lint, TypeScript, 34 Vitest tests, 9 Firestore rules tests, 34 Python tests (including Firestore emulator approval transactions), 18 Playwright tests, Prettier, and a production build with `/lifepoints/` assets passed locally. The build's `index.html` and `404.html` matched. The browser suite covered the Docs overview at 375, 768, and 1280 pixels without horizontal scrolling. The optional paid DeepSeek evaluation was **not** run because no API key or spend authorization was supplied; deterministic mocked-provider and emulator tests passed. Cloud deployment and real Google sign-in were not exercised.

### Verification for Docs chat phase (2026-10-04)

The chat UI is in `src/components/DocsChat.tsx`, action previews are in `src/components/ActionPreview.tsx`, and the manual lists/detail/history remain in `src/pages/Docs.tsx`. The frontend keeps session-level conversation state while the Python Functions and Firestore proposals remain authoritative for all mutations. Duplicate-name choices send a candidate ID that the backend verifies against the stored clarification, and approval can validate an edited new-entity name. Playwright exercises all six action presentations against a local synthetic AI server and real Firebase emulators, including historical queries, rejection, manual history, duplicate-name clarification, mobile widths, and the Points regression flow. The live paid DeepSeek API and deployed Google sign-in have not been exercised; configure the secret and deploy the callable Functions before using chat on GitHub Pages.

Local checks passed: lint, TypeScript, Prettier, 43 Vitest tests, 36 Python tests with the Firestore emulator, 9 Firestore rules tests, 20 Playwright tests with Auth/Firestore/Functions emulators (also with no Application Default Credentials), and a `/lifepoints/` production build with matching `index.html`/`404.html` fallback files. The chat was visually inspected at 375px and 1280px; automated layout checks also covered 768px and no horizontal overflow. A warning remains for the existing large Firebase-containing main bundle. The optional paid live DeepSeek evaluation and cloud deployment were not run.

When an AI response cannot be validated, the chat shows the specific failed check. **Show error details** reveals the error code, request ID, and DeepSeek's raw response when one was received. The response is displayed as escaped text; it may contain excerpts of private documents, so it is not saved in browser session storage. Failed-request diagnostics are retained only in owner-scoped, server-managed Firestore request records to make retries with the same ID consistent. A failed interpretation never creates a pending proposal or changes a document.

### Intent routing update (2026-10-04)

The backend no longer uses punctuation, question words, historical-question keywords, duplicate-name heuristics, or deletion keywords to choose or veto an action. DeepSeek receives the retrieved context and selects one structured action. All model-chosen mutations remain visible proposals requiring user approval; users can edit proposed text where available, reject a wrong action, and explain the correction in chat. Server-side checks for authentication, owned target IDs, exact spans, revisions, references, and idempotent approval remain in place. Deterministic tests cover question-phrased edit requests, model-chosen clarification, unknown questions reaching the model, duplicate-name creation proposals, and no write before approval.

## Backups

Settings → Export JSON downloads `{ version, exportedAt, activities, tasks }`. Import validates activities and tasks before writing. By default it merges missing IDs and keeps existing records. The optional “Replace matching tasks” checkbox explicitly restores task settings from a backup while still leaving existing activity snapshots untouched. Older version-1 activity-only backups remain importable. Keep backups private because notes can contain personal information.

## Scoring and time

Week boundaries use the device's local timezone. A week starts Monday at 00:00 and ends Sunday at 23:59:59.999. Week keys use the ISO week year, so year boundaries remain stable. Charts use effective category totals, fixed 0–100 and 0–25 axes, and a diagonal stripe pattern whenever a category reaches 25. The activity list and JSON backup retain raw configured points.
