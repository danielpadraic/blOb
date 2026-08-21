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
```
