# blOb Legal & Compliance Notes
Last updated: 2026-08-17

## Core Product Framing (Locked Language)
- “Compete in anything you can dream up, as long as it is a contest of your own personal effort and skill.”
- Outcomes determined predominantly by the relative skill, knowledge, judgment, strength, speed, endurance or quality of the actual participants’ own personal efforts.
- Any gambling, pure chance, risk-based activity, or contest lacking meaningful personal involvement/skill is strictly prohibited.
- Violators risk immediate account suspension or permanent deletion, forfeiture of balances where permitted by law, and reporting as appropriate.
- Creators are primarily responsible for ensuring their Challenges meet the skill standard; platform may remove/void non-compliant Challenges.

## Jurisdiction & Availability Controls
- Different user capabilities / available Challenge options on a jurisdictional basis is feasible and recommended.
- Hard server-side check on join/create + geo-filter on discovery.
- Friendly error example: “Sorry, this Challenge isn’t available in your State.” (or “in your location”).
- Always offer alternatives (browse available Challenges, create free Challenge, etc.).
- Launch matrix required (counsel-owned). Start with high-risk U.S. state deny-list + “rest of world” defaults. Geo-fencing + “void where prohibited”.

## Location Data (Progressive, Low-Friction)
- Precise location (GPS) is **NOT** required for basic platform use (account, browse, free Challenges, social, messaging).
- Layered signals:
  1. IP-based coarse location (silent, always available).
  2. User-declared country/state (onboarding / profile).
  3. Precise GPS only just-in-time, when user attempts paid/restricted Challenge join or create, or higher KYC/withdrawal tiers.
- If precise location denied → fall back to IP + declared; still allow limited functionality.
- Clear “why” copy: “We check location so we can show you Challenges that are available and allowed where you are.”
- Privacy Policy must distinguish coarse vs precise and obtain consent for precise.

## Key Regulatory Risks Logged
- **Stripe**: Explicitly restricts/prohibits “Skill-based games with money prizes, whether classified as gambling or not by local law.” High-risk category. Legal opinion letter recommended for onboarding; contingency processors needed.
- **Skill vs Chance + Operator Statutes**: State-by-state (predominant-factor majority; material-element / any-chance stricter; some internet-gaming / pool-selling rules catch even skill contests). Player-funded prize pools higher risk than fixed/operator-funded. Mutual-stake issues in some states.
- **Money Transmitter**: Holding credits + facilitating prize settlement triggers MTL analysis in most U.S. states. Mitigate via careful Stripe Connect structure (facilitation vs custody), counsel review of fund flows, progressive KYC.
- **Tax**: Users solely responsible. Platform may collect W-9/W-8 and issue 1099-series (U.S.) or DAC7-style reporting (EU nexus). Disclose clearly; possible withholding.
- **Other**: Consumer protection (clear fees, no deceptive earnings claims), AML/transaction monitoring (prevent contests as money-mule vehicles), possible state contest registration/bonding for large prizes, health liability for physical Challenges, Section 230 limits when money involved, sanctions screening.

## Monetization Context (from prior)
- Progressive challenge creation (free users limited; paid tiers unlock scale/visibility/lower fees).
- Platform fee starting range 5-8%.
- Audience Share: portion of platform fee (20-40% by Creator tier) to eligible influencers.
- Min withdrawal $10-15; progressive KYC on payouts.

## Document Status
- First-iteration drafts of Terms of Service / User Agreement and Privacy Policy created in artifacts/ (2026-08-17).
- Strong skill language, progressive location, jurisdiction controls, transparent fees, tax responsibility, arbitration/class-waiver (U.S.), multi-jurisdiction privacy rights.
- **These are drafts only.** Must be reviewed and customized by qualified counsel before any use. Placeholders for legal entity name, address, governing law state, contact emails, exact fee schedule, and jurisdiction matrix.

## Next Actions
1. Counsel review of drafts + state launch matrix + fund-flow / MTL analysis + Stripe opinion letter.
2. Implement jurisdiction config + server checks + friendly error UI.
3. Progressive location permission flows (just-in-time).
4. Versioned acceptance of ToS in Supabase + in-app legal center.
