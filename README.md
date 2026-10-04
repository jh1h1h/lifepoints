# LifePoints

LifePoints is a quiet weekly points tracker for Growth, People, Life, and Play / Novelty. Each category contributes at most 25 points per local Monday–Sunday week, so the weekly total is at most 100. The app stores every activity at its original value, even when a category reaches its cap. Google sign-in and Firestore sync your records across devices.

## Local development

Requirements: Node 22 or newer, Python 3.10 or newer, and a Firebase project. Emulator tests also need Java 21.

```bash
npm install
cp .env.example .env
# Fill in the Firebase web app values in .env
python3 scripts/generate_tasks.py
npm run dev
```

Open the URL printed by Vite. `npm run dev` and `npm run build` regenerate `src/generated/tasks.json` automatically. Missing Firebase settings show a setup message instead of a broken sign-in screen.

## Editing tasks

Edit only `tasks.py`. `TASKS` is the sole list of predefined tasks; `src/generated/tasks.json` is generated. To rename or revalue a task, change its `name` or `points` in that list, then run `npm run generate:tasks`. To add a task, add a dictionary with a new unique `id`, valid category (`growth`, `people`, `life`, or `play`), non-empty name, description, and icon, and positive integer points. To remove a task, remove its dictionary. Existing activity records keep their saved names, descriptions, categories, and point values.

Do not reuse or rename existing task IDs if historical entries already exist.

The Python generator validates every field and fails on duplicate IDs or malformed tasks. `python3 scripts/generate_tasks.py --check` checks that the generated JSON is current without changing it.

## Firebase setup

1. Create a Firebase project and register a Web app. Copy its config values into `.env` using `.env.example` as the template. Firebase web API keys identify the project; Firestore rules enforce access.
2. In Authentication, enable the Google provider. Add `localhost` and every deployed GitHub Pages domain to Authentication → Settings → Authorized domains. For a repository site, the domain is `USERNAME.github.io`.
3. Create a Firestore database. Deploy `firestore.rules` with `npx firebase-tools deploy --only firestore:rules --project YOUR_PROJECT_ID` after logging in with `npx firebase-tools login`.
4. Refresh the app and sign in with Google. Firebase Auth persists the session across refreshes. Each user reads and writes only `users/{uid}/activities`.

The activity documents store `taskId`, `taskName`, `taskDescription`, `category`, `configuredPoints`, ISO `timestamp`, `note`, `createdAt`, and `updatedAt`. The document ID and authenticated path provide the activity ID and owner UID. Rules permit later edits only to `note` and `updatedAt`, keeping task snapshots fixed.

## GitHub Pages

Push this repository to GitHub and select **GitHub Actions** as the Pages source under Settings → Pages. The workflow in `.github/workflows/ci.yml` runs validation on pushes and pull requests. A push to `main` or a manually dispatched run on `main` deploys only after Python tests, lint, TypeScript, unit and component tests, Firestore emulator tests, Playwright tests, and the build pass. Pull requests never deploy.

In repository Settings → Secrets and variables → Actions, add secret `VITE_FIREBASE_API_KEY` and variables `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, plus `VITE_FIREBASE_STORAGE_BUCKET` and `VITE_FIREBASE_MESSAGING_SENDER_ID` if supplied by Firebase. The Firebase web config is embedded in the public site; access control lives in Firebase rules. The workflow uses `/<repository-name>/` as Vite's base path. Set variable `VITE_BASE_PATH` to `/` for a `USERNAME.github.io` repository or a custom root domain, or to the appropriate subpath for another deployment.

Deploy the Firestore rules separately when they change; Pages hosts only the frontend. GitHub Pages uses static assets and the app's in-page navigation, so refreshing any screen still loads the site's index page.

## Tests

```bash
npm run test:python      # task validation and deterministic generation
npm run test:unit        # scoring, dates, history, backups, components
npm run lint
npm run typecheck
npm run test:rules       # Firestore emulator security tests; requires Java
npx playwright install --only-shell chromium
npm run test:e2e         # auth + Firestore emulators and browser flows
npm run validate         # Python, lint, types, Vitest, build
```

Emulator and browser tests use the local Firebase emulators with a test project ID. They never connect to production Firestore. Playwright uses anonymous accounts only inside the Auth emulator to exercise the signed-in app; production sign-in offers Google only.

## Backups

Settings → Export JSON downloads `{ version, exportedAt, activities }`. Import validates the file, its activity IDs, categories, points, notes, and dates before writing. It merges missing IDs into the signed-in account and skips existing IDs, so an import does not replace existing records. Keep backups private because notes can contain personal information.

## Scoring and time

Week boundaries use the device's local timezone. A week starts Monday at 00:00 and ends Sunday at 23:59:59.999. Week keys use the ISO week year, so year boundaries remain stable. Charts use effective category totals, fixed 0–100 and 0–25 axes, and a diagonal stripe pattern whenever a category reaches 25. The activity list and JSON backup retain raw configured points.
