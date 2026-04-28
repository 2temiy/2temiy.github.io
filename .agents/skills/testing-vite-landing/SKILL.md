# Testing Vite Landing Page

Use this skill when testing the React/Vite landing page in this repo.

## Devin Secrets Needed

None for the static landing-page flow. The app can be tested locally without login or API credentials.

## Local Setup

1. Install dependencies from the repo root:
   ```bash
   npm install
   ```
2. Start the dev server:
   ```bash
   npm run dev -- --host 0.0.0.0
   ```
3. Open Chrome to `http://localhost:3000/`.

## Build Check

Run:
```bash
npm run build
```

## Primary UI Test Flow

1. Verify the landing page loads at `/` and shows the product branding and hero copy.
2. Verify the upload/analyzer mockup is visible.
3. Click a non-default role card, such as `AWP`, and verify the analyzer summary under `Обраний стиль` updates to that role.
4. Click `Як це працює` and verify the feature cards section appears.
5. Click `Спробувати демо` and verify the upload mockup section is visible again.

## Notes

- This app is frontend-only for the landing-page flow; do not request secrets unless future changes add authenticated APIs.
- Record browser testing and annotate the role-selection and CTA-navigation assertions.
