# blOb — Counsel Brief (Skill Contests & Launch Geo)
**Confidential · For legal counsel only · Not legal advice**  
**Date:** 22 August 2026 · **Product:** blOb (skill-based peer challenges + social)

---

### 1. What we are building
blOb is a mobile/web platform where users create or join **contests of personal effort and skill** (fitness, practice, work habits, creative tasks, etc.). Locked product language:

> “Compete in anything you can dream up, as long as it is a contest of your own personal effort and skill.”

**Strictly prohibited:** gambling, pure chance, or any risk-based activity with no personal skill/involvement. Violators risk account deletion. Outcome must turn on the participant’s own performance and proof—not RNG, cards, or third-party sports results.

### 2. Mechanics counsel must opine on

| Layer | How it works |
|---|---|
| **Coins** | In-app currency. Users may pay a **buy-in**; pot is **evenly split among remaining completers** (consistency format: required check-ins; miss → dropped). Min 2 participants. Underfilled at start → cancel + refund. Zero remaining at end → **no payout / no refund** (forfeit). |
| **Bucks** | Real-money path. **Host-funded prize only**—no participant Bucks buy-in on the default path. Prize amount set by host; participants compete for a **predetermined** purse. |
| **Official challenges** | Platform- or sponsor-hosted; fixed/guaranteed prize; skill rules; intended to start only when economics clear. |
| **Private / invite** | Self-funded or host-funded; invitation-only. |
| **Proof** | Named required proofs per check-in (e.g. pre-selfie, post-selfie, HR). Auto-accept with anonymous peer flags. |
| **Call-outs** | Optional 1:1 stake product (real money language exists in product). Treat as **higher scrutiny**; may stay off first paid footprint. |

**Design intent that supports skill framing:** personal effort, documented proof, no chance mechanic, creator may participate, live leaderboard of remaining vs dropped.

### 3. Payments / custody (for fintech + skill opinion)
- Card → Coins via processor (Stripe intended); Coins held in-app.
- Bucks / real settlement: host funds prize; Connect-style marketplace preferred so platform is not custodial bank of player pools where avoidable.
- Progressive KYC / payout limits planned.
- **Ask:** money-transmitter exposure of Coins wallet + host-funded Bucks; whether player-pooled Coin pots require different treatment than host-funded purses.

### 4. Geo-fencing plan (engineering already scoped)
- Coarse IP (silent) + declared location + **precise GPS only just-in-time** for paid/restricted actions.
- Hard server check on **create/join** for paid real-money features.
- User-facing error: *“Sorry, this Challenge isn’t available in your State.”*
- Free / social / Coin-only may use a wider map than Bucks/official cash—subject to opinion.

### 5. Research-informed launch posture (for counsel to confirm or reject)
*Secondary sources (operator block lists, practitioner write-ups, statutes)—not a substitute for a formal matrix.*

**Often blocked or high-friction for real-money skill apps (treat as Wave-1 exclude until opinion clears):**  
AZ, CT, DE, LA, ME, MI, MT, NV, SD, TN (and frequently AR, IN, IA, SC depending on model).

**Structurally helpful patterns to test first:**
- States with **express “bona fide contest of skill / speed / strength / endurance”** carve-outs (Idaho statute is one example: awards only to entrants).
- **Predominance-of-skill** states vs **material-element / any-chance** states (latter are harder).
- **Host-funded / predetermined purse** is repeatedly described as stronger than **player-staked pools** in secondary literature; our **Bucks = host-funded** path is intentional for that reason.
- **Player-pooled Coin buy-ins** (even-split among completers) need explicit classification—some states recharacterize mutual stakes as wagering even when skill dominates.

**Practical first footprint to discuss with counsel:**  
(1) **Idaho** (formation / statutory skill-contest language) + **Texas** (founder market; bona fide contest language in bet definition; pure-skill entry-fee support in AG materials—still verify online operator risk).  
(2) Expand only into states counsel marks **green** for (a) host-funded Bucks and (b) Coin pools separately.  
(3) Keep **chance, DFS-style, and casino-like** formats out of scope forever.

### 6. Specific asks of counsel
1. **Skill opinion letter** suitable for payment-processor underwriting: product is a contest of skill/personal effort, not gambling, under UIGEA + listed states.  
2. **State matrix (green / yellow / red)** for: (A) host-funded Bucks, (B) Coin buy-in pools, (C) free/social only.  
3. Whether **call-outs (1:1 stakes)** must stay geo-off or restructured.  
4. Draft or mark-up of **Contest Rules + ToS skill ban** for processor packet.  
5. Money-transmitter / custody notes for Coins + Stripe Connect.  
6. Recommended **Wave-1 state list** and any registration/bonding triggers.

### 7. Materials we can provide immediately
- Locked skill framing + ToS/Privacy drafts  
- Challenge create defaults (consistency, misses=0, min 2, auto proof, host-funded Bucks)  
- Prize / refund / forfeit rules  
- Geo technical design (IP + declare + GPS JIT)  
- Monetization / fee outline  

**Contact for facts:** Daniel Harder · product owner · blOb  

---
*This brief is a factual product summary for counsel. It is not a legal opinion and does not assert that any state is “cleared.”*
