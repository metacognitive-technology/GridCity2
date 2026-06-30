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
