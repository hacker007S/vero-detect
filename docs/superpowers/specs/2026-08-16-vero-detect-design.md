# VeRO Detect — Design Spec

**Date:** 16 August 2026
**Status:** Approved design, pending final user review
**Owner:** Zahoor Khan

## 1. What it is

A free Chrome extension for dropshippers (Zahoor's team/members). When a member opens a product page on **AliExpress**, **eBay UK**, or **Amazon**, the extension reads the listing (title, brand, description, price, images, dimensions) and shows an instant verdict on whether the item is safe to list on eBay:

- 🟢 **CLEAR** — no known flags (never phrased as "guaranteed safe")
- 🟡 **CAUTION** — listable with conditions (safe wording, size cost, breakage risk…)
- 🔴 **DO NOT LIST** — VeRO brand, prohibited item, or blacklisted category

Each verdict expands to show every rule that fired, in plain language a **new member** can follow, with links to the exact eBay UK policy.

## 2. Goals and non-goals

**Goals (V1):**
- Automate the Protocol v5 **G6 safety gate** plus the size/fragility/sensitivity checks.
- Zero running cost: no server, no paid APIs required, free for all members.
- Rules stay fresh without reinstalling the extension.

**Non-goals (V1):**
- Price/demand gates (G1–G5) — V2.
- Chrome Web Store publication — distributed as a shared ZIP, loaded unpacked.
- Guaranteeing safety — the tool reduces risk; it cannot see unlisted VeRO enforcers or future policy changes, and the UI must say so.

## 3. Architecture

Manifest V3 extension, TypeScript, built with Vite. No backend server.

```
content scripts (per-site adapters)  →  normalized Listing object
        ↓
rules engine (pure functions)        →  Verdict (6 category results)
        ↓
injected verdict panel (on-page UI)
        ↕
service worker: rules refresh (VeRO scrape + curated pack fetch),
               optional AI deep check, check history
```

| Component | Responsibility |
|---|---|
| `adapters/aliexpress.ts`, `adapters/ebay.ts`, `adapters/amazon.ts` | Extract title, brand, description, price, images, dimensions/weight, material from the product page DOM. Output a common `Listing` object. |
| `engine/` | Pure, DOM-free rule evaluation. `evaluate(listing, rulesPack) → Verdict`. Fully unit-testable. |
| `panel/` | Floating badge + expandable panel injected on the product page. |
| `worker/` | chrome.alarms-driven rules refresh, BYO-key AI calls, history storage. |
| `options page` | AI key entry, rules-pack status/force-refresh, history export. |

### Listing object

```ts
interface Listing {
  site: 'aliexpress' | 'ebay' | 'amazon';
  url: string;
  title: string;
  brand?: string;          // structured brand field if the site exposes one
  description?: string;    // may be partial
  priceGBP?: number;
  images: string[];        // URLs
  dimensionsCm?: { l?: number; w?: number; h?: number };
  weightG?: number;
  material?: string;       // from specs table if present
  missing: string[];       // fields the adapter could not extract
}
```

Adapters **fail soft**: any field they can't read goes in `missing`, and the panel reports "partial check" for the affected categories instead of a false 🟢.

## 4. Rules data — sources and refresh

Three layers, merged in the extension at load time. All cached in `chrome.storage.local` with a bundled fallback copy so the extension works offline and on first run.

| Layer | Source | Refresh |
|---|---|---|
| **Official VeRO list** (~1,141 brands, seed extracted 16 Aug 2026 → `data/vero-brands-seed.json`) | Scraped **live by the extension itself** from https://www.ebay.co.uk/sellercentre/protection/verified-rights-owner-profiles — static HTML, one PDF link per participant, parseable with a regex. Host permission: `*.ebay.co.uk`. | Weekly `chrome.alarms` job; manual "refresh now" in options. |
| **Curated pack** (JSON) | Hosted at a free GitHub raw URL that Zahoor controls. Contains: (a) **VeRO additions** — enforcing brands with no public profile (verified: Apple, LEGO, Disney, Gucci, Makita are absent from the official page yet are known enforcers); (b) brand **aliases** ("LV" → Louis Vuitton, "iPhone"/"MagSafe" → Apple); (c) confirmed-safe notes (Sage/Breville confirmed NOT a participant); (d) Protocol v5 category blacklists; (e) keyword packs for the policy/sensitivity/fragility categories below. | Daily fetch with ETag; bundled fallback. |
| **Local overrides** | Member's own additions via options page. | Immediate. |

Every rules layer carries a `version` and `fetchedAt`; the panel footer shows rules age ("VeRO list: 2 days old").

## 5. Detection engine — six categories

Overall verdict = worst category, but all six rows are always shown so members learn the reasoning.

### C1 — VeRO brand (🔴 / 🟡)
1. Normalize title + brand field + first 1,000 chars of description (lowercase, strip punctuation).
2. Match against merged VeRO list: exact token match, alias match, then fuzzy match (Damerau-Levenshtein ≤ 2 on words ≥ 5 chars — catches "Dysson", "N1ke").
3. **Compatible-wording nuance** (from Protocol v5 G6): if the brand appears only in a `compatible with / for / fits + brand` pattern → 🟡, and the panel shows the safe-listing rules verbatim: *use "compatible with"/"for"/"fits", own photos, no manufacturer logo, never imply genuine.* Any other brand appearance → 🔴 with the brand name and its profile PDF link.

### C2 — Prohibited / restricted item (🔴 / 🟡)
Keyword/regex classes derived from the full eBay UK policy index (66 policies, extracted 16 Aug 2026). Classes are grouped by severity:

**Hard-🔴 for a dropshipper** (either banned outright, or UK-import-banned which kills dropshipping even where domestic sale is legal):
- Knives & bladed items (policy 5047 — bladed products **cannot be imported into the UK after sale**; auto-🔴 regardless of legality)
- Weapons (5050): brass knuckles, nunchaku, throwing stars, blow guns, pepper spray, stun guns/tasers, swords, crossbows, batons
- Firearms & accessories (4277), airsoft/air rifles/BB guns (5045), replica/toy/prop firearms (5049)
- Drugs & paraphernalia (4333), prescription/OTC drugs (5048), pill press (5463)
- Hazardous materials (4335): batteries loose/li-ion packs, chemicals, flammables, magnets over limits
- Tobacco & e-cigarettes (4273), alcohol (4274)
- Lockpicking devices (4329), emissions defeat devices (5383), laser pointers >1mW (electronic equipment 4302)
- Live animals (4327), animal products (5046), animal traps (5040)
- Counterfeits/replicas of any kind (4276) — trigger words: "replica", "AAA quality", "1:1", "inspired by"
- Military/police items (4342/4319), government items (4318), embargoed goods (4323), offensive materials (4324), adult prohibited (5055)

**🟡 restricted — listable only with conditions** (panel explains the condition):
- Cosmetics & perfume (4290/4708) — must be new/sealed; hygiene rules
- Food (4295) — dates, hygiene, no dropship from CN realistically
- Medical devices (4322) — most consumer items restricted; CE/UKCA
- Product safety / UKCA-CE (4300) — toys, electricals, chargers, cot/safety gear
- Electronic equipment (4302) — signal jammers 🔴, streaming boxes, radar detectors
- Plants & seeds (4287) — import restrictions
- Used clothing (4281), jewellery (4280), event tickets (4309), vouchers (4292), vehicle parts (4293 — safety-critical parts)
- Adult restricted (4278), protecting minors (5057)

Each class = keyword list + optional regex + policy URL + a one-line "what a new member should do" string.

### C3 — Branded item, non-VeRO (🟡)
Any recognized brand (from a general top-brands list in the curated pack) that is *not* on the VeRO list → 🟡: "Branded item. Even off-VeRO brands can file IP complaints, and sourcing genuine branded stock from AliExpress is usually impossible (`genuine-branded-only` failure mode). Prefer unbranded/model-coded alternatives."

### C4 — Size / weight (🟡 / 🔴)
From Protocol v5 economics:
- Fits **large letter** (≤ 35.3 × 25 × 2.5 cm, ≤ 750 g) → 🟢 note "large-letter — best postage economics".
- Over large letter → 🟡 "parcel rates apply; over £20 Simple Delivery adds £2.94–£3.38 to the buyer".
- Very large (any side > 60 cm or > 5 kg, or furniture/appliance keywords) → 🔴 for dropshipping.
- Dimensions missing → "size unknown — check manually" (never guess 🟢).

### C5 — Sensitive item (🟡 / 🔴)
Dropship-risk classes beyond eBay policy: skin-contact/health claims ("whitening", "slimming", "pain relief"), supplements/ingestibles, baby & child safety items, li-ion battery products, food-contact materials, heaters/electricals (UKCA + fire risk), seasonal-safety items (carbon monoxide alarms etc. → 🔴 without certification).

### C6 — Fragile / easy to break (🟡)
Material field + keywords: glass, ceramic, porcelain, mirror, crystal, "thin", chandelier, glassware. → 🟡 "High breakage risk in 6–13 day transit; expect returns and refund cost. Prefer unbreakable alternatives."

## 6. AI deep check (optional, BYO key)

- Off by default. A member may add their own Anthropic API key in options.
- Manual trigger ("Deep check" button), used when rules are inconclusive or to scan **images** for logos/brand marks (Protocol v5 checklist: "supplier images vetted for third-party brands before upload").
- Model: `claude-haiku-4-5-20251001`, structured JSON verdict (brand implied? logo visible? policy class?). Result is merged into the panel, labeled "AI check".
- AI failure → rules-only verdict stands, labeled lower-confidence. The free tool must never require a key.

## 7. Verdict panel UX

- Small floating badge (draggable, per-site position remembered) appears once the adapter has parsed the page; shows overall 🟢/🟡/🔴.
- Click → panel with six category rows, each 🟢/🟡/🔴/⚪ (⚪ = couldn't check, field missing), reason text, and policy link.
- **New-member guidance**: every 🟡/🔴 row includes a one-line "what to do" in plain English (e.g., "Remove the brand name from your title, or use 'compatible with Dyson' wording — never the logo").
- Footer: rules-pack age + disclaimer: "Checks known rules only. A green result is not a guarantee."

## 8. History & export

Each check stored locally (url, site, title, verdict, fired rules, timestamp). Options page exports CSV compatible with `hunt/pipeline.csv` (`failure_mode: vero` etc.). No data leaves the machine except the optional AI call.

## 9. Distribution & update model

- **Shared ZIP**, loaded unpacked (chrome://extensions → Developer mode). Include a one-page illustrated install guide (`INSTALL.md`) for non-technical members.
- Extension **code** updates = new ZIP shared to members.
- **Rules** update automatically (live VeRO scrape + curated pack fetch), so stale code still gives fresh verdicts — this is why the rules layer is separated from code.

## 10. Error handling

- Adapter can't find the product container (site redesign) → badge shows ⚠ "couldn't read this page" + link to report; never a silent absence.
- VeRO scrape fails (eBay layout change/block) → keep last cached list, surface age in footer; curated pack is the safety net.
- All engine rules are data-driven — a bad rule can be fixed in the curated pack without shipping code.

## 11. Testing

- **Adapter tests**: saved HTML fixtures per site (2–3 real product pages each), assert extracted `Listing` fields.
- **Engine tests**: known-answer table — Dyson filter → 🔴 C1; "for Sage BES008" → 🟡 C1 compatible-wording; kitchen knife → 🔴 C2; iPhone case with "MagSafe" in title → 🔴 C1 via alias; 3-tier microwave rack → 🟡 C4; glass teapot → 🟡 C6; unbranded strimmer spool → 🟢.
- **Scraper test**: parse the checked-in copy of the VeRO page HTML, assert ≥ 1,100 brands extracted.

## 12. V2 ideas (explicitly out of scope)

Price/demand gates (G1–G5: £3.40 rule, volume-price lookup, seller counts), eBay draft-listing page checks, Chrome Web Store publication, team-shared history.
