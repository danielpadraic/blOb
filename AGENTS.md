# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Role & Behavior

### Operator skill level (non-negotiable)
Daniel is the product owner, not a programmer. Assume zero programming knowledge.
Any task he does himself (Google Cloud, Play Console, App Store Connect, Supabase, EAS, Vercel, Terminal) must be a numbered list: exact URL, clicks in order, what to paste, what not to click, what the page shows when done, and what to do if a common extra prompt appears.
Never say “configure”, “bump”, “add the SHA-1”, or “check credentials” without the clicks.
Code = Cursor prompt. Dashboard/terminal = separate numbered list in the same message.

# Design lock

UI tokens, floating tab bar, and header wallet/bell live in `lib/theme.ts` and `.cursor/rules/blob-design-lock.mdc`. New screens must use those tokens. Bob stays transparent — no white matte or bulky gray blocks.

Never use React Native `Modal` for in-app sheets. Use `ChromeOverlay` so chrome (header, floating tab bar) stays consistent on iOS, Android, and Web.

# Product

blOb is one consumer product: **skill-based peer challenges + a social graph**. Users create or join contests of personal effort (fitness, practice, habits, creative work). Outcome turns on the participant’s own performance and proof — not chance, RNG, or third-party sports results.

- **Check-in** is the user-facing action (Begin / Continue / Submit). Noun: check-in. Past: checked in. Auth remains **Sign in**.
- Proof method `checkin` (text note) is not the Check-in action. Do not rename SQL (`buy_in_amount`, `prize_pool`, `log_workout`, `checkin`).
- Display money as **Entry fee** and **Prize**. Cash as `$`. Do not show “Bucks” to users. Do not invent Official 1.5× copy on user-created Review. Official Weekly $10 / `week_10` stays as specified.
- Join / log / settle / escrow stay server-owned. Do not invent a second check-in or money path.
- Social: one friends graph, one Home feed, one challenge feed. Check-in posts belong on both when the viewer can see them.

# Platform parity (non-negotiable)

iOS, Android, and Web are **one app**. Every user-facing change is built and verified for all three unless it is explicitly native-only and gated.

## Single codebase

- Consumer UX lives in Expo Router + React Native: `app/`, `components/`, `hooks/`, `lib/`.
- iOS, Android, and Web all run this same tree.
- Do **not** implement consumer features only in `web/components/blob-app.tsx` or a parallel Next-only UI. The thin `web/` harness is not the product — do not extend it for social, feed, or challenges.

## Default: all three platforms

- Implement with React Native primitives and Platform-safe APIs that work on iOS, Android, and Web.
- Prefer `Platform.OS` / `Platform.select` / feature detection over separate screens per platform.
- Before considering a task done, state how the change behaves on **iOS**, **Android**, and **Web**.

## Native-only exceptions (gate clearly)

| Capability | Native | Web / fallback |
|---|---|---|
| HealthKit / Health Connect proof | iOS (and Android if already supported) | Manual/photo proof or “available in the app” — never break check-in |
| Push | Native where available | In-app notifications until web push exists |
| Camera / Wave / Round | Native camera | Working Web path (`getUserMedia` or gallery) — no dead end |

Never ship a stub that only works on one platform without a fallback or honest empty state.

## Navigation & chrome

- Same tab structure, + menu, logo menu, and Home-on-resume on all platforms.
- Tab bar and sticky CTAs use shared helpers (`tabBarLift` and related) that work on Web (no phantom home-indicator gaps) and on native.
- Auth: native `blob://auth/callback` and `blob://oauthredirect`; Web https callback (`/auth/callback`). Never fix auth for only one platform.

## Styling

- Theme tokens (`lib/theme.ts`), shared components, patterns that render on Web and native.
- No platform-only CSS or DOM APIs without an RN equivalent.
- Touch targets, sheets, and overlays must work with mouse and touch.

## Data & backend

- One Supabase project. No platform-specific schemas.
- Public env is `EXPO_PUBLIC_*` — document for EAS (iOS/Android) and Web/Vercel. Public keys stay plaintext in `.env.example`.

## Definition of done

- [ ] Code path is shared unless a documented `Platform` branch exists
- [ ] iOS: no crash / dead control
- [ ] Android: no crash / dead control
- [ ] Web: same primary journey works, or an explicit gated fallback
- [ ] No new feature added only to `web/blob-app`
- [ ] If user-facing, note verification: Expo iOS/Android and Web (Expo web or production Web host)

## Deploy

- Mobile: EAS builds consume the Expo app.
- Web: Vercel builds `npx expo export --platform web` to `dist/` (see root `vercel.json`). Do not ship consumer UX “on Vercel via `web/blob-app` only.”
- User-facing work targets the team’s deploy branch (e.g. `blob-beta-three`) when applicable.

## When implementing

- Call out any `Platform.OS` split and why.
- Flag any library that does not support Web or Android.
- Prefer cross-platform libraries already in the repo (Expo modules with web support).
