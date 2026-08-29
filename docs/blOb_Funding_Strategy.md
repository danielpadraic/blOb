# blOb Funding Strategy — Official Guaranteed Challenges

**Product:** blOb  
**Status:** Locked product + payments structure (29 August 2026)  
**Audience:** Founder, engineering, counsel, payment underwriting  
**Not a legal opinion.**

Locked skill line (do not paraphrase in Official rules):

> Compete in anything you can dream up, as long as it is a contest of your own personal effort and skill.

Chance, gambling, and any risk-based activity without personal skill or involvement are prohibited. Violators risk account deletion.

---

## 1. Purpose

This document is the source of truth for how Official guaranteed Challenges take money, when they start, how prizes and refunds move, how the Official ladder auto-posts, and how processors are split.

User-generated Coin challenges and corporate white-glove invoices are adjacent. They do not change these Official cash rules.

---

## 2. Rails (do not mix)

| Rail | What it is | Processor |
|---|---|---|
| **SaaS / invoice** | Creator subscriptions, Nike-style fulfillment invoices | Stripe (or Finix software MID). Never contest entry. |
| **Official / player cash** | Entry, wallet, prize, cash-out | Finix or skill-contest ISO (7994-class). Not Stripe. |
| **Coins** | In-app, not cash-out equivalent | Stay off contest MID as “cash prize.” |

Prefer **one processor (Finix) with two MIDs** over Stripe + Finix long term. Stripe is only a bridge for invoices if Finix software MID is delayed.

Contact Finix Sales: [finix.com/contact-us](https://finix.com/contact-us) · ask for gaming/skill desk · two MIDs (SaaS + contest).

---

## 3. Official guaranteed Challenge — definition

An Official is a skill / consistency tournament with:

- A **posted guarantee** ($10 weekly, $100 monthly, $1,000 monthly, $10,000+ sponsored)
- A **fixed entry fee**
- A **minimum field size N** such that:

```
N × entry_fee > guaranteed_prize
```

Production should use:

```
N × entry_fee ≥ prize + expected_processor_fees
```

- **No percentage platform fee taken from participant entry.**  
- blOb (when self-sponsored) earns when people **drop after start**.  
- Third-party sponsors pay **fulfillment as an invoice**, not a silent cut of the $10.

### Example min N

| Guarantee | Entry | Min N (entries > prize) |
|---|---|---|
| $10 weekly | $1 | 11+ (use 15 for buffer) |
| $100 monthly | $10 | 11+ (use 15) |
| $1,000 monthly | $10 | 101+ |
| $10,000 sponsored | $10 | 1,001+ (e.g. 1,200) |

---

## 4. Start clock (no mass refunds for “didn’t fill on Saturday”)

There is **no doomed calendar start**.

1. Challenge stays **Forming** until paid joins ≥ N.  
2. The instant N is hit, set:

```
starts_at = next 00:00 America/Chicago
```

3. Joins continue until that midnight.  
4. At midnight: roster **locks**. Challenge is **Live**.  
5. If N is never hit, it never starts. No mass refund of a failed date.

| N first hit | starts_at |
|---|---|
| Mon 3:12 PM CT | Tue 12:00 AM CT |
| Mon 11:50 PM CT | Tue 12:00 AM CT |
| Tue 12:01 AM CT | Wed 12:00 AM CT |

Show the user’s local time. Store CT.

---

## 5. Money movement

### Wallet is home

- Entry is paid from **wallet** (fund wallet from contest MID).  
- **Prize** credits **wallet**.  
- **Pre-start cancel** credits **wallet**.  
- **Cash-out** is a separate Wallet action: KYC required, **processing fee shown**, net to bank/card.  
- Header balance counts up on next open when new credits arrived.

Intent: keep funds in-app for the next Official. Fee must match real rails + modest margin — not a lock-in.

### Pre-start vs after start

| Event | Money |
|---|---|
| User cancels before `starts_at` | Full entry → wallet |
| User pulled forward from next Official (backfill) | Entry stays applied; they are now in the starting field |
| Miss / drop after start | No refund. Entry remains in the pot. |
| Completer | `max(entry, floor(prize_pool / completers))` → wallet |
| Zero completers | Posted forfeit: entries stay (no refund). Do not silently recycle without rules copy. |

### Completer floor

Finishers are never paid **less than their entry** when the math would shrink their share below entry.

```
payout_i = max(entry_fee, prize_pool / completer_count)
```

If the floor needs more cash than the residual pot, reduce **sponsor rebate** first. Do **not** invent a hidden platform %.

When **everyone** completes: everyone gets entry back. Self-sponsored Official nets ~$0 from the pot (plus processor cost). That is accepted for growth Officials.

---

## 6. Sponsor vs blOb-hosted

### Third-party sponsor (Nike model)

- Sponsor **posts the guarantee** (escrow or bind to overlay).  
- Entries may **buy down** sponsor cost (rebate).  
- **Max sponsor rebate = 100% of posted guarantee.** Sponsor may reach $0 prize cost. Sponsor does **not** take cash profit above that. Surplus after rebate cap **increases the prize**.  
- blOb is paid by **separate fulfillment invoice**, not 15% of entry.  
- Start still requires N × entry > guarantee (or signed overlay).

Join copy:

> **Nike $10,000 Guarantee**  
> $10 to enter · Starts the midnight after we reach 1,200 people.  
> Finishers split the prize (at least your $10 back if you complete).  
> Leave before start for a full wallet refund.

### blOb is the sponsor

- Same public rules.  
- “Rebate” stays in-house. Do not book a platform fee to yourself as revenue.  
- Real cash = entries in − completer payouts − processor fees (dropout residual).

---

## 7. Official ladder (auto-repost)

Tiers (separate queues):

- $10 **weekly** guarantee  
- $100 **monthly** guarantee  
- $1,000 **monthly** guarantee  
- Sponsored one-offs ($10,000+) — manual, not auto-ladder unless specified

**When Official A hits N** (start scheduled):

1. Official **B** of the **same tier** auto-posts immediately.  
2. Pre-start holes in **A** backfill **FIFO** from paid joiners on **B**.  
3. Moved user leaves **B**, is on **A**, gets a push: they are in the Official that starts next CT midnight.  
4. Join copy on B: joining may pull you into the Official ahead if someone leaves.

Do not mix weekly waitlist into a monthly field.

---

## 8. Proof uniqueness

| Allowed | Not allowed |
|---|---|
| One proof → one weekly **and** one monthly | One proof → two weeklies |
| User in many weeklies if each check-in is a **distinct** proof | One proof → two monthlies |

Submit UI: default-check at most **one weekly + one monthly** for this proof. Same workout id / photo hash / HealthKit sample cannot attach to two of the same tier.

---

## 9. Geo and eligibility (cash Officials)

Server is source of truth on create / join / cash-out.

**Wave-1 cash block (until counsel edits):**  
AZ, CT, DE, LA, ME, MI, MT, NV, SD, TN + PR

**Discuss first:** ID, TX, then other bona-fide-contest / predominance states.

Copy: *Sorry, this Challenge isn’t available in your State.*

- 18+ (or majority) for cash.  
- Precise GPS only just-in-time for paid/restricted actions.  
- Free social / Coins may use a wider map.

---

## 10. KYC

Know Your Customer = identity check before real-money movement off-platform.

- Social / free / Coins: not required.  
- Cash join: 18+ and geo; light KYC if the processor requires it.  
- **Cash-out:** KYC required. Progressive limits as volume grows. Tax reporting (1099) on the winner when required.

---

## 11. Implementation notes (for Cursor / schema)

Challenge fields (conceptual):

- `kind`: official_guarantee | user | corporate_private  
- `tier`: weekly_10 | monthly_100 | monthly_1000 | sponsored  
- `guarantee_cents`, `entry_cents`, `min_n`  
- `status`: forming | scheduled | live | settling | settled | cancelled  
- `starts_at` (null until N; then next CT midnight)  
- `sponsor_id` (blOb or org)  
- `next_official_id` / `previous_official_id` (ladder)  
- `allowed_regions[]`  
- `money_rail`: player_pool_wallet  

RPCs:

- `join_official` — geo, age, wallet debit, increment N, maybe schedule start + spawn next  
- `leave_official_prestart` — refund wallet or trigger backfill  
- `backfill_from_next` — FIFO  
- `lock_and_start` — midnight job America/Chicago  
- `settle_official` — completer floor, wallet credits  
- `submit_proof` — unique per tier  

Wallet ledger: append-only entries (`entry`, `refund`, `prize`, `cashout`, `cashout_fee`).

---

## 12. ToS / Official Rules (substance for counsel)

- Skill / personal effort only; locked sentence.  
- Two money types: prize (guarantee + residual entries) vs fulfillment invoice to sponsors.  
- No chance formats.  
- 18+, permitted state, void where prohibited.  
- Start = next CT midnight after min N.  
- Pre-start cancel = wallet refund. After start = no refund on miss.  
- Completer floor = at least entry.  
- Wallet then cash-out fees.  
- Taxes on winner.  
- Geo and processor holds allowed.

---

## 13. What this is not

- Not Stripe contest processing.  
- Not a 15% rake on entry.  
- Not a 115% sponsor rebate (sponsor does not profit above 100% of posted guarantee).  
- Not a fixed Saturday start that refunds a whole field.  
- Not call-outs / 1:1 stakes (still off until separately opined).

---

*Locked 29 August 2026. Change only by explicit product decision.*
