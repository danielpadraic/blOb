# blOb — UI/UX Design Brief

**Audience:** Lead UI/UX designer (ChatGPT Project or human)  
**Status:** Working brief compiled 22 August 2026 from locked product docs  
**Product name:** blOb (exact casing)  
**Mascot / voice:** Bob (character); Barb (rare, off-screen)

---

## 1. Product in one paragraph

blOb is a **mobile-first** social app where people create and join **skill-based challenges** (consistency, effort, proof), pay an **entry fee** in coins or real money, **check in** with proof, and share a **prize** among finishers. It sits at the intersection of skill contests, social feed, and simple P2P settlement — designed to get people to do the things they already know they should do, with witnesses and skin in the game framed as a **tournament of effort**, not a game of chance.

**Core loop:** create → join → check-in (Begin / Continue / Submit) → settle.

---

## 2. Design principles (non-negotiable)

1. **Native smartphone first** — Seasoned iOS/Android eye on every change. Copy patterns from Instagram, TikTok, Snapchat, YouTube, Facebook — not enterprise dashboards.
2. **Icons over text** — Fixed chrome, minimal chrome labels, no extra steps.
3. **Money is clear** — Entry, prize, refunds, and failures use plain language. No dark patterns. No casino energy.
4. **Social is native** — Feed, waves, DMs, tags, reactions feel like a social app; challenges are not a bolted-on form.
5. **Bob softens stakes** — Mascot in empty/loading/success/onboarding; he recedes on legal/payment errors.
6. **Effort, not aesthetics** — Never praise how a body looks. Praise the promise kept and the proof.
7. **One primary CTA** — Floating join/check-in above the tab bar; content scrolls underneath with bottom padding.
8. **Safe areas** — Respect notch, home indicator, keyboard; hit targets ≥44pt.

---

## 3. Brand & visual direction

### Mascot

- Soft, slightly chubby **white blob**; simple dark eyes; gentle smile; **one lobe raised in a wave**.
- **No hands, no feet** in default form.
- 3D waving Bob for large moments (pitch, empty states, login, onboarding).
- **Wordmark / tiny 2D** for header, favicon, icons under ~32pt (3D becomes a smear).
- Tech comedy for selfies: phone propped on a fold, half-absorbed, timer on the wrong side — not human thumbs.

### Palette & surfaces (direction)

- Light cream / off-white app surfaces.
- Teal accents for primary actions and official tags.
- Soft elevated cards; high contrast type.
- Tag system: color by **type** (Public, Official, Consistency, Coins, Open, You’re in) so users learn tags by color, not only by word. Avoid everything being the same teal pill.
- Challenge hero cards: dense but readable; prize + ring + required icons (camera, heart-rate) on the card.
- Info control: small **i** in a hairline circle, top-right of the **label** (not a large ? on the amount); popover near the thumb, not a bottom sheet docked to the tab bar.

### Typography

- Product UI: clear, system-friendly, readable at mobile sizes.
- Avoid long motivational paragraphs on product chrome; Bob gets **one short line** on product surfaces.
- Feed and captions can be slightly longer; still specific and human.

### Motion

- Wallet: count-up when coins were earned since last shown balance.
- Prefer subtle, purposeful motion (success, balance) over decorative animation.

---

## 4. Information architecture (MVP)

**Tab bar (conceptual)**

| Tab | Role |
| --- | --- |
| Home | Social feed first; Official as peripheral strip/reminder if not already in |
| Lobby | Challenge discovery: Hosting / Active / Official / Friends carousels |
| + | Create / capture hub |
| Friends | Graph, invites, people |
| You / Profile | Profile, settings, Report a problem, wallet entry |

**Header chrome**

- blOb wordmark or small brand mark  
- Search  
- Coin balance (icon + number) · $ balance  
- DMs  
- Notifications  

**Key screens**

- Login / register (Email + Google; no Apple until configured)
- Profile setup + legal accept (ToS / Privacy in-app overlay)
- Home feed + composer (camera / gallery / GIF under field)
- Challenge detail (hero, mechanics, board, details, challenge feed)
- Check-in flow (Begin → Continue → Submit)
- Create Simple / Advanced + Review
- Wallet
- Admin (`/admin`) — Official @blob only: Pulse, Errors, Reports, Wallets

---

## 5. Functional locks that drive UI

### Challenges

- **Simple create (default):** public toggle, coins or $, start required, duration, task, frequency, proof; consistency format; misses = 0 by default; min 2 / max unlimited; creator in.
- **Advanced:** fuller controls.
- **Live** only when `now ≥ start` **and** joined ≥ min participants.
- Under min at start → roll start +1 day; host: keep duration vs shorten; wipe check-ins, keep posts; ring resets to 0.
- **Check-in:** Begin (e.g. pre-selfie) → Continue (remaining proofs) → Submit (day counts). Not one forced upload of everything.
- **Miss at window end** without Submit → miss; Official / miss=out → eliminated.
- Official days end **11:59 p.m. Central Time**; long day-1 window when start is mid-day.
- Challenge feed is **one-way:** posts composed *in* the challenge + check-in stages. Home shares do **not** appear in the challenge room. Share-to-feed may show a challenge **card**; in-room posts use “@user — in {challenge}”.
- **Leave** before live (user-created): confirm + refund entry. Official: no leave (entry not refundable once paid — match legal copy).

### Money display

| Concept | UI |
| --- | --- |
| Soft currency | Coin **icon** + amount — never the word “Coins” next to amounts |
| Real money | **$** + amount |
| Join CTA | “Join” + coin icon + amount, or “Join $1.00” |
| Entry fee row | Icon/amount, not “10.00 Coins” |
| Prize | “Prize” + amount + distribution (“split evenly”) |

### Proof (Official direction)

- Pre-workout selfie, post-workout selfie, ≥30 minutes elevated heart rate (Watch/Fitness attach preferred; screenshot allowed if it shows date, duration, graph).
- Strength counts; fluctuation OK; not cardio-only.
- Samples sheet on first Official Begin.
- Peer anonymous flag; no auto-ban on “AI detect.”
- Check-in camera: **no beauty filters**; “Same outfit. Face in frame.”

### Social

- Friend request/approve default; Follow = Creator (paid) only.
- Composer: full-width field; icons **under** field: Camera | Gallery | GIF (no paperclip).
- Images in feed: **contain** (no aggressive cover-crop).
- Privacy: globe / friends icons; adjustable after post where product allows.
- Users cannot delete posts (product lock).

### Voice in UI

- Product microcopy: short, concrete, Bob when soft; plain when money/legal.
- Encouragement tone on profile: Gentle / Neutral / Honest (notification bank).
- Never “Log” for check-in. Never “HR” abbreviation in user-facing proof copy if locked to full “heart rate.”
- Never “Bucks” word; use $.

---

## 6. Goals (what good design optimizes)

1. A new user understands **Official week** and can join without confusion.
2. A participant can **Begin / Continue / Submit** without Postgres or dead ends.
3. Home feels **social**; Official is a reminder, not a hijack of the feed.
4. Money moments feel **fair and reversible only when the rules say so**.
5. Empty states feel like **Bob**, not a blank table.
6. Testers can **Report a problem** from any account; Official reads reports in admin.

---

## 7. Explicit non-goals for UI

- Designing odds, multipliers, loot boxes, or roulette.
- Public body metrics or before/after body comparison as a social feature.
- Desktop-first layouts.
- Long Bob speeches on payment error screens.
- Giant reserved empty regions under heroes “for a button later.”

---

## 8. Reference documents in this Project (upload these)

| File | Use for |
| --- | --- |
| `blOb_UIUX_Design_Brief.md` | This brief — primary design constraints |
| `blOb_ChatGPT_UIUX_System_Prompt.md` | Project instructions (also paste into Instructions) |
| `blOb_Official_Lore_and_Voice_Guide.docx` | Bob, Barb, voice, selfie rules, anti-cliché |
| `blOb_Bob_Daily_Post_Engine.md` | Daily Bob social posts (not product chrome) |
| `blOb_Bob_Notification_Copy.md` | Tone variants for in-app encouragement |
| `blOb_Counsel_Brief_Skill_and_Geo.md` | Skill tournament framing; geo sensitivity |
| `blOb_Legal_Compliance_Notes.md` | Trust/legal boundaries |
| `__blOb MVP Status Report__.docx` | What was fragile vs working (context only) |

Optional: Privacy Policy / ToS if designing legal accept overlays.

---

## 9. Example design requests you should answer well

- Redesign the challenge hero + floating Join/Check-in bar.
- Empty state for challenge feed with Bob.
- Join confirmation sheet (plain money language + one proof sentence).
- Board (Remaining / Caught Up / Dropped) with small i popovers.
- Composer layout for Home vs challenge.
- Onboarding tour tooltips (near the real control, not a centered essay).
- Admin pulse layout (Official only) — dense, not marketing.

---

## 10. Success test for any mock

Ask:

1. Would a tired person on a phone know the next tap in 2 seconds?  
2. Does money language match tournament rules (entry / prize / no dark pattern)?  
3. Is Bob present only where warmth helps?  
4. Does it feel like Instagram-class social chrome, not a spreadsheet?  
5. Does it violate any lock in §5?

If any answer fails, revise before presenting.
