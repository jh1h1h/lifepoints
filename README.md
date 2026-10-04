# LifePoints

LifePoints is a quiet weekly points tracker for Growth, People, Life, and Play / Novelty. Each category contributes at most 25 points per local Monday–Sunday week, so the weekly total is at most 100. The app stores every activity at its original value, even when a category reaches its cap. Google sign-in and Firestore sync your records across devices.

## Local development

Requirements: Node 22 or newer and a Firebase project. Emulator tests also need Java 21.

```bash
npm install
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
3. Create a Firestore database. Deploy `firestore.rules` with `npx firebase-tools deploy --only firestore:rules --project YOUR_PROJECT_ID` after logging in with `npx firebase-tools login`.
4. Refresh the app and sign in with Google. Firebase Auth persists the session across refreshes. Each user reads and writes only their own activity, task, and settings documents.

The activity documents store `taskId`, `taskName`, `taskDescription`, `category`, `configuredPoints`, ISO `timestamp`, `note`, `createdAt`, and `updatedAt`. The document ID and authenticated path provide the activity ID and owner UID. Rules permit later edits only to `note` and `updatedAt`, keeping task snapshots fixed.

Tasks live in `users/{uid}/tasks/{taskId}` with their editable fields and a persistent task note. Editing or deleting one does not rewrite activities already logged from it. Deploy the updated `firestore.rules` before releasing the task editor; older rules do not grant access to the new task collection.

## GitHub Pages

Push this repository to GitHub and select **GitHub Actions** as the Pages source under Settings → Pages. The workflow in `.github/workflows/ci.yml` runs validation on pushes and pull requests. A push to `main` or a manually dispatched run on `main` deploys only after lint, TypeScript, unit and component tests, Firestore emulator tests, Playwright tests, and the build pass. Pull requests never deploy.

In repository Settings → Secrets and variables → Actions, add secret `VITE_FIREBASE_API_KEY` and variables `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, plus `VITE_FIREBASE_STORAGE_BUCKET` and `VITE_FIREBASE_MESSAGING_SENDER_ID` if supplied by Firebase. The Firebase web config is embedded in the public site; access control lives in Firebase rules. The workflow uses `/<repository-name>/` as Vite's base path. Set variable `VITE_BASE_PATH` to `/` for a `USERNAME.github.io` repository or a custom root domain, or to the appropriate subpath for another deployment.

Deploy the Firestore rules separately when they change; Pages hosts only the frontend. GitHub Pages uses static assets and the app's in-page navigation, so refreshing any screen still loads the site's index page.

## Tests

```bash
npm run test:unit        # scoring, dates, task seeds, history, backups, components
npm run lint
npm run typecheck
npm run test:rules       # Firestore emulator security tests; requires Java
npx playwright install --only-shell chromium
npm run test:e2e         # auth + Firestore emulators and browser flows
npm run validate         # lint, types, Vitest, build
```

Emulator and browser tests use the local Firebase emulators with a test project ID. They never connect to production Firestore. Playwright uses anonymous accounts only inside the Auth emulator to exercise the signed-in app; production sign-in offers Google only.

## Backups

Settings → Export JSON downloads `{ version, exportedAt, activities, tasks }`. Import validates activities and tasks before writing. By default it merges missing IDs and keeps existing records. The optional “Replace matching tasks” checkbox explicitly restores task settings from a backup while still leaving existing activity snapshots untouched. Older version-1 activity-only backups remain importable. Keep backups private because notes can contain personal information.

## Scoring and time

Week boundaries use the device's local timezone. A week starts Monday at 00:00 and ends Sunday at 23:59:59.999. Week keys use the ISO week year, so year boundaries remain stable. Charts use effective category totals, fixed 0–100 and 0–25 axes, and a diagonal stripe pattern whenever a category reaches 25. The activity list and JSON backup retain raw configured points.
