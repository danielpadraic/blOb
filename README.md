# blOb

Peer-to-peer fitness competitions with a credit buy-in, proof-backed workouts, and a global activity feed.

The app is Expo SDK 57 + Expo Router + TypeScript + NativeWind + Supabase.

## Stack

- Expo SDK 57, Expo Router, React Native 0.86
- NativeWind v4 (Tailwind)
- Supabase Auth, Postgres, Storage
- TanStack Query, Zod, React Hook Form
- Session persistence via `expo-secure-store` (chunked, because JWTs exceed the 2KB keychain limit)

## Setup

1. Use Node **20.19.4+** (SDK 57 will warn on older 20.x).
2. Copy env and fill in your project:

```sh
cp .env.example .env
```

Home composer GIF search uses Tenor. Set `EXPO_PUBLIC_TENOR_KEY` (a Tenor API v2 key). `EXPO_PUBLIC_GIPHY_KEY` works as a fallback if Tenor is unset. The GIF control is hidden until a key is set.

3. In the [Supabase SQL editor](https://supabase.com/dashboard), run `supabase/schema.sql`. That creates tables, RLS, storage buckets, RPCs (`join_challenge`, `get_my_profile`), and seeds **The 6-Day Spark**.
4. Disable “Confirm email” in Auth settings while you are developing, or use the confirmation link after register.
5. Install and start:

```sh
npm install
npx expo start
```

## Native Google (iOS + Android)

Use the official Sign-In SDK + `signInWithIdToken`. Do not send Custom Tabs / ASWebAuthenticationSession to `blob://` for Google.

```json
[
  "@react-native-google-signin/google-signin",
  {
    "iosUrlScheme": "com.googleusercontent.apps.49251028054-54pin15flhs2uhhtqhnjkblmdte62bka"
  }
]
```

`YOUR_IOS_CLIENT_ID` is `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` without `.apps.googleusercontent.com`. Set on EAS and in `.env`:

- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` — same Web client as Supabase Google provider
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` — iOS client, bundle `com.blob.tournament`

Web Google stays HTTPS `/auth/callback`. Needs a new EAS binary after the plugin + URL scheme change.

## Auth & onboarding

- Sign up creates `auth.users` and a stub `profiles` row (`blob_<id>`).
- `display_name` empty → onboarding (`app/onboarding/profile-setup.tsx`).
- Credits start at **50.00**. Joining a challenge atomically debit the wallet and credit the prize pool.

## Privacy

- Credits are **not** granted on `SELECT` for `anon` / `authenticated`. The app reads them through `get_my_profile()`.
- Fitness stats are redacted in `profiles_public` unless `show_fitness_stats_publicly` is true.
- Workout proofs live in the private `challenge-proofs` bucket. Only the owner and other participants of that challenge can read them.

## Scripts

```sh
npm start
npm run typecheck
npm run export:web
```

## Web / Vercel

Production Web is the **Expo Router** app (`app/`), not the Next harness in `web/`.

```sh
npx expo export --platform web
```

That writes a static bundle to `dist/`. Root `vercel.json` uses that command and `outputDirectory: dist`, with a SPA rewrite so routes like `/auth/callback` serve `index.html`.

### Vercel dashboard (must match the repo)

If Project Settings override `vercel.json`, set:

| Setting | Value |
|---|---|
| Root Directory | `.` (repo root — **not** `web`) |
| Framework Preset | Other |
| Install Command | `npm install` |
| Build Command | `npx expo export --platform web` |
| Output Directory | `dist` |
| Node.js Version | 20.x |

### Environment variables (plaintext)

Same `EXPO_PUBLIC_*` as EAS, for Production and Preview:

- **Required:** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- **Optional:** `EXPO_PUBLIC_PAYMENTS_PROVIDER`, `EXPO_PUBLIC_TENOR_KEY`, `EXPO_PUBLIC_GIPHY_KEY`

Web OAuth uses `https://<origin>/auth/callback` (never `blob://`). Add that HTTPS callback in Supabase → Authentication → URL Configuration.
