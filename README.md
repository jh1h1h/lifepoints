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
3. Create a Firestore database. Upgrade the project to the Blaze plan to deploy second-generation Cloud Functions. Deploy the rules and the Python callable with `npx firebase-tools deploy --only firestore:rules,functions --project YOUR_PROJECT_ID` after logging in with `npx firebase-tools login`.
4. Refresh the app and sign in with Google. Firebase Auth persists the session across refreshes. Each user reads and writes only their own Points documents; Docs writes are authenticated callable operations that use the token's UID.

The activity documents store `taskId`, `taskName`, `taskDescription`, `category`, `configuredPoints`, ISO `timestamp`, `note`, `createdAt`, and `updatedAt`. The document ID and authenticated path provide the activity ID and owner UID. Rules permit later edits only to `note` and `updatedAt`, keeping task snapshots fixed.

Tasks live in `users/{uid}/tasks/{taskId}` with their editable fields and a persistent task note. Editing or deleting one does not rewrite activities already logged from it. Deploy the updated `firestore.rules` before releasing the task editor; older rules do not grant access to the new task collection.

## GitHub Pages

Push this repository to GitHub and select **GitHub Actions** as the Pages source under Settings → Pages. The workflow in `.github/workflows/ci.yml` runs validation on pushes and pull requests. A push to `main` or a manually dispatched run on `main` deploys only after lint, TypeScript, unit and component tests, Firestore emulator tests, Playwright tests, and the build pass. Pull requests never deploy.

In repository Settings → Secrets and variables → Actions, add secret `VITE_FIREBASE_API_KEY` and variables `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, plus `VITE_FIREBASE_STORAGE_BUCKET` and `VITE_FIREBASE_MESSAGING_SENDER_ID` if supplied by Firebase. The Firebase web config is embedded in the public site; access control lives in Firebase rules. The workflow uses `/<repository-name>/` as Vite's base path. Set variable `VITE_BASE_PATH` to `/` for a `USERNAME.github.io` repository or a custom root domain, or to the appropriate subpath for another deployment.

Deploy Firestore rules and Functions separately when they change; Pages hosts only the frontend. The build copies `index.html` to `404.html`, giving GitHub Pages a static fallback for direct visits or refreshes at `/points`, `/docs/friends/:id`, and `/docs/projects/:id`. Asset URLs use the configured Vite base path, so repository subpaths work. The fallback is rendered as an HTTP 404 by Pages, but the application displays the requested route.

## Docs model and manual editing

The Docs section uses `users/{uid}/docs/{autoId}` for current records, with `entityType`, `name`, `normalizedName`, `aliases`, arbitrary multiline `content`, `revision`, `deleted`, and timestamps. Display names can repeat; immutable auto-generated IDs disambiguate records. There are no database topic categories or prescribed headings. Search matches names and aliases.

Every creation, changed content, rename, alias edit, and soft deletion atomically writes an event under `users/{uid}/docs/{autoId}/edits/{operationId}`. Creation is revision 0→1, even for empty content. Each event has a deterministic line delta, SHA-256 before/after hashes, source (`manual` in this phase), change type, and revision metadata. `functions/docs_delta.py` applies and verifies each patch independently of any AI model; missing or corrupted history is rejected. Soft deletion hides a record from lists but retains the record and all edits. Saving unchanged content creates no new revision.

The authenticated `docs_api` callable is the only Docs write path. It checks the expected revision in a Firestore transaction, rejects stale edits, and stores a per-user operation record at `users/{uid}/docOperations/{operationId}` so retries with the same request cannot duplicate an edit. The UID comes from Firebase Auth, never from the browser request. Firestore rules grant only owner reads of Docs and edits and deny all direct client writes; the Admin SDK in the callable performs validated writes. No AI integration, Docs backup/import/export, or general recovery feature is included in this phase.

The Functions emulator uses anonymous credentials only when `FIRESTORE_EMULATOR_HOST` is set; no local Google Application Default Credentials or service-account key is needed for these tests. Deployed Functions continue to use the Firebase Admin SDK's normal credentials.

## Tests

```bash
npm run test:unit        # scoring, dates, task seeds, history, backups, components
npm run lint
npm run typecheck
npm run test:rules       # Firestore emulator security tests; requires Java
npm run test:docs        # pytest delta and transaction tests against Firestore emulator
npx playwright install --only-shell chromium
npm run test:e2e         # auth + Firestore + Functions emulators and browser flows
npm run validate         # lint, types, Vitest, build
```

Emulator and browser tests use the local Firebase emulators with a demo project ID. They never connect to production Firestore. Playwright uses anonymous accounts only inside the Auth emulator to exercise the signed-in app; production sign-in offers Google only. The Python venv at `functions/venv` is required by Firebase's Functions emulator and is ignored by Git.

### Verification for Docs phase (2026-10-04)

Lint, Prettier, TypeScript, 32 Vitest tests, 8 Firestore rules tests, 9 Python tests (including emulator transactions), 18 Playwright tests, and a production build with `VITE_BASE_PATH=/lifepoints/` passed locally. The browser tests also passed with `GOOGLE_APPLICATION_CREDENTIALS` set to a nonexistent path, reproducing a CI runner without local ADC. The build produced identical `index.html` and `404.html` files with `/lifepoints/` asset URLs. Docs screens were visually inspected at 375px and 1280px; browser tests also checked 768px and no horizontal overflow. Cloud deployment and real Google sign-in were not exercised locally and require the Firebase/Pages configuration above.

## Backups

Settings → Export JSON downloads `{ version, exportedAt, activities, tasks }`. Import validates activities and tasks before writing. By default it merges missing IDs and keeps existing records. The optional “Replace matching tasks” checkbox explicitly restores task settings from a backup while still leaving existing activity snapshots untouched. Older version-1 activity-only backups remain importable. Keep backups private because notes can contain personal information.

## Scoring and time

Week boundaries use the device's local timezone. A week starts Monday at 00:00 and ends Sunday at 23:59:59.999. Week keys use the ISO week year, so year boundaries remain stable. Charts use effective category totals, fixed 0–100 and 0–25 axes, and a diagonal stripe pattern whenever a category reaches 25. The activity list and JSON backup retain raw configured points.
