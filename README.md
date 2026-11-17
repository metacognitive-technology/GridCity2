<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/fa3f03dd-c38d-413b-92db-5e11a2c39a73

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Run with Docker (recommended)

**Prerequisites:** Docker + Docker Compose

This is the easiest and most reliable way to run the app with all features (new buildings, vehicle routing, economy system, etc.).

```bash
# Start (or rebuild + start) the app on external port 3001
docker compose up --build
```

Then open **http://localhost:3001** in your browser.

### Common Docker commands

```bash
# Rebuild from scratch (use this if you don't see your latest changes)
docker compose down
docker compose build --no-cache
docker compose up

# Stop the app
docker compose down

# View logs
docker compose logs -f

# See what's running
docker ps
```

**Note:** The first time (or after `--no-cache`) the build can take a minute or two.

All features work out of the box for anonymous users in collaborative rooms. No Google Sign-In or social logins are used.

## Accounts

GridCity has no self-signup and no social login. An admin creates each account under Admin > Users. Anonymous visitors can still create rooms, join rooms, and edit the grid.

On boot, if the users table is empty and both `GRIDCITY_ADMIN_EMAIL` and `GRIDCITY_ADMIN_INITIAL_PASSWORD` are set, the server creates one admin. `GRIDCITY_ADMIN_PASSWORD` is an alias for the initial password. `GRIDCITY_ADMIN_NAME` defaults to Admin. `GRIDCITY_ADMIN_FORCE_CHANGE=0` leaves that account free to keep the initial password; any other value requires a new password at first login. A later restart does not create another admin and does not reset the password. The password is never written to the log. If the email or password is missing, startup continues with a warning and no admin account.

Sessions live in SQLite. The browser stores only the raw token in an HttpOnly cookie named `gc_session` (SameSite=Lax, Path=/, 30-day sliding expiry). The cookie is marked Secure only when the request is HTTPS (`trust proxy` is on, so `X-Forwarded-Proto: https` counts).

**HTTPS and the direct port.** A sign-in on `https://grid.metacognitive-bot.tech` sets a Secure cookie. Browsers will not send that cookie to `http://host:3001`. Sign in on the same origin you are using. Plain `http://host:3001` (and local dev) sets a non-Secure cookie that works on that HTTP origin.

State-changing `/api/*` calls send `X-GridCity: 1`. Pass the deploy variables in `.env.example` through the host environment; `docker-compose.yml` forwards the names with empty defaults.

## Tests (Playwright)

Browser and API smoke tests live in `e2e/`. First-time setup:

```bash
npm install
npx playwright install chromium
```

```bash
# Build a production bundle, serve it on :4173 with an isolated test DB, run tests
npm test

# Interactive UI / headed Chromium
npm run test:ui
npm run test:headed

# Against an already-running app (e.g. Docker on :3001)
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npm test
```

---

### Alternative: Run without Docker Compose

If you prefer plain `docker` commands:

```bash
# Force a clean build (important when code changes aren't appearing)
docker build --no-cache -t gridcity:local .

# Run it
docker run --rm \
  --name gridcity \
  -p 3001:3000 \
  -v gridcity_data:/app/data \
  gridcity:local
```

Then open http://localhost:3001.

Stop it with: `docker stop gridcity`
