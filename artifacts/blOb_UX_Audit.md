# blOb UX / reliability audit

**Date:** Saturday, August 29, 2026  
**Branch:** `blob-beta-three`  
**SHA:** `4ba6d837af56454b8de9ceea0f85b7b955f83eee` — *Remove the Home Official banner so Feed starts under Waves and Officials stay in Lobby.*

**What I actually opened**

- Routes: `https://blob.mobi` and `http://localhost:8081` — both stopped at **Join blOb / login**. No signed-in session, so Home, Lobby, Overview, Waves player, Wallet, and Bell were not click-through on the live host.
- Code (Expo tree, not `web/blob-app.tsx` as product): `app/(auth)/login.tsx`, `app/(auth)/register.tsx`, `app/auth/callback.tsx`, `app/(tabs)/feed/index.tsx`, `app/(tabs)/challenges/index.tsx`, `app/(tabs)/challenges/[id]/index.tsx`, `app/(tabs)/challenges/[id]/submit.tsx`, `app/(tabs)/friends/index.tsx`, `app/(tabs)/_layout.tsx`, `components/wallet/TabChrome.tsx`, `components/navigation/PlusActionBar.tsx`, `components/feed/FeedList.tsx`, `components/feed/PostCard.tsx`, `components/feed/ReelsRow.tsx`, `components/stories/StoryTray.tsx`, `components/clips/ClipPlayer.tsx`, `components/challenge/CheckinComposer.tsx`, `components/challenge/ChallengeHeroCard.tsx`, `components/challenge/ChallengePrizeLine.tsx`, `components/challenge/ChallengeInviteCard.tsx`, `components/challenge/ChallengeBoard.tsx`, `components/wallet/WalletBar.tsx`, `hooks/useFeed.ts`, `hooks/useChallenge.ts`, `lib/challenges.ts`, `lib/challengePot.ts`, `lib/lobbyChallenge.ts`, `lib/appResume.ts`, `lib/authRedirect.ts`, `lib/roundShare.ts`, `lib/copy.ts`, `lib/tour.ts`, `lib/social.ts`, `vercel.json`, `supabase/migrations/20260829143000_coin_even_split_ceil.sql`.

Home Official banner is **gone** in this SHA (no `FeaturedOfficialStrip` / `OfficialHomeCarousel`). Lobby still has Official | Active | Hosting | Ended. After Send, check-in routes to that challenge’s lobby feed (`tab=feed`), not Home.

---

## P0 — broken or money-wrong

### Coin even-split can pay more than the pot
- **Severity:** P0
- **Surface:** Challenge Overview / Board / Wallet
- **Repro:** Host a coin Consistency challenge with even-split remaining. Let it settle with a pot that does not divide evenly (example: 10 coins, 3 people still in). Each winner can be credited **4** coins (12 total) against a **10** pot.
- **File path + symbol:** `supabase/migrations/20260829143000_coin_even_split_ceil.sql` — `even_split_shares()`
- **Why it fails the lock or the user:** Coins must be whole numbers, and even-split remaining must share **this** pot. `ceil(pool / winners)` with no cap overpays the pool. Bucks path still uses `round(..., 2)` plus leftover on the last share. Coin path does not.
- **Fix in one paragraph:** Change coin even-split to floor plus leftover (give leftover coins to the first N winners) so the sum never exceeds the pot. Leave Bucks as-is. Add a settlement test for 10 coins / 3 winners.
- **Risk if we ship it anyway:** Wallets get more coins than the challenge held. Trust and escrow math break.

### Settled Overview shows $0 / 0 coins
- **Severity:** P0
- **Surface:** Challenge Overview
- **Repro:** Open a settled challenge that paid a real prize. Read the hero and the **Prize** card.
- **File path + symbol:** `components/challenge/ChallengeHeroCard.tsx` — `pool = Number(challenge.prize_pool) || 0`; `components/challenge/ChallengePrizeLine.tsx` — `amount = Number(challenge.prize_pool) || 0`
- **Why it fails the lock or the user:** After settle, `challenges.prize_pool` is zeroed. The lock says ended prize reads `challenge_settlements.prize_pool` or `host_budget`, never that zeroed column. Lobby cards already use `displayChallengePot()`. Overview and the hero do not.
- **Fix in one paragraph:** Use `displayChallengePot()` (and the settled pot already attached on the challenge) in the hero and `ChallengePrizeLine`. Do not invent a second pot rule.
- **Risk if we ship it anyway:** People think the prize vanished. Support tickets. Looks like a steal.

### Ended Lobby cards can show $0 while settling
- **Severity:** P0
- **Surface:** Lobby
- **Repro:** Open **Lobby → Ended** on a buy-in challenge that is `ended` / `settling` and does not yet have a `challenge_settlements` row (and no host budget).
- **File path + symbol:** `lib/challengePot.ts` — `displayChallengePot()`
- **Why it fails the lock or the user:** For ended statuses, if `settled_prize_pool` is missing, the helper jumps to `host_budget` / `creator_contribution` and then **0**. It never uses the still-live `challenges.prize_pool` during the settling window. Buy-in pots look empty.
- **Fix in one paragraph:** If status is ended/settling and there is no settlement row yet, show `challenges.prize_pool` when it is still &gt; 0. After settle, keep settlement pot → host budget. Extend `lib/challengePot.test.ts`.
- **Risk if we ship it anyway:** Ended tab looks like prizes were wiped. Sort-by-prize is wrong for settling rows.

---

## P1 — wrong flow vs locked product

### Circle posts on Home treat every viewer as friends-of-friends
- **Severity:** P1
- **Surface:** Home / Circles
- **Repro:** User A posts in a Circle set to **Friends of friends**. User Z is not a member and is not FoF with A. Open Home. The post can appear.
- **File path + symbol:** `hooks/useFeed.ts` — `fetchPosts()` → `viewerCanSeeHomeCirclePost({ … friendsOfFriendsWithAuthor: true })`
- **Why it fails the lock or the user:** Home must honor audience. The FoF flag is hardcoded `true`. Circle visibility Friends | FoF | Public is meaningless if FoF is always on.
- **Fix in one paragraph:** Compute a real FoF boolean (shared friend with the author), or pass `false` until that graph exists. Do not hardcode `true`.
- **Risk if we ship it anyway:** Private circle posts leak to strangers on Home.

### Home feed error fallback skips audience, blocks, and hide
- **Severity:** P1
- **Surface:** Home
- **Repro:** Fail hydration inside `withSocial()` / `hydrateAuthors()` (comments/reactions/RLS). Home still renders a list.
- **File path + symbol:** `hooks/useFeed.ts` — `fetchPosts()` inner `catch` → `return merged.slice(0, 50)`
- **Why it fails the lock or the user:** That slice is taken **before** hidden-from-Home, blocks, mutes, audience, and wave/round exclusion. A partial outage can show posts the viewer should never see.
- **Fix in one paragraph:** Return `[]` (or re-run the same filters without social hydration). Never return raw `merged`.
- **Risk if we ship it anyway:** Blocked or hidden posts flash on Home when comments/reactions fail.

### Remaining counts sit on Overview
- **Severity:** P1
- **Surface:** Challenge Overview
- **Repro:** Open a joined live challenge. Stay on **Overview**. Read the strip under status: **Remaining · Caught Up · Dropped**.
- **File path + symbol:** `app/(tabs)/challenges/[id]/index.tsx` — `ChallengeLeaderboard` `variant="compact"`; `components/challenge/ChallengeBoard.tsx` — compact branch
- **Why it fails the lock or the user:** Remaining counts are Board-only. Overview shows the same numbers.
- **Fix in one paragraph:** Remove the compact board from Overview, or replace it with “Open board” with no counts.
- **Risk if we ship it anyway:** Overview and Board feel like the same screen. The lock is already broken.

### Required check-in proof still has Remove
- **Severity:** P1
- **Surface:** Challenge Overview (check-in)
- **Repro:** Start check-in → attach the required selfie → tap **Remove** (or long-press the thumb) → confirm **Remove this photo from the check-in?**
- **File path + symbol:** `components/challenge/CheckinComposer.tsx` — `confirmRemove`, overlay chip `"Remove"`
- **Why it fails the lock or the user:** Required slots are Replace only. Post edit already does Replace. Check-in still clears the required slot.
- **Fix in one paragraph:** Hide Remove on required pages. Keep Retake / Gallery. Allow Remove only on extras.
- **Risk if we ship it anyway:** People empty a required slot and think Send is broken, or they complete without the required proof still attached.

### Create / Join / Send Coins live on the hamburger, not the blOb logo
- **Severity:** P1
- **Surface:** Home (header)
- **Repro:** Sign in → tap **Bob** (logo) → goes Home. Tap **☰** (far left) → Create a Challenge, Create a Circle, Call someone out, Join a Challenge, Send Coins or $.
- **File path + symbol:** `components/wallet/TabChrome.tsx` — `LOGO_MENU`, hamburger `onToggleLogoMenu`; Bob `onHomePress`
- **Why it fails the lock or the user:** Those actions are supposed to live in the **blOb logo** dropdown. The tour already points at `tour-menu` on the hamburger. Logo tap is only Home.
- **Fix in one paragraph:** Put the dropdown on Bob, or change the lock and tour to say hamburger and leave Bob as Home. Pick one and match header + tour.
- **Risk if we ship it anyway:** People who were told “tap Bob” never find Create, Join, or Send Coins.

### Wave Share to Feed exists (lock is Round only)
- **Severity:** P1
- **Surface:** Waves / Rounds
- **Repro:** Open a Wave fullscreen → Share → **Share to Feed** → required comment. Post type is `wave_share`.
- **File path + symbol:** `lib/roundShare.ts` — `canOfferShareToFeed()`; `components/clips/RoundShareComposer.tsx` — `type: shareKind === 'wave' ? 'wave_share' : 'round_share'`
- **Why it fails the lock or the user:** Share to Feed is Round only (`type=round_share`), plus required comment. Corporate Round correctly hides the row. Waves should not get this path.
- **Fix in one paragraph:** Offer Share to Feed only when `kind === 'round'`. Leave Wave social on the player.
- **Risk if we ship it anyway:** Waves land on Home as cards. Extra noise. Split social.

### Wave/Round share cards still have Home reactions and comments
- **Severity:** P1
- **Surface:** Home
- **Repro:** A friend shares a Round (or Wave) to Feed. Open Home. The card has Reaction / Comment under the embed.
- **File path + symbol:** `components/feed/PostCard.tsx` — `PostCardInner` still renders `ReactionBar` after `isClipSharePost`
- **Why it fails the lock or the user:** Wave/Round social lives on the fullscreen player, not under a Home card. Native `wave` / `round` types are excluded from Home; `*_share` posts are not, and they still get the bar.
- **Fix in one paragraph:** On Home, for clip-share posts, show embed + caption only. Tap opens the player. Keep Reaction / Comment on the player.
- **Risk if we ship it anyway:** Two social surfaces. Extra `usePost(parent)` per card.

### Neutral copy still forced on live screens
- **Severity:** P1
- **Surface:** Home / Bell / Wallet / Circles / Auth
- **Repro:** Set Bob to Gentle. Open a wall post, a health prompt, a send-coins toast, or circle member count. Those lines call `copy(..., 'neutral')`.
- **File path + symbol:** `lib/copy.ts` — `COPY_TONES` still includes `'neutral'`; hardcoded `'neutral'` in `PostCard.tsx`, `Composer.tsx`, `AlertsPanel.tsx`, `circles/[id].tsx`, `HealthLogPrompt.tsx`, `profile/send.tsx`
- **Why it fails the lock or the user:** Bob is Gentle | Honest only. Stored Neutral already maps to Gentle (`asCopyTone`). Pickers are correct. Runtime still serves Neutral strings.
- **Fix in one paragraph:** Stop passing `'neutral'`. Use `useCopyTone()` / `asCopyTone()`. Leave stored Neutral → Gentle. Do not add Neutral back to Settings.
- **Risk if we ship it anyway:** Bob sounds like a third voice on some screens.

### Overview can say the prize is forfeited while the challenge is still live
- **Severity:** P1
- **Surface:** Challenge Overview
- **Repro:** Open a **live** challenge where the live-competitor count is 0 but settlement has not run. Read the Prize card: **Nobody remaining. The prize is forfeited. No refunds.**
- **File path + symbol:** `app/(tabs)/challenges/[id]/index.tsx` — `remainingNow = competitorCount`, `prizeForfeited`
- **Why it fails the lock or the user:** Forfeit is a settlement outcome, not “nobody looks live right now.” Board remaining and settlement receipt can disagree with this count.
- **Fix in one paragraph:** Show forfeit copy only from the settlement receipt / settled status. Use the same remaining rule as Board.
- **Risk if we ship it anyway:** People think money is gone mid-challenge.

---

## P2 — slow / jank / extra steps

### Home first paint fires a large query fan-out
- **Severity:** P2
- **Surface:** Home
- **Repro:** Cold-open Home signed in. Watch the network before the feed is usable.
- **File path + symbol:** `hooks/useFeed.ts` — `fetchPosts()`; `components/stories/StoryTray.tsx` — `useStoryGroups()`; `app/(tabs)/feed/index.tsx` — extra `useActiveStories()`; `components/feed/ReelsRow.tsx` — `useReels(8)` → `fetchReels()` pulls **40** then filters
- **Why it fails the lock or the user:** Native apps should feel instant. Home waits on ~15–25+ round-trips: 9 ID lookups, five `posts` queries at `.limit(50)`, corporate lookup, then comments/reactions/mentions per post. Stories fetch twice. Each clip-share card adds `usePost(parent)`.
- **Fix in one paragraph:** Drop the duplicate `useActiveStories()` on the Home screen. Defer Rounds until after first feed paint. Share one stories query. Batch clip-share parents. Do not add a new feed product.
- **Risk if we ship it anyway:** Home feels heavy on phone networks. Extra Supabase load.

### Lobby first paint loads every tab at once
- **Severity:** P2
- **Surface:** Lobby
- **Repro:** Sign in → Lobby. Hosting, Active, Official, Ended, friends, drafts, today check-ins, and friend counts all start together.
- **File path + symbol:** `app/(tabs)/challenges/index.tsx` — `ChallengesScreen()`; `hooks/useChallenge.ts` — `prepareLobby()` inside hosting + official (+ discover)
- **Why it fails the lock or the user:** Extra steps the user did not ask for. `prepareLobby()` / `tick_official_series` can run more than once. Ended loads even if that tab is never opened. Cards may still mount `usePeriodCheckin` on top of the batch “checked in today” query.
- **Fix in one paragraph:** One lobby bootstrap. Lazy-load Ended / friends until that tab is selected. Pass checked-in from the parent. Stop per-card check-in queries on the list.
- **Risk if we ship it anyway:** Lobby janks on first open. Tab auto-select waits on unused lists.

### Overview refetch storm
- **Severity:** P2
- **Surface:** Challenge Overview
- **Repro:** Open a challenge. Leave and come back. Or submit a check-in and watch refetches.
- **File path + symbol:** `app/(tabs)/challenges/[id]/index.tsx` — parallel `useChallenge`, participants, board profiles, period check-in, submitted count, completions, settlement, feed, profile; `hooks/useChallengeCheckin.ts` — post-submit invalidates 13+ keys
- **Why it fails the lock or the user:** First paint waits on many lists. Focus refetch plus wide invalidation feels like the screen is reloading itself.
- **Fix in one paragraph:** Join participant + profile in one query. Refetch on focus only when stale. After check-in, invalidate only this challenge’s keys.
- **Risk if we ship it anyway:** Battery and data burn. Board/Overview feel slow on large rosters.

### Clip player keeps extra video players mounted
- **Severity:** P2
- **Surface:** Waves / Rounds
- **Repro:** Open the player. Swipe several video clips (Safari especially). Memory/CPU climb.
- **File path + symbol:** `components/clips/ClipPlayer.tsx` — `PreloadClip` (`useVideoPlayer`, no dispose); `WebClipVideo` pause-on-unmount without dropping `src`
- **Why it fails the lock or the user:** Tracks and decoders should die when you leave. Camera already stops on leave / Home. Playback does not match that discipline.
- **Fix in one paragraph:** One shared player. Dispose preload on index change. On Web, clear `src` and pause on unmount. Do not restyle the player.
- **Risk if we ship it anyway:** Hot phones, Safari tab crashes, iOS decoder limits.

### Wallet counts up while you stay in the app
- **Severity:** P2
- **Surface:** Wallet
- **Repro:** Earn coins without backgrounding (check-in, badge). Header animates immediately.
- **File path + symbol:** `components/wallet/WalletBar.tsx` — first `useEffect` on `[coins, lastShownCoins, …]`
- **Why it fails the lock or the user:** Count-up is **on next foreground** if coins rose since the last shown balance. Coins display as whole numbers (Expo path is fine). Timing is wrong.
- **Fix in one paragraph:** Animate only on AppState / visibility → active, using the stored last-shown delta. While the app stays open, keep the number still until the next return.
- **Risk if we ship it anyway:** The header jumps during a check-in. “Last shown” gets marked before the return moment.

### Return from background can keep a challenge open
- **Severity:** P2
- **Surface:** Challenge Overview
- **Repro:** Open a challenge → background ~1s → return → still on the challenge. Background ≥ ~2.5s → Home. Open `/challenges/{id}/details` → background ≥ 2.5s → stays on details.
- **File path + symbol:** `lib/appResume.ts` — `MIN_BACKGROUND_MS`, `KEEP_ROUTE` includes `/details`
- **Why it fails the lock or the user:** Cold start and return from background land on Home, not last-open challenge. Short background and `/details` are exempt on purpose.
- **Fix in one paragraph:** Reset to Home on background → active except an allow-list (submit, capture, compose). Remove `/details` from keep.
- **Risk if we ship it anyway:** Task-switchers feel stuck inside a challenge.

### Email step does not open the keyboard
- **Severity:** P2
- **Surface:** Auth
- **Repro:** Login → **Continue with Email**. Email field is on screen. Keyboard stays down until you tap the field. Same on register email.
- **File path + symbol:** `app/(auth)/login.tsx`, `app/(auth)/register.tsx` — email `Input` (no `autoFocus`)
- **Why it fails the lock or the user:** Native pattern is: land on the field, keyboard up. Extra tap on every email sign-in.
- **Fix in one paragraph:** `autoFocus` the email field when the email step is shown.
- **Risk if we ship it anyway:** Feels broken on Android and Safari. Not a wrong account.

### People you may know is not on Home
- **Severity:** P2
- **Surface:** Home / Friends
- **Repro:** Open Home. No “People you may know.” Open Friends. The rail is there.
- **File path + symbol:** `components/feed/FeedList.tsx` — `midFeedRail` (supported, unused); `app/(tabs)/friends/index.tsx` — only consumer
- **Why it fails the lock or the user:** Discovery was called out on Home. The slot exists after the second post. Home never passes it.
- **Fix in one paragraph:** Pass `midFeedRail={<RecommendedProfiles compact />}` from `app/(tabs)/feed/index.tsx`. Do not invent a new rail.
- **Risk if we ship it anyway:** New users only find people on Friends.

### Next `web/` tree is still a full app
- **Severity:** P2
- **Surface:** Auth (web harness)
- **Repro:** Open `web/components/blob-app.tsx`. It still has challenge overview, board, lobby feed, wallet, check-in. Root `vercel.json` correctly builds Expo (`npx expo export --platform web` → `dist/`). `blob.mobi` is the Expo export.
- **File path + symbol:** `web/components/blob-app.tsx` — `ChallengeScreen`; `web/app/[[...slug]]/page.tsx`
- **Why it fails the lock or the user:** That file must not be the product. It is not what Vercel ships today, but it is still a parallel consumer UI.
- **Fix in one paragraph:** Keep `web/` as a smoke harness only, or delete consumer screens. Do not add Home/Lobby/social there.
- **Risk if we ship it anyway:** Someone “fixes Web” in the wrong tree. Parity dies.

### Native confirm-email host is not forced to blob.mobi
- **Severity:** P2
- **Surface:** Auth
- **Repro:** Native signup when `EXPO_PUBLIC_AUTH_REDIRECT_URL` is unset. Confirm link host comes from Supabase Site URL, not the app.
- **File path + symbol:** `lib/authRedirect.ts` — `emailAuthRedirectTo()`; `hooks/useAuth.ts` — `signUp`
- **Why it fails the lock or the user:** Confirm emails must use `https://blob.mobi`, not vercel.com. Code blocks vercel.com when the env **is** set. When it is missing on native, the app sends no `emailRedirectTo`.
- **Fix in one paragraph:** Production native builds must set `EXPO_PUBLIC_AUTH_REDIRECT_URL=https://blob.mobi/auth/callback`. Fail signup if unset in production. Confirm Site URL + redirect allow-list in Supabase.
- **Risk if we ship it anyway:** Confirm links go to a preview host. People cannot finish signup on the phone.

---

## P3 — copy / polish

### Fill gate says “needed,” not only `{n}/{min}`
- **Severity:** P3
- **Surface:** Lobby
- **Repro:** Pre-start card with 7 of 8 people. Label is **7/8 needed** (or **1 more needed**).
- **File path + symbol:** `lib/lobbyChallenge.ts` — `fillGateLabel()`
- **Why it fails the lock or the user:** Lock is `{n}/{min}` + people icon. Extra words.
- **Fix in one paragraph:** Always `{count}/{min}`. Keep the people icon. Drop “needed” / “1 more.”
- **Risk if we ship it anyway:** Cosmetic only.

### Card footer still says View
- **Severity:** P3
- **Surface:** Lobby
- **Repro:** Tap the card body → `/challenges/{id}`. Footer still leads with **View**.
- **File path + symbol:** `components/challenge/ChallengeInviteCard.tsx` — `TextAction label="View"`
- **Why it fails the lock or the user:** Whole card already opens the challenge. “View” reads like a dead extra step.
- **Fix in one paragraph:** Remove View, or keep Join / Check in / Share only.
- **Risk if we ship it anyway:** Mild confusion.

### Partner product row is a no-op
- **Severity:** P3
- **Surface:** Create
- **Repro:** Advanced create → private lane → **Partner product (soon)**. Tap does nothing (`onPress={() => {}}`).
- **File path + symbol:** `components/challenge/create/CreateWizard.tsx` — Partner product row
- **Why it fails the lock or the user:** If a control would no-op, it is a finding. “Coming soon” on Last Man Standing is at least disabled. This one is tappable and dead.
- **Fix in one paragraph:** Hide the row until it lands.
- **Risk if we ship it anyway:** People think Create is broken.

### Join a Challenge only opens the Lobby list
- **Severity:** P3
- **Surface:** Lobby
- **Repro:** ☰ → **Join a Challenge** → `/challenges`. You still have to pick a card and join.
- **File path + symbol:** `app/(tabs)/_layout.tsx` — `onAction` `'join'` → `go('/challenges')`
- **Why it fails the lock or the user:** Real screen, not a stub. Label promises Join; action is browse.
- **Fix in one paragraph:** Rename to “Browse challenges,” or open Official / a join code. Do not add a second join path.
- **Risk if we ship it anyway:** One extra beat of confusion.

### Wave caption says “Add a caption”
- **Severity:** P3
- **Surface:** Waves
- **Repro:** Record a Wave → preview field placeholder **Add a caption**.
- **File path + symbol:** `components/capture/CaptureStudio.tsx` — preview `Input`
- **Why it fails the lock or the user:** Waves are hello / short thought. Tour already says that. Capture does not.
- **Fix in one paragraph:** Wave-only placeholder: hello or a quick thought. Do not rewrite Feed composer.
- **Risk if we ship it anyway:** Tone only.

---

## Performance (heavy screens)

| Screen | Hooks on first paint | Round-trips | What blocks interaction |
|---|---|---|---|
| **Home** | `useFeed`, `useActiveStories` (screen) + `useStoryGroups` (tray), `useReels(8)` | ~15–25+ then N+1 on clip-share cards | Full-screen load until `useFeed` succeeds. Five `.limit(50)` post queries. `fetchReels` selects 40. Stories queried twice. Images in cards often lack reserved size. |
| **Lobby** | Hosting, Active, Official, Ended, friends, today check-ins, friend counts, drafts | All tabs at once; `prepareLobby` up to 3× | Tab chrome waits on unused Ended/friends. Per-card `usePeriodCheckin` on top of the batch. |
| **Overview** | Challenge, preview, participants, board profiles, period check-in, submitted count, completions, settlement, feed, profile | 10–12+ then focus refetch | `stillLoading` until a non-hollow row exists (title flash is guarded). Prize number can still be 0 after settle. Board profiles are a second trip. |
| **Player** | Clip list + `PreloadClip` per neighbor | 1 list + extra decoders | Extra `useVideoPlayer` instances stay mounted. Web video `src` not cleared. |

`refetchOnWindowFocus` is off globally (`lib/queryClient.ts`). No focus storm from that flag.

---

## Search pass (dead / lock leftovers)

| Needle | Result |
|---|---|
| Home Official banner | **Gone** in this SHA. Do not put it back. |
| `coming soon` | Create Wizard Last Man Standing footer (disabled). Partner product (soon) is a tappable no-op. |
| `TODO` | `lib/challenges.ts` — `friend_count` follows graph. Soft-fail to 0. |
| Neutral | Mapped to Gentle in Settings. Still forced in several `copy(..., 'neutral')` calls. |
| `duration_days` | Still a **form / payload** field written into `days_required` / `length_value`. Not a dropped-column crash. |
| `even_split_shares` `round(..., 2)` | Still correct for **Bucks**. Coin path is `ceil` (P0 above). |
| `prize_pool` after settle as 0 | Overview hero + Prize line (P0). Lobby uses `displayChallengePot` (settling hole is P0). |
| Duplicate Join gates | Server `join_challenge` raises `ALREADY_JOINED` before debit. Double-tap is not a second charge. |

**Passes (do not “fix” these)**

- Login **Create an Account** → register email form on first tap (`registerHrefWithForm()`).
- Auth callback copy has no photo-save text (`app/auth/callback.tsx`).
- + menu: Check In (if loggable) + Post → Wave / Round / Feed. Real routes.
- Hamburger items land on real screens (create, circle, callout, lobby, send-coins sheet).
- After Send, check-in goes to `/challenges/{id}?tab=feed`.
- Hide-from-Home is whole-post. Lobby feed and check-in counts ignore it for required proof.
- Home excludes `type` `wave` and `round`. `fetchReels` filters strangers’ Friends clips.
- Format × payout pairing on create/publish is in place. Honor does not stamp Official selfie+HR.
- Lobby tabs Official | Active | Hosting | Ended. Active = I play. Hosting = I host and I am not in. Ended default 30 days.
- Wallet Expo header uses whole coins (`formatCoins` / `Math.round`).
- Cold start → Home. Tour Quick Start is Check In / Post. `vercel.json` is Expo web export.

---

## Fix order (max 8)

1. Coin even-split: never pay more than the pot.
2. Overview + hero prize: use settled pot, not zeroed `prize_pool`.
3. Ended/settling Lobby pot: do not show $0 while the live pot still exists.
4. Home circle FoF flag + unfiltered feed error fallback (privacy).
5. Check-in: Replace only on required proofs.
6. Take remaining counts off Overview.
7. Logo vs hamburger: one menu, match the lock and the tour.
8. Home duplicate stories query + clip-share social on Home cards (same pass as “social lives on the player”).

---

## Do not touch

- Do not rewrite `settle_ended_challenge`.
- Do not put the Home Official banner / carousel back. Officials stay under Lobby → Official.
- Do not theme-sweep or restyle Waves / Rounds / chrome.
- Do not invent Neutral as a third voice. Map stored Neutral → Gentle only.
- Do not extend `web/components/blob-app.tsx` as the product.
- Do not mutate settled TEST challenges.
- Do not change Hide’s meaning (`hidden_from_home` = whole post, Lobby still counts required proof).
- Do not add a second check-in or money path.
