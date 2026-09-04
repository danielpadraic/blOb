# blOb — Lead Designer / UX Architect audit

**Date:** Friday, September 4, 2026
**Branch:** `blob-beta-three` — local is in sync with `origin/blob-beta-three`
**SHA:** `a9c41ab` — *Break Live into challenge day headers*
**Scope:** Expo Router consumer tree only (`app/`, `components/`, `hooks/`, `lib/`). Audit only — no product code, SQL, theme token, or auth changes. No PR.

**Docs read:** `AGENTS.md`, `.cursor/rules/blob-design-lock.mdc`, `.cursor/rules/blob-platform-parity.mdc`, `.cursor/rules/blob-operator-skill.mdc`, `docs/blOb_UIUX_Design_Brief.md`, `docs/blOb_Official_Lore_and_Voice_Guide (2).docx`, prior `artifacts/blOb_UX_Audit.md` (Aug 29).

> `artifacts/blOb_UIUX_Design_Brief.md` and the lore `.docx` are **not** in `artifacts/` — they live in `docs/`. Read from `docs/`.

**Depth note.** Passes 0–4 (cold start, Profile Setup, Interests, Simple Create, Advanced Create) are deep: I opened every route, form component, validator, and copy helper. Passes 5–11 (Lobby, Official cards, Check In, Live thread, Board, Home, Wave/Round capture and player, Friends/Circles, Callout, You/wallet/settings, Messages) were walked by two parallel readers and every claim below was re-verified against source before inclusion. Where I did not open a screen I say so. Nothing in this report was verified in a live browser on `blob.mobi` — the truncation and CTA-seating items are flagged for a device pass.

---

## 1. Executive score

| Area | Score | One sentence |
|---|---|---|
| **First-run** | **4 / 10** | A new user must accept legal, finish three profile steps, then gets ambushed by a fourth eight-question form — and cannot reach Home without typing their body weight. |
| **Profile Setup** | **4 / 10** | Keyboard and scroll discipline are genuinely good, but the progress bar lies, gender/height/weight are hard-required, and the screen contradicts its own edit-later version. |
| **Interests** | **6 / 10** | The best-engineered wizard in the app and almost perfectly lock-compliant, undone by length (up to ~30 screens), a 36pt primary button, and a reward the user is never told about. |
| **Simple Create** | **5 / 10** | It works and respects the money locks, but the very first field is a currency choice, the task is labeled "Task A", no live Prize number ever appears, and errors are clipped to one line. |
| **Advanced Create** | **3 / 10** | Eleven steps that open on step 3, where Back quits the whole creator, money is split across three non-adjacent steps, and Goal/Rules/Points expose three names for the same idea. |
| **Home** | **7 / 10** | Scroll lock is exactly right (Waves pinned, everything else scrolls) and the + menu is correct; the header menu still hangs off the hamburger instead of Bob, and first paint is heavy. |
| **Check In** | **6 / 10** | The + → picker → `/challenges/{id}/submit` path is correct and never routes to Wave; the Aug 29 findings on required-proof Remove and duplicated Board counts on Overview are still open. |
| **Visual polish** | **6 / 10** | Token discipline, radius, shadow use, and Official-vs-peer-vs-Callout surface language are consistent and genuinely good; the Interests wizard is a dark-mode island in a cream app, Bob is 22%-opacity wallpaper there, and nine controls — including Join and Check In — sit under the 44pt lock. |

---

## 2. Top 10 recommendations

Ranked by UX impact ÷ effort. **Do not implement any of these in this pass.**

### 1. Body metrics must not gate the feed
- **Where** — Profile Setup step 3. `app/onboarding/profile-setup.tsx:507-695`; `utils/validators.ts:47-77` (`profileSetupSchema`).
- **What's wrong** — `gender: z.enum(['male','female'])`, `current_weight: z.string().min(1, 'Add your current weight')`, and height are **required**. A person who just signed up for a social app cannot see a single post until they disclose their sex, height, and body weight. There is no Skip. The gender control offers only Male and Female with no explanation of why it is mandatory.
- **Why it matters** — This is the single largest drop-off risk in the product and the largest trust risk. It is also *self-refuting*: the edit-later screen says the opposite in plain language — "Always private. Used for Challenge recommendations and competition placement. **Not required to save a name or photo.**" (`components/profile/EditProfileForm.tsx:693-696`). The data is demonstrably not required; only the first run pretends it is.
- **Proposed change** — Make step 3 skippable with a real "Set this up later" affordance that lands on Home. Relax `profileSetupSchema` so gender/height/weight validate only when non-empty. Keep the fields, keep the order, keep them private. Body-fat already gates itself honestly behind "Add gender, height, and weight to set body fat." — let the whole step behave that way.
- **Effort** — **M**

### 2. Errors are clipped to one line everywhere
- **Where** — `components/ui/Input.tsx:201`; `components/challenge/create/wizardUi.tsx:569` (`FieldLabel`); `components/challenge/create/SimpleCreateForm.tsx:613, 1160, 1164`.
- **What's wrong** — Every field error and both create-form error slots render `numberOfLines={1}`. Real messages are longer than one phone line: "You need $12.00 to fund this pool. You have $3.00." (`CreateWizard.tsx:266`), `PRIVACY_MODE_LOCKED_MESSAGE`, and `create.minToStartHint`. They ellipsize mid-sentence.
- **Why it matters** — A truncated error is an unactionable error. The user is blocked, told they are blocked, and not told why. It also directly contradicts the lock "Body-copy fields wrap + grow" — an error is body copy.
- **Proposed change** — Drop `numberOfLines` from those five error slots and let them wrap. Titles, search, steppers, and amounts stay one line as locked.
- **Effort** — **S**

### 3. Simple Create opens on a money decision
- **Where** — `components/challenge/create/SimpleCreateForm.tsx:641-753`.
- **What's wrong** — The first thing a new host sees is `Currency` (Coins / $), then `Entry fee`, then `Host contribution`, then two lines of gray fee copy, then a Guaranteed Prize switch. The challenge **Title** does not appear until line 864 — roughly four scrolls down. The stated field order in the brief and the locks is title → task → proof → start → duration → misses → money.
- **Why it matters** — Asking "how much money?" before "what are we doing?" is exactly the casino energy the design brief forbids ("No dark patterns. No casino energy."). It also makes the form feel like a payment sheet rather than a challenge. A tired person on a phone cannot answer field #1.
- **Proposed change** — Reorder the sections to Title → Type → Task + Proof → Start → Duration → Frequency + Allowed misses → Visibility → Money. Keep every field, every stepper, and the existing `TourAnchor` ids and `sectionRefs` keys so Review→Edit still lands correctly.
- **Effort** — **M**

### 4. "Coins" and "Bucks" leak to users on five surfaces — from one helper
- **Where** — `utils/format.ts:14-17` (`formatCoins` → `` `${value} Coins` ``); `lib/currency.ts` (`formatWallet` returns `formatCoins` for the coin lane), `:131` (`plural ? 'Coins' : 'Coin'`); `lib/lobbyChallenge.ts:1170`; `app/(tabs)/challenges/[id]/index.tsx:1443`; `components/wallet/TabChrome.tsx:105`; `app/(tabs)/profile/send.tsx`; `components/challenge/create/CreateWizard.tsx:2724`.
- **What's wrong** — The money lock is: coins render as **icon + number**, never the word "Coins" next to an amount, and **"Bucks" is never shown to users**. One helper breaks it at the root — `formatCoins` bakes the word in, and `formatWallet` routes the coin lane straight through it. The tell is that three call sites strip the word back off: `formatCoins(...).replace(' Coins', '')` in `WalletBar.tsx`, `ProfileBadges.tsx`, and `ProfileEarnings.tsx`. Everywhere nobody remembered to strip, the word ships:
  - **Lobby filter chips** render literal `'Coins'` and **`'Bucks'`** — the one word the lock forbids outright.
  - **Host judging card**: "The 1 hour hold is done. Distribute **Coins** to completers. This can only happen once." — the word on a money action.
  - **Header menu**: "Send **Coins** or $".
  - **Create**, via my deep pass: `costHint` = "You need {formatWallet(needed, currency)}." renders **"You need 25 Coins."** (`SimpleCreateForm.tsx:395`), and `contributionShort` does the same in `CreateWizard.tsx:266`.
  - **Advanced wizard** partner-product body: "For now, fund **Coins** or $ yourself."
  - **Profile Setup** step 1: "a starting wallet of 100 **Coins**".
- **Why it matters** — This is the most-repeated lock violation in the product and the cheapest to fix, because it is one function plus a handful of literals rather than a design change. "Bucks" on a filter chip is the sharpest edge: it is internal vocabulary on a consumer control.
- **Proposed change** — Add an icon+number formatter alongside `formatCoins` and switch the display paths to it; leave `formatCoins` for any place that genuinely needs prose. Delete the three `.replace(' Coins', '')` hacks. Relabel the lobby currency filter chips to a coin glyph and `$`. Rewrite the judging, menu, wizard, and Profile Setup strings. Do not rename the `bucks` currency key or any SQL column.
- **Effort** — **S**

> The Profile Setup progress bar ("Step 3 of 3", then a fourth unannounced form) was the previous entry here. It is fully covered in section 3a and step 5 of the suggested prompt, so it moved to the IA notes to keep this list at ten.

### 5. "Create a Challenge" silently reopens an old draft, and Save Draft overwrites it
- **Where** — `components/challenge/create/SimpleCreateForm.tsx:319-338, 243-262`; `lib/challengeDraft.ts:367-375` (`pickSimpleDraft`).
- **What's wrong** — Two coupled problems. (a) On mount with no `draftId`, `pickSimpleDraft(drafts, undefined)` falls through to `drafts.find(isSimpleCreateDraft)` — the most recent draft — and hydrates it with no notice. Opening "Create a Challenge" fresh silently puts you inside a half-finished old challenge. (b) `onSaveDraft` writes `id: simpleDraftIdRef.current ?? draftsQuery.data?.[0]?.id ?? null`, so pressing **Save Draft** on a genuinely new challenge overwrites the previous draft instead of creating a second one.
- **Why it matters** — The lock is "Challenge drafts are explicit Save Draft only." Silent restore is implicit restore, and silent overwrite destroys work the host chose to save. There is already a correct pattern for this in the tree: `ContinueDraftCard` (`wizardUi.tsx:511-551`) with Continue / Discard.
- **Proposed change** — Only hydrate from a draft when `draftId` is present. Show `ContinueDraftCard` otherwise. Make Save Draft insert a new row unless the session already owns a draft id.
- **Effort** — **S/M**

### 6. Advanced opens on step 3 of 11, and Back quits the creator
- **Where** — `components/challenge/create/CreateWizard.tsx:190` (`useState(STEP_GOAL)`), `1379-1381` (`if (step <= STEP_GOAL) leaveWizard()`); `lib/challengeTemplates.ts:40-52`.
- **What's wrong** — `CREATE_WIZARD_STEPS` has 11 entries (Lane, Start, Goal, Type, Duration, Prize Structure, Scoring method, Funding, Entry & Limits, Rules & Proof, Review). The wizard mounts on index 2, so `WizardProgress` reads "Step 3 of 11" with the first two dots showing as not-done. Pressing **Back** on that entry step calls `leaveWizard()` — the entire creator closes. Separately, validation failures call `setStep(target.step)` (`CreateWizard.tsx:1271-1273`), teleporting the host to a different step mid-correction.
- **Why it matters** — A host lands mid-progress with two phantom incomplete steps behind them, presses the obvious escape (Back), and loses the whole form. That is data loss dressed as navigation.
- **Proposed change** — Take Lane and Start out of `CREATE_WIZARD_STEPS` (they are pre-choices, not steps) so Advanced honestly reads "Step 1 of 9". Make Back on the first real step confirm before leaving. Keep the jump-to-step dots but make errors scroll to the field within the current step where possible instead of jumping steps.
- **Effort** — **M**

### 7. "Tomorrow morning" starts at midnight
- **Where** — `components/challenge/create/SimpleCreateForm.tsx:907-919`; `lib/challengeSchedule.ts:34-37`; `lib/challengeTimezone.ts:111-127`.
- **What's wrong** — The chip is labeled **"Tomorrow morning"**. `tomorrowMorning()` calls `startTomorrowInZone(now, zone)` with no clock argument, so `clock.hours ?? 0` resolves to **00:00** — the next calendar date at midnight in the host timezone. A host setting this up at 9 p.m. gets a challenge that goes live in three hours, in the dark.
- **Why it matters** — Start time is the single most consequential field on the form (it drives the start gate, day windows, and the first miss). The label and the behavior disagree. Timezone itself is correct: `DEFAULT_CHALLENGE_TIMEZONE = 'America/Denver'` (`lib/challengeTimezone.ts:1`), and it is a named zone, never the device zone — that part of the lock is honored.
- **Proposed change** — Pass a real morning clock (`{ hours: 7 }`) so "Tomorrow morning" means morning, and print the resolved local start under the chip row the way `endLine` already prints the end. Do not touch the timezone resolution.
- **Effort** — **S**

### 8. Three screens ask the same training questions, and the last one wins
- **Where** — Profile Setup step 1 (`profile-setup.tsx:454-504`), `components/profile/FitnessHistoryForm.tsx:240-251`, `components/profile/EditProfileForm.tsx:568-686`, plus the Interests rooms.
- **What's wrong** — "What do you train?" and "Workouts per week" in Profile Setup step 1. Then "Training days most weeks", "Aims", and "Sports & activities" in Fitness History. Then Interests asks the same territory again as chips-per-room. Worse, `FitnessHistoryForm.onSubmit` writes `typical_weekly_workout_frequency: payload.training_days_per_week` (`FitnessHistoryForm.tsx:158`) — it **silently overwrites** the answer the user gave two screens earlier. Sports and goals are then editable from *two* different screens (`EditProfileForm` and `fitness-history`), both writing `fitness_profile`.
- **Why it matters** — This is the reason first-run feels like homework. The user answers the same question three times in different words and one answer quietly replaces another. It also makes "did my answer save?" unanswerable.
- **Proposed change** — Pick one owner per field. Interests owns activities and stance. Profile Setup keeps only identity (photo, name, handle, voice). Fitness History becomes an optional depth card from You that never re-asks frequency. Do not re-ask `typical_weekly_workout_frequency` in two places.
- **Effort** — **M**

### 9. Interests: 36pt primary button, and the reward is invisible
- **Where** — `components/interests/InterestsWizard.tsx:58` (`FOOTER_BTN = { width: '100%', height: 36, borderRadius: 999 }`), `520-587`; `lib/interests.ts:220` (`INTEREST_ROOM_COINS = 10`); `supabase/migrations/20260902184854_interests_activity_cards.sql:223` (`maybe_grant_interest_room_coins`).
- **What's wrong** — Two things on the same screen. (a) Continue / Skip / Next / Done — the primary controls of the whole wizard — are forced to `height: 36`, under the ≥44pt lock. `StanceSlider` is also `HIT_H = 36` (`StanceSlider.tsx:13`). (b) The server grants 10 coins per completed room via trigger, so a full pass pays 60 coins, and the client **never mentions it** — `INTEREST_ROOM_COINS` is exported and referenced nowhere in `app/`, `components/`, `hooks/`, or `lib/` outside its own declaration.
- **Why it matters** — The wizard is the longest thing in the product and it asks for everything while promising nothing. It is being paid for and the user does not know. Meanwhile its buttons are the smallest primary buttons in the app.
- **Proposed change** — Raise `FOOTER_BTN` to 44 and `HIT_H` to 44. Put the earned coins on the room-complete beat — a coin icon plus 10 on the ✓ flash that already exists (`flashBobCheck`, `InterestsWizard.tsx:130-137`), and a running total on `InterestsYouCard`. Coin icon plus number, never the word "Coins" next to the amount.
- **Effort** — **S**

### 10. Simple Create speaks Advanced, and never shows the Prize
- **Where** — `lib/copy.ts:385` (`'create.taskLabel': 'Task A'`), `399` (`'create.hostPrize': 'Host contribution'`), `401-403`; `components/challenge/create/ExtraTasksEditor.tsx:121-133`; `SimpleCreateForm.tsx:697-709, 841`.
- **What's wrong** — On the *Simple* form a new host meets "Task A" (then "Task B", "Task C" from `taskLetterLabel`), "Host contribution", "Payout", "How you win", "Cumulative", "Min to start", "Allowed misses". The token `create.totalPrizePool` = `'Prize'` exists in `copy.ts:400` and is **not used on the Simple form** — the host sets an Entry fee and a Host contribution and is never shown the resulting Prize. The fee-disclosure sentence is also on the wrong lane: `{cash ? copy('create.youFundPrize') : copy('create.realMoneyFund')}` (line 707) puts "The entry fee helps cover technology and tournament management…" on the **Coins** lane, while the real-money lane gets only "You fund the prize."
- **Why it matters** — The prompt's own test — "can a new host finish Simple without learning Advanced words?" — currently answers no. And the money lock is "Display money as **Entry fee** and **Prize**." Simple shows Entry fee and a contribution, never a Prize, so "who pays and what do I win" is unanswerable on the screen where it matters.
- **Proposed change** — On Simple only: label the task field "What has to happen" (keep letters for extras), rename the host field to "Prize you add", and add one live Prize line using `create.totalPrizePool` — entry fee × min participants + host funds. Swap the two fee sentences onto their correct lanes. Do not rename SQL (`buy_in_amount`, `prize_pool`) and do not change Advanced.
- **Effort** — **S/M**

---

## 3. Wizard-specific maps

### 3a. Profile Setup — as it exists vs proposed

**As it exists** (`app/onboarding/profile-setup.tsx`, gated by `app/onboarding/index.tsx`)

| # | Screen | Fields | Required? |
|---|---|---|---|
| 0 | `/onboarding/legal` | ToS + Privacy accept | **Required** (`hasAcceptedLegal`) |
| 1 | "Join the lobby" | Photo, Username, Display name, Bio, Bob voice chips | Username + Display name **required**; photo/bio/voice optional |
| 2 | "Training" | What do you train? (chips), Workouts per week | **Both required** |
| 3 | "Physical Details" | Gender, Units, Height, Current weight, Goal weight, BMI card, MorphingBlob + body-fat slider | Gender + Height + Current weight **required** |
| 4 | *unannounced* Fitness History | Experience, Aims, Training days, Sports + per-sport sliders, Last mile, Limitations + notes, Units, Equipment | Experience + training days required to Save; **Skip for now** exists |
| 5 | Home | — | — |
| 6 | Interests nudge (`InterestsHomeHost`) | 6 rooms × N activity cards | Skippable |

Bar says "Step {n} of 3". Actual required-answer count before Home: legal + 2 identity + 2 training + 3 body = **8 mandatory answers**.

**Proposed shorter path**

| # | Screen | Fields | Required? |
|---|---|---|---|
| 0 | Legal | ToS + Privacy | **Required** — unchanged |
| 1 | "You" | Photo, Username, Display name, Bio, Bob voice | Username + Display name **required** |
| 2 | "What are you working on" | The Interests health/fitness room chips, reused | **Required: pick one or None of these** |
| → | **Home** | — | — |
| later | "Physical Details" from You, or on first body-composition challenge | Gender, height, weight, body fat | Optional, honest gate |
| later | "Sharpen matching" card on You | Fitness History | Optional |

Two required screens instead of four, three mandatory answers instead of eight, and the body-metrics step appears when it has an actual purpose.

**Other Profile Setup notes**

- Step titles are inconsistent in register and case: "Join the lobby" (a lobby is a different object), "Training", "Physical Details". Step 1's body promises "a starting wallet of **100 Coins**" — the word "Coins" next to an amount, against the money lock. Should be a coin icon plus 100.
- **Keyboard handling is good and should be kept**: `KeyboardFormShell` with `scrollToTopKey={step}` scrolls to top on every step change, and `protectFieldFocus` is on. This satisfies "scroll to top after a step".
- **But** on step 3 only `current_weight` and `goal_weight` are wrapped in `KeyboardField` (lines 599, 617). The height inputs (536-597) are not, so on a short screen the keyboard can sit over Feet/Inches with no scroll-into-view.
- Bio has no `maxLength` while the schema caps it at 160 (`validators.ts:62`), so over-typing is only reported on Continue. It does grow correctly (`multiline` → `sentence` in `Input.tsx:77`).
- **Voice chips are clean.** `COPY_TONES = ['gentle','honest']` (`lib/copy.ts:1`) and `PROFILE_SETUP_TONE_OPTIONS` offers only Gentle and Honest. Neutral is gone from the type and from every runtime call — the Aug 29 P1 is **fixed**. `'profile.toneNeutral'` remains as an unused string and `lib/types.ts:306` still accepts stored `'neutral'`, which is correct for legacy rows since `asCopyTone` maps it to gentle.
- **BFP copy matches the lock.** `bfp.sliderHint` honest variant is "Set current body fat, not a goal. Slide to match today, or enter the real %." — current body, not goal physique. `BODY_FAT_MIN`/`MAX` bound the slider and "Enter exact %" is inline.
- **Bob helps here, he does not lecture.** One `BlobMascot size={132} motion="float"` plus a one-line step body. That is the brief's "Bob gets one short line on product surfaces."
- Returning user vs first run: `EditProfileForm` is a much better screen — jump chips for Profile / Training / Physical Details, honest privacy sentence, no forced fields. Two problems: it renders **two** near-identical Bob voice pickers (`motivation_tone` at 546 and `encouragement_tone` at 550, both labeled from `MotivationToneChips`), and `profile_visibility` is in `EditValues`, in `buildDefaults`, and in the save patch (`onSave:343-345`) but has **no control anywhere in the render** — a dead field the user can never set.

### 3b. Interests — room list and which cards feel like homework

Six rooms, in `INTEREST_ROOM_SLUGS` order. No seventh room. ✔ lock

| Room | Chips | Activity card asks | Homework? |
|---|---|---|---|
| Health & Fitness | 13 | Stance slider + "I currently run / My goal is to run" pair sliders + period chips | **No** — the sentence sliders are the best interaction in the app |
| Sports | 12 | Stance + "I currently play" + period + **Highest level** chips, no goal slider | **No** — correctly has no fake goal |
| Personal Development | 9 | Varies hard: Academics wants Level **and** Focus; Work wants **Occupation and Employer**; Fasting wants Practice + two hour sliders; Reading/Writing get pages | **Yes** — Work demanding employer inside an onboarding wizard is the single most intrusive ask in the product |
| Relationships | 6 | Stance + sessions/week for Dating, Marriage, Friendship, Communication, Family | **Yes** — "how many Family sessions per week" is a category error; effort volume does not model a relationship |
| eSports | 16 | Stance + rank/MMR text + sessions/week | **Partly** — 16 chips is six rows of scroll, and "Rank" as free text will collect garbage |
| Outdoors | 10 | Stance + miles or sessions | **No** |

**Lock compliance — clean.** Room chips are multi-select and "None of these" is a **chip** in the same `ChipRow`, mutex via `toggleRoomPickerChip` returning `{selected:{}, noneOfThese:true}` (`lib/interests.ts:161-170`). Each selected chip gets exactly one card (`selectedChips` drives the pager); unselected chips get none. `StanceSlider` is **horizontal**, "Leveling up" left, "Excel" right, with no 1–5 numerals visible — the 1–50 score is internal. Sports uses `isPlayCard` + `showsHighestLevel` so it gets current play and highest level and no goal slider. Fitness uses sentence sliders that complete with a period chip. Unfinished selected cards leave the room `'incomplete'` via `stateForSave`, so the profile stays incomplete. First sentence on each room is `ROOM_REQUEST` = "Which of these are you currently doing or would like to improve?" via `copy('interests.roomRequest')`. Skip and Continue are one compact footer row. Card-to-card motion is real: `ActivityCardPager` + `RoomSlide` with `useReduceMotion`. No BMR, no public ratings, no indoor/outdoor control.

**Real problems**

1. **Length.** Six rooms plus one card per selected chip. A genuinely engaged user selecting four chips per room walks **~30 screens**. Nothing tells them how long it is: the room screen shows "1 / 6", the card shows "2 of 4" *and* a segmented bar — three progress systems, none of which describe the whole journey.
2. **"Skip" on a card skips the entire room.** `onSkip` calls `saveRoom({ action:'skip' })` then `goNext(step)` (`InterestsWizard.tsx:254-267`). On an activity card the footer reads "Done"/"Next" beside "Skip", so a user meaning "skip this one activity" loses the room. Label it "Skip room".
3. **The blocked-Continue error can be off-screen.** `formError` renders at the bottom of the room `ScrollView` (`498-502`) while the footer is fixed. In eSports (16 chips) a user can tap Continue while scrolled up and see nothing happen.
4. **Dead leftovers from the pre-slider design.** `allowsIndoorOutdoor: false` on all 80+ chip defs and never read. `Chip`'s `dual` branch with `Excel` / `Level up` `Mark` sub-chips (`components/ui/Chip.tsx:65-111`, 22pt) plus `toggleChipStance`'s dual path and `setChipMark` — the wizard passes no `onToggleExcel`, so this is unreachable. Harmless but it is the old design still in the tree.
5. **The wizard does earn part of its length — more than expected.** Answers are consumed by Lobby ranking (`rankInterestChallenges` / `interestsRankProfile` in `app/(tabs)/challenges/index.tsx:39,134`), the Start This sheet → prefilled Simple create (`simpleDraftFromStarter` / `starterFromCreateParams`), `InterestsYouCard`, `OfficialPitchHost`, and the tab-bar dot. **Home does not use them at all** — `app/(tabs)/feed/index.tsx` imports nothing from interests. So the payoff exists but is invisible on the one screen the user lands on.

### 3c. Simple Create — field list vs proposed one-screen hierarchy

**As it exists**, top to bottom (`SimpleCreateForm.tsx`)

| Order | Section | Line |
|---|---|---|
| 1 | **Currency** — Coins / $ | 641 |
| 2 | **Entry fee** stepper, **Host contribution** stepper, 2 gray help lines, Guaranteed Prize switch, shortfall + Add button | 676 |
| 3 | **Type** — icon chips | 755 |
| 4 | **How you win** + "Need a scoreboard? Use Advanced." + **Payout** chips | 781 |
| 5 | **Title** | 857 |
| 6 | **Description** (grows) | 874 |
| 7 | Challenge photo | 884 |
| 8 | **Start** chips + DateTimeField + **Min to start** stepper | 890 |
| 9 | **Duration** chips + custom days + end line | 942 |
| 10 | **Task A** + Proofs editor + Extra tasks | 982 |
| 11 | **Frequency** chips + custom + **Allowed misses** stepper | 1027 |
| 12 | **Visibility** + Friends-of-friends toggle | 1084 |
| 13 | Money notes (up to 3 gray lines) | 1149 |
| 14 | "Advanced" text link | 1169 |
| — | Footer: Back · Save Draft · Review | 1183 |

**Proposed hierarchy** — same fields, same components, reordered and regrouped:

1. **What** — Title, Type chips, "What has to happen" (task) + Proofs, Extra tasks, photo, description
2. **When** — Start chips + resolved local start line, Duration, Frequency, Allowed misses
3. **Who** — Visibility, Friends of friends, Min to start *(move it out of Start — it is a roster rule, not a schedule rule)*
4. **Money, last** — Currency, Entry fee, Prize you add, **one live Prize line**, guarantee, then the money notes once
5. One route to Advanced, not three

Today there are **three** separate entrances to Advanced on this one screen: `CreateModeSwitch` in the header (607), "Need a scoreboard? Use Advanced." (811-827), and the bottom "Advanced" link (1169-1178). Two of them `router.replace`, so history is lost. Keep the header switch only.

**Simple Create — what is already correct (leave alone)**

- **Simple $ is host-funded only.** `cash ? null : <StepperField label={copy('create.buyIn')} …>` (688) hides the entry fee on the cash lane, and `creatorBuyIn = cash || corporate ? 0 : buy_in` (382). ✔ lock
- **Allowed misses is present on Simple consistency** and force-zeroed for cumulative inside `patch` (271-275). ✔ lock
- **Payout pairing is right.** `payoutOptionsForFamily('consistency')` → `even_split_remaining | last_standing`; points → `winner_take_all | top_count | top_percent | scaled` (`lib/formatPayout.ts:5-6`). ✔ lock
- **Footer sits on the keyboard with no phantom gap.** `createStickyFooterPad(keyboardOpen, closedPad)` returns `0` when the keyboard is open (`wizardUi.tsx:401-404`), and `tabBarLift(insets.bottom, 'sticky')` is used otherwise. Footer buttons are `minHeight: 44`. ✔ lock
- **Web focus is handled.** `scrollFieldIntoView` measures and scrolls with a platform-tuned delay, `keyboardShouldPersistTaps="handled"`, `keyboardDismissMode="none"`, and `scrollToSection` branches to `document.getElementById(...).scrollIntoView` on web with `nativeID` set on every section. Create fields should not lose focus on web.
- **Locked-after-join rejects the tap and keeps the value.** `PrivacyModePicker.select` runs `canChangePrivacyMode` and calls `onLockedAttempt` (→ `setError`) without mutating (`PrivacyModePicker.tsx:46-62`). ✔ lock — though the rejection message then hits the one-line error slot (recommendation 2).
- **Edit maps fields rather than blanking.** `simpleDraftFromChallenge` hydrates Simple; `usesAdvancedCreateEdit` redirects Advanced challenges to the Advanced wizard; `stageAdvancedFromSimple` / `peekSimpleFromAdvanced` carry the draft both ways across the mode switch. ✔ lock

### 3d. Advanced Create — the 11 steps

`lib/challengeTemplates.ts:40-52`, fields per step at `CREATE_STEP_FIELDS:60-72`.

| # | Label | Holds | Problem |
|---|---|---|---|
| 1 | Lane | `challenge_lane` | Pre-choice shown as a step; unreachable by Back |
| 2 | Start | *nothing* (`1: []`) — it is the start **path**: scratch / template / previous | **Name collision.** "Start" does not set the start; `starts_at` is in step 5 |
| 3 | Goal | `title, description, category, visibility, privacy_mode, task, extra_tasks, cover_image_url` | Default entry point; labeled "Step 3 of 11" |
| 4 | Type | `challenge_type` | — |
| 5 | Duration | `duration_*, starts_at, ends_at, end_mode, frequency, target_count` | Contains the actual start date |
| 6 | Prize Structure | `prize_structure, top_places_*` | Money part 1 of 3 |
| 7 | Scoring method | `scoring_method, scoring_config` | Reads as a second "how you win" |
| 8 | Funding | `funding_model, creator_contribution, guarantee_enabled` | Money part 2 of 3 |
| 9 | Entry & Limits | `buy_in, currency, participant_cap, min_participants, misses_allowed, proof_review` | Money part 3 of 3 — currency lands here, eight steps after Prize Structure |
| 10 | Rules & Proof | `rules, proofs, tasks, frequency, target_count, points_to_win, rule_activity, extra_rules, min_minutes` | `tasks` + `extra_rules` here vs `task` + `extra_tasks` in Goal |
| 11 | Review | — | — |

- **Money is unreadable across three non-adjacent steps.** Prize Structure (6) → Funding (8) → currency and Entry fee (9). "Can they tell who pays?" No.
- **Goal vs Rules vs Points feel identical because they nearly are.** `task`/`extra_tasks` on Goal, `tasks`/`extra_rules` on Rules, `points_to_win` seeded from `sumTaskPoints(getValues('tasks'))` on Next. Three names, one mental model.
- **`frequency` and `target_count` are declared on both step 5 and step 10** (`CREATE_STEP_FIELDS[4]` and `[9]`), so the same two fields are validated by two steps.
- **Step dots are far too small.** `WizardProgress` renders 11 `flex-1` `Pressable`s with a 3–6px bar and `py-1`, `hitSlop={6}` (`wizardUi.tsx:364-388`). At phone width that is roughly 30 × 23pt per jump-to-step target, against the ≥44pt lock — and a mis-tap teleports the host across the wizard.
- **"Empty Add another rule blocking Next" is NOT a live bug.** `goNext` at `STEP_RULES` calls `flushRulesDraftRef.current()`, `stripBlankExtraRules()`, `stripBlankExtraTasks()`, then `seedPointsTaskFromGoal()` and `syncRuleActivityFromTask()` before validating (`CreateWizard.tsx:1293-1311`). Blank rows are stripped, not blocking. Leave it.
- **Private Corporate locks correctly after joins** via the same `PrivacyModePicker` gate.
- **Bob is used well in the wizard shell** — `BobGuide` with paged tips, an error variant that turns the bubble red-bordered, and a dismiss button. This is the strongest Bob implementation in the product.

---

## 4. Visual / graphic notes

Stay on `lib/theme.ts`. No new palette proposed.

- **Token discipline is genuinely good.** I found no ad-hoc hex outside `lib/theme.ts` in the audited screens except three intentional, commented cases: the error-bubble pair `#FEF2F2` / `#E11D48` in `wizardUi.tsx:182-183`, `#EEF1F0` for selected Private Corporate (`PrivacyModePicker.tsx:162`), and scrim `rgba(...)` values. Radius uses `THEME.radius` (22) and `themeShadow()` consistently. `themeShadow` correctly branches web `boxShadow` string vs native array.
- **The Interests wizard is a dark-mode island.** `BackdropSlot` paints `THEME.primary` (#101312) with a room gradient and a 55% dark scrim, and the wizard sets all its type to `THEME.primaryForeground` (white) — `InterestsWizard.tsx:453, 465, 503, 603`. Every other consumer screen is cream `#F7F7F5` on white surfaces. The tokens are legal; the *surface language* is inverted for six screens in the middle of onboarding. The white `ActivityCard`s inside it read correctly, which makes the room-picker screens the odd ones out. Recommendation: keep the gradient as a header band and put the chips on `THEME.surface` cards, or accept the dark treatment and commit to it as a deliberate "rooms" mode — but do not leave it ambiguous.
- **Bob as 22%-opacity wallpaper.** `BackdropSlot.tsx:55-59` places `blob-login.png` at `opacity: 0.22`, 120×120, bottom-right, `pointerEvents="none"`, behind text. The lore lock is Bob on empty / loading / success / onboarding as a *presence with a line* — and the design lock says Bob stays on a transparent background with no matte. A 22% ghost behind body copy is decoration, not the mascot. Either bring him to full opacity with one line, or remove him from the backdrop and let `flashBobCheck` be the Bob moment.
- **Bob recedes correctly on money.** `SimpleCreateForm`'s money sections are plain type with no mascot, and the shortfall path is a bare "Add $X" button. `MascotState kind="error"` is used for sign-in-required on create, which is a warmth moment, not a money moment. ✔ lock
- **Type scale is coherent but has outliers.** The app leans on 11 / 12 / 13 / 15 / 22 / 26. Two things stand out: the **BMI number at 28px extrabold** (`profile-setup.tsx:643`, `EditProfileForm.tsx:804`) is the largest number on the body-metrics step, making a weight-status index the visual hero of a screen the brief says must never praise or grade a body — and it is the only place a computed body number is presented with no explanation or action. Consider removing the BMI card entirely; nothing reads it. Second, the Interests room title is 26px on a dark scrim, which is the largest type in onboarding.
- **Gray-on-gray help copy stacks up.** On Simple Create the money block prints two 13px muted lines back to back (707-709), then up to three more at 1149-1156, then Review prints up to four more (619-632). `create.proofsBelong` renders once in `SimpleProofsEditor` (169) **and once per extra task card** (`ExtraTasksEditor.tsx:184`). At `THEME.textMuted` (#7F8581) on #F7F7F5 this is a low-contrast wall. Print each money sentence once, at the moment it applies.
- **Official vs peer surfaces are well differentiated in tokens** — `THEME.callout` / `calloutSoft` / `calloutWash` (gold) are explicitly commented as "not Official dark and not peer mint", and Private Corporate gets a dark 2px border plus a lock glyph. The tag-by-type system the brief asks for exists at the token layer.
- **Web truncation risk.** `flexChildMin()` exists for exactly this and is used in the right places. Remaining risks I saw: interests chips are hard-pinned to `width: '31%'` with `lines={2}` (`InterestsWizard.tsx:476, 486`) — "Diet & Nutrition", "PUBG Mobile", "Rocket League", "Trail running" are tight at three columns on a 375pt shell; the sport pill in Fitness History and Edit Profile is `maxWidth: '38%'` with `numberOfLines={1}` (`FitnessHistoryForm.tsx:279-293`), so longer custom sport names ellipsize; and `ActivityCard`'s title is `numberOfLines={1}` at 22px extrabold. None are broken, all are worth a phone-width browser check.
- **One React Native `Modal` on a consumer surface.** `components/challenge/create/ChallengeCoverCrop.tsx` uses `<Modal visible animationType="fade" transparent>`. The lock is "Never use React Native `Modal` for in-app sheets. Use `ChromeOverlay`." The only other `<Modal` uses are `app/admin/errors.tsx` and `app/admin/reports.tsx`, which are Official-only admin and outside the consumer lock. `InviteToChallengeModal` is named "Modal" but does not use RN `Modal` — it is fine. Everything else audited — plus menu, lobby filter/sort, settle and join confirm, capture audience sheet, clip share/repost/more sheets, wallet, top-up, account health disconnect, new conversation — correctly uses `ChromeOverlay`.

- **Sub-44pt hit targets are a systemic pattern, not isolated.** Nine distinct places, which together make this worth one sweep rather than nine tickets:

  | Control | Size | File |
  |---|---|---|
  | Interests Continue / Skip / Next / Done | **36** | `InterestsWizard.tsx:58` |
  | Interests stance slider track | **36** | `StanceSlider.tsx:13` |
  | Advanced step dots (jump-to-step) | **~30 × 23** | `wizardUi.tsx:364-388` |
  | Lobby card primary pill (Join / Check In) | **32** | `LobbyListCardView.tsx:736-737` |
  | Lobby card View / Share | **28** | `LobbyListCardView.tsx:702` |
  | Invite-card View / Share (feed embed) | **24** | `ChallengeInviteCard.tsx:589` |
  | Capture preview close × | **32 × 32** | `CaptureStudio.tsx:574-577` |
  | Messages header + and × | **32 × 32** | `messages/index.tsx:54-64` |
  | Check-in composer overlay chips | **36** | `CheckinComposer.tsx:958` |

  The counter-examples show the team knows the rule: the clip player close is a 44×44 white glyph on a 55% disc from dedicated tokens (`THEME.playerCloseSize`), check-in composer close and icons are 44×44, create footer buttons are `minHeight: 44`, header rows are 44, and conversation rows are 44. `Chip`'s default `minHeight: 36` plus `hitSlop={4}` reaches 44 effective and is fine. The list above is where the lock actually breaks — and it breaks hardest on **Join and Check In**, the two most important taps in the product.

- **Official vs peer differentiation is a genuine strength.** Official gets a dark hero (`#1B5A50 → #0E2421`) with white type and split Entry fee / Prize on a dark inset; peer gets a light surface with cover art or a category wash; Callout gets the gold `THEME.callout` family with a left accent bar; Private Corporate gets a dark 2px border and a lock glyph. A user learns the surface by color before reading a word, which is exactly what the brief's tag-by-type system asks for. Do not flatten this.

- **Home's rail stack is the density problem.** Before the first post a cold Home shows: fixed header chrome, the pinned Waves tray, then Featured Official strip, Pulse rail, Callout pin, Rounds rail, and the composer. That is one pinned and four scrolling horizontal rails competing above content. The scroll lock is correct — the *quantity* of rails is the issue. Lobby has the mirror problem: search, four section tabs, a Cards/List/Filters/Sort row, and dismissible filter chips — five control bands before the first challenge card, which reads as admin tooling on a consumer surface.

- **More web truncation candidates** (add to the phone-width browser pass): `stillNeeded` in the check-in composer is `numberOfLines={1}` (`CheckinComposer.tsx:765-768`), so a long required-proof list ellipsizes exactly when the user needs to read it; the Rounds rail handle renders at **9px** (`ReelsRow.tsx:205-206`); post author names are capped at `maxWidth: '70%'`; lobby titles are `numberOfLines={1|2}`; and the clip player author name is `numberOfLines={1}` over video.

---

## 5. Logic / IA notes

- **Dead control: `profile_visibility`.** Present in `EditValues`, `buildDefaults`, and the save patch in `EditProfileForm.tsx` (79-92, 942, 343-345) with no rendered input. Public vs friends profile visibility is unreachable.
- **Dead constant with a live server reward: `INTEREST_ROOM_COINS`.** Declared at `lib/interests.ts:220`, granted by `maybe_grant_interest_room_coins()` in `supabase/migrations/20260902184854_interests_activity_cards.sql:223`, never surfaced to the user.
- **Duplicate voice setting.** Two `MotivationToneChips` on Edit Profile (`motivation_tone`, `encouragement_tone`). First-run sets only the first. A returning user sees two "how should Bob talk to you" pickers and cannot tell them apart.
- **Silent overwrite of an answer the user just gave.** `FitnessHistoryForm.onSubmit` writes `typical_weekly_workout_frequency` from `training_days_per_week`, replacing the Profile Setup step-2 answer.
- **Header menu is still on the hamburger, not Bob.** `LOGO_MENU` — Create a Challenge, Create a Circle, Call someone out, Join a Challenge, Send Coins or $ — is opened by the control at `TabChrome.tsx:171-173` (`accessibilityLabel` "Open menu"), while Bob at 220-221 is `accessibilityLabel="Home"` → `onHomePress`. The lock says those actions live in the **blOb logo** menu. The constant is even named `LOGO_MENU`. This is the Aug 29 P1 still open: pick one control and match the header, the lock, and the tour.
- **"Join a Challenge" still opens a browse list**, not a join. Carried over from Aug 29 and unchanged.
- **Start-gate language is good.** `create.minToStartHint` = "Includes you. If fewer people have joined at start, it waits and the start moves to the next day." — plain, correct, and matches the roll-forward rule. Its only problem is that it is stapled into the Start section and can be clipped by the one-line error slot when it surfaces as an error.
- **Success scroll-to-top exists in the right places.** `SetupProgress` step changes scroll to top via `scrollToTopKey`; `EditProfileForm.onSave` calls `scrollRef.current?.scrollTo({ y: 0 })` on both the saved and the no-op path. Interests resets `cardIndex` and re-slides per room.
- **Missing success beat on Interests room completion.** `flashBobCheck()` shows a bare `✓` glyph for 800ms next to the room title. That is the only acknowledgment for finishing a room — no coins, no "3 of 6 done", no Bob line. This is the cheapest available win in the whole audit.
- **Cold start is correct.** `app/index.tsx` redirects on `useMyProfile().path` — `auth` → login, `app` → tabs, else `/onboarding`. There is no last-open-challenge restore on cold start. ✔ lock (the Aug 29 note about `/details` surviving a short background is a resume-policy question, not cold start.)
- **"Delete" on a clip does not delete, and the product forbids deleting.** The own-clip overflow renders `<MoreRow label="Delete" …>` (`components/clips/ClipPlayer.tsx:1520`). The confirm sheet then says "Remove this clip? It leaves your rails. Other people will see that this clip isn't available. Comments stay." and calls `setPostHiddenFromRail(postId, true)` (`:1584-1596`). The action and its confirm copy are both correct and honest; only the menu label is wrong, and it promises the one thing users cannot do. Rename the row to **Remove**. (The post overflow elsewhere is clean — `SocialSheets.tsx` offers Edit, Hide from home, and Hide, with no Delete. `useDeletePost` exists in hooks but is wired to nothing.)
- **`components/profile/ProfileEarnings.tsx` is not mounted anywhere.** It is referenced only by its own file. Dead component.
- **Correcting the Aug 29 audit: the Advanced "Partner product (soon)" row is not a tappable no-op.** It is `disabled` with an explanatory body, and the `onPress={() => {}}` never fires (`CreateWizard.tsx:2722-2726`). The only live problem on that row is its copy — "For now, fund **Coins** or $ yourself" — which is recommendation 4. No dead button to hide.
- **Money is stated three times on an Official challenge.** Lobby card (Entry fee / Prize on the dark inset) → detail hero (goal, entry, prize) → Mechanics and Prize cards → `OfficialMoneyBoard`. Each is individually well written; together they make the detail screen feel like it is repeating itself. Pick one authoritative money surface per screen.
- **The Join CTA's default verb is "Participate", not "Join".** `app/(tabs)/challenges/[id]/index.tsx:1540-1545`. Every other surface — lobby card footers, invite cards, the header menu, the tour — says Join. Worth confirming this is intentional; if it is a legal-framing choice it should be applied consistently or not at all.
- **Two more places where Bob is absent and warmth would help**, both matching the pattern in the scores: the **Lobby Official tab** has no loading Bob (the other three tabs do — it falls through to an empty `ScrollView`), and the **Multi Check-In empty state** is a plain card with a Browse button. The Official-tab gap is the more visible one because Official is the tab most new users open first.
- **Sticky Join / Check In vs the floating pill — verify on device, do not assume a bug.** The sticky CTA block on challenge detail is `position: 'absolute', bottom: 0, zIndex: 20` (`index.tsx:1517-1523`) while `BlobTabBar` is `zIndex: 130` (`BlobTabBar.tsx:79`), so the pill draws over the CTA where they overlap. That overlap is *intended*: `tabBarLift(insets.bottom, 'sticky')` returns `TAB_BAR_SCENE_PEEK` (18) and the token comment states "Scene already ends at the tab bar. The pill peeks TAB_BAR_SCENE_PEEK into the scene; sit on that edge with no extra transparent gap." So the 18pt is the peek allowance and the CTA should land flush above the pill. This is the single highest-traffic CTA in the product, so it deserves a real device check on a notched iPhone, an Android with gesture nav, and a phone-width browser — but I found no code defect.
- **Correcting the capture/social reader: Bob on Callout loading is sanctioned, not a violation.** `app/(tabs)/challenges/callout/[id].tsx:67-70` uses `MascotState kind="loading"` on a screen that shows a cash stake. The lore guide lists where Bob recedes — "payment errors, failed join, ledger failures, geo-blocks and legal disclaimers, anything that must stand in court" — and lists loading as a place he *should* appear. A loading state is not a money moment. Leave it. What matters is that the ledger surfaces themselves stay clean, and they do: `OfficialMoneyBoard`, the Prize card, `WalletSheet`, `TopUpSheet`, Send, and the legal documents all render with no mascot.
- **Platform behavior of everything in this audit is shared.** The only `Platform.OS` branches I hit are `themeShadow` (web `boxShadow` string vs native array), `scrollToSection` (web `scrollIntoView` vs native `measureLayout`), and an 80ms vs 40ms Android/iOS delay in `scrollFieldIntoView`. All three are correct parity shims, not divergent UX. Profile Setup, Interests, Simple Create, and Advanced Create render from one tree on iOS, Android, and Expo web; nothing in these flows is native-gated, so there is no dead control on web. Not verified in a live browser on `blob.mobi` this pass — the truncation items in section 4 are the ones to click through.

---

## 6. Explicit non-issues — locks I left alone

These are correct, deliberate, or already handled. Do not re-open them.

1. Mobile-first with web as the same app in a phone-width shell — `FEED_COLUMN_MAX = 430` and `flexChildMin()` exist for this.
2. Fixed header + floating pill tab bar; sheets in the gap — `tabBarLift`, `TAB_BAR_*` tokens, `ChromeOverlay`.
3. One Expo tree for iOS / Android / Web. I did not touch `web/components/blob-app.tsx` and recommend nothing be added to it.
4. **Check In from + opens a picker then `/challenges/{id}/submit` only.** `PlusActionBar` `'log'` never routes to Wave; the Post sub-step is a separate branch.
5. **Post from + opens Wave / Round / Feed.** `PlusActionBar.tsx:66-72`.
6. Lobby also has Create Challenge alongside the header menu.
7. **Home cold start lands on Home; no last-open-challenge restore.**
8. **Simple $ = host-funded prize only** — entry fee stepper is hidden on the cash lane.
9. **Consistency payout = even-split remaining or Last standing; Points = WTA / Top # / % / Scaled** — `lib/formatPayout.ts`.
10. **Interests: multi-select chips, "None of these" as a mutex chip, one Activity Card per selected chip, horizontal stance slider with no 1–5 numerals, Fitness sentence sliders with a period, Sports with current play + highest level and no goal slider, no BMR, no public ratings, no seventh room.** All verified in source.
11. **BFP setup asks for current body, not goal physique**, and 1% / 50% bound the slider.
12. **Body-copy fields wrap and grow** — `Input`'s `grow` / `sentence` logic; titles, search, steppers, and amounts stay one line. (The exception is error text — recommendation 2.)
13. **Challenge drafts are explicit Save Draft only** — there is no autosave timer. (The *restore* side is recommendation 5.)
14. **Create/Edit footer sits on the keyboard with no phantom gap** — `createStickyFooterPad` returns 0 when the keyboard is open.
15. **Locked-after-join fields reject the tap and keep the saved value** — `canChangePrivacyMode` + `onLockedAttempt`.
16. **Bob recedes on money and legal**, and the create money block is plain type.
17. **Voice is Gentle or Honest only.** `COPY_TONES` no longer contains neutral and no runtime call passes it. Stored `'neutral'` still maps to gentle via `asCopyTone` — leave that.
18. **Home pins only the menu and the Waves rail**; Official, Pulse, Callout, Rounds, and Composer all scroll. Explicitly commented at `app/(tabs)/feed/index.tsx:62` and `components/feed/FeedList.tsx:88`.
19. `America/Denver` as the default challenge timezone, never the device zone.
20. Users cannot delete posts; check-in posts cannot be deleted from the lobby. I did not add or propose any delete affordance — recommendation-adjacent note in section 5 asks only to *rename* a mislabeled menu row, not to add deletion.
21. Circles ≠ Challenges — separate routes, separate tokens (`THEME.circle` / `circleSoft`).
22. Simple is the default create mode; Advanced is the long form (`create.tsx` renders `SimpleCreateForm` unless `mode === 'advanced'`).
23. `stripBlankExtraRules` / `stripBlankExtraTasks` already prevent empty "Add another rule" rows from blocking Next.
24. No check-in RPC, settlement, Google auth, `vercel.json`, or theme token was read for modification or changed.
25. **Body metrics never reach a public profile.** `PUBLIC_PROFILE_COLUMNS_BASE` omits gender, height, and weight; `redactPublicProfile` additionally nulls `height_cm`, `current_weight`, `goal_weight`, and `body_fat_pct`; and `PublicProfileScreen` renders none of them. Metrics appear only on the owner's You tab under a **PRIVATE** label. Clean pass on the hardest privacy lock.
26. **Follow is Creator/Official only; peers get Add friend.** `UserSearchResult` never offers Follow — even for a one-way `following` relation it shows "Not friends yet" plus Add friend — and the Follow control on public profiles is gated to Creator/Official and enforced again server-side in `useFollow`.
27. **Share to Feed is Round-only.** `canOfferShareToFeed` returns false unless `kind === 'round'` (`lib/roundShare.ts:30`), and `RoundShareComposer` blocks on the same check. This closes an Aug 29 P1 that flagged Wave share-to-feed — it is fixed. `allowedShareAudiences` also prevents a repost from widening past the Round's own audience.
28. **Wave / Round / post naming, and the Round's own player grammar, are consistent** — Waves get segment progress bars and left/right-third navigation, Rounds get a scrubber and tap-to-pause. Both have a working Web path via `getUserMedia` plus a gallery fallback, so neither is a native-only dead end.

---

## 7. Suggested next Cursor prompt

One ship. The highest impact-per-effort item that is safely S/M and touches one flow: **let a new user reach Home without disclosing their body.** It removes the biggest drop-off in the product, fixes the progress bar that currently lies, and does not restructure any wizard.

> On `blob-beta-three`, Expo Router consumer tree only. One change: **make Profile Setup step 3 (Physical Details) and the Fitness History form genuinely skippable in first-run, and make the progress indicator honest.** Do not touch check-in RPCs, settlement, Google auth, `vercel.json`, or `lib/theme.ts`. Do not restructure the Interests wizard or either Create form.
>
> 1. `utils/validators.ts` — in `profileSetupSchema`, make `gender`, `current_weight`, `height_cm`, `height_ft`, and `height_in` validate only when a value is present. Keep every existing range check (feet 4–7, weight > 0, username 3–24 lowercase, display name ≥ 2) for when the field *is* filled. Username and display name stay required. Keep `body_fat_pct` defaulted.
> 2. `app/onboarding/profile-setup.tsx` — on step 3 only, add a `variant="ghost"` "Set this up later" button under Finish that submits whatever is filled and continues. Leave the existing Finish, Back, `KeyboardFormShell`, `scrollToTopKey={step}`, and `protectFieldFocus` exactly as they are. Wrap the height inputs (the `unit === 'lb'` Feet/Inches pair and the `height_cm` field) in `KeyboardField` the same way `current_weight` and `goal_weight` already are.
> 3. `app/onboarding/profile-setup.tsx` — in `onSubmit`, only send `gender`, `height_cm`, `current_weight`, `goal_weight`, and `body_metrics_completed_at` when the user actually entered metrics. Do not stamp `body_metrics_completed_at` on a skipped step.
> 4. Remove Fitness History from the required first-run chain: in `onSubmit`, always `router.replace('/feed')` instead of redirecting to `FITNESS_HISTORY_HREF`. Leave `app/(tabs)/profile/fitness-history.tsx` and `FitnessHistoryForm` in place and reachable from You so nothing is lost.
> 5. `components/ui/SetupProgress.tsx` — keep the three steps and labels. No fourth step is needed once step 4 is off the required path.
> 6. Fix the money wording in `STEP_COPY[0].body` in `app/onboarding/profile-setup.tsx`: it currently says "a starting wallet of 100 Coins". Per the money lock, never put the word "Coins" next to an amount — use the coin icon plus 100, matching how the header wallet renders it.
> 7. Do not change `EditProfileForm`, `BodyMetricsForm`, `MorphingBlob`, `BodyFatSlider`, or any `bfp.*` copy. Do not remove the BMI card in this pass.
>
> Then state how first-run behaves on **iOS**, **Android**, and **Expo web**, and confirm: a brand-new account can reach Home having typed only a username and a display name, and a user who *does* fill in metrics still gets `body_metrics_completed_at` stamped and still sees the body-fat slider.
