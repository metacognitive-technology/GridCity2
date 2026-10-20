# Project Rules

- Always allow anonymous users for authentication.
- DO NOT use Google Sign-In or any other social login providers.
- Ensure the application works seamlessly for unauthenticated/anonymous users in collaborative rooms.
- After every change, bump the app version (`npm run bump-version` or `npm run deploy`) and rebuild + redeploy with Docker. Do not leave source changes undeployed.
