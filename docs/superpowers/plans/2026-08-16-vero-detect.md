# VeRO Detect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chrome MV3 extension that checks AliExpress/eBay UK/Amazon product pages against eBay VeRO + UK restricted-item rules and shows a polished on-page verdict panel.

**Architecture:** Content script per site extracts a normalized `Listing`; a pure data-driven rules engine evaluates 6 categories; a Shadow-DOM panel renders the verdict. A service worker refreshes rules (live scrape of eBay's VeRO page + optional curated pack from a GitHub raw URL) and handles BYO-key AI deep checks. No server.

**Tech Stack:** TypeScript (strict), esbuild (single `build.mjs` — replaces the spec's "Vite" mention; same TS toolchain, zero MV3 plugin friction), Vitest + jsdom for tests, no runtime dependencies.

## Global Constraints

- Project root: `/Users/zahoorkhan/Documents/vero-detect` (git repo already initialized; spec + `data/vero-brands-seed.json` committed).
- TypeScript `strict: true`. No runtime npm dependencies — devDependencies only.
- A green result is ALWAYS phrased "No known flags" — never "safe" or "guaranteed".
- Large-letter limits: **35.3 × 25 × 2.5 cm, 750 g**. Simple Delivery price threshold: **£20** (adds £2.94–£3.38). Huge-item cutoffs: any side > 60 cm or > 5000 g → danger.
- AI model: `claude-haiku-4-5-20251001`, direct from worker with header `anthropic-dangerous-direct-browser-access: true`. AI is optional; the extension must fully work with no key.
- Sage/Breville = confirmed NOT VeRO (never a C1 danger). Apple, LEGO, Disney, Gucci, Makita, Nintendo, Rolex = enforcers missing from the official page (curated additions).
- Distribution: unpacked ZIP of `dist/`. No Chrome Web Store.
- Commit after every task with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Verdict levels everywhere: `'clear' | 'caution' | 'danger' | 'unknown'`; severity order `danger > caution > unknown > clear` (missing data can never produce an overall clear).

## File Structure

```
public/manifest.json
build.mjs
src/types.ts
src/engine/normalize.ts      # normalize, tokens, containsPhrase, brandMatchTerm
src/engine/fuzzy.ts          # editDistance (Damerau-Levenshtein), fuzzyIncludes
src/engine/vero.ts           # C1
src/engine/classes.ts        # keyword-class matcher → C2 prohibited, C5 sensitive, C6 fragile
src/engine/branded.ts        # C3
src/engine/size.ts           # C4
src/engine/evaluate.ts       # orchestrator → Verdict
src/rules/veroScraper.ts     # parse eBay VeRO page HTML
src/rules/bundled/curated-pack.json
src/rules/bundled/index.ts   # bundledPack(): RulesPack (imports seed + curated JSON)
src/rules/merge.ts           # mergeRules(bundled, official?, curated?, local?)
src/adapters/shared.ts       # parseDimensionsCm, parseWeightG, meta fallbacks
src/adapters/ebay.ts / aliexpress.ts / amazon.ts / index.ts
src/worker/index.ts          # alarms, storage, messages, history
src/worker/ai.ts             # deepCheck()
src/content/main.ts          # orchestrates adapter → engine → panel; SPA nav watcher
src/panel/panel.ts           # Shadow DOM verdict UI ("ultra" polish)
src/options/options.html/.ts # settings, rules status, history, CSV export
tests/…                      # mirrors src; fixtures in tests/fixtures/
scripts/package.sh
INSTALL.md
```

---

### Task 1: Scaffold + build pipeline

**Files:**
- Create: `package.json`, `tsconfig.json`, `build.mjs`, `public/manifest.json`, `.gitignore`, `src/content/main.ts`, `src/worker/index.ts`, `src/options/options.ts`, `src/options/options.html` (all stubs)

**Interfaces:**
- Produces: `npm run build` → `dist/{content.js,worker.js,options.js,options.html,manifest.json}`; `npm test` runs Vitest.

- [ ] **Step 1: Write configs and stubs**

`package.json`:
```json
{
  "name": "vero-detect",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.mjs",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.268",
    "esbuild": "^0.23.0",
    "jsdom": "^24.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["chrome"],
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

`build.mjs`:
```js
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');

const common = { bundle: true, target: 'chrome110', logLevel: 'info' };
await build({ ...common, entryPoints: ['src/content/main.ts'], outfile: 'dist/content.js', format: 'iife' });
await build({ ...common, entryPoints: ['src/worker/index.ts'], outfile: 'dist/worker.js', format: 'esm' });
await build({ ...common, entryPoints: ['src/options/options.ts'], outfile: 'dist/options.js', format: 'iife' });
cpSync('public/manifest.json', 'dist/manifest.json');
cpSync('src/options/options.html', 'dist/options.html');
console.log('✔ dist/ built');
```

`public/manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "VeRO Detect",
  "version": "1.0.0",
  "description": "Checks AliExpress, eBay and Amazon products against eBay VeRO and UK restricted-item rules before you list them.",
  "permissions": ["storage", "alarms"],
  "host_permissions": [
    "https://*.ebay.co.uk/*",
    "https://raw.githubusercontent.com/*",
    "https://api.anthropic.com/*"
  ],
  "background": { "service_worker": "worker.js", "type": "module" },
  "content_scripts": [
    {
      "matches": [
        "https://www.ebay.co.uk/itm/*",
        "https://www.ebay.com/itm/*",
        "https://*.aliexpress.com/item/*",
        "https://*.aliexpress.us/item/*",
        "https://www.amazon.co.uk/*",
        "https://www.amazon.com/*"
      ],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "options_page": "options.html"
}
```

`.gitignore`:
```
node_modules/
dist/
*.zip
```

Stubs — `src/content/main.ts`: `console.log('VeRO Detect content loaded');` · `src/worker/index.ts`: `console.log('VeRO Detect worker loaded');` · `src/options/options.ts`: `document.title = 'VeRO Detect settings';` · `src/options/options.html`:
```html
<!doctype html><html><head><meta charset="utf-8"><title>VeRO Detect</title></head>
<body><div id="app"></div><script src="options.js"></script></body></html>
```

- [ ] **Step 2: Install and build**

Run: `cd /Users/zahoorkhan/Documents/vero-detect && npm install && npm run build && ls dist`
Expected: `content.js manifest.json options.html options.js worker.js`

- [ ] **Step 3: Verify vitest runs (no tests yet)**

Run: `npx vitest run --passWithNoTests`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: scaffold MV3 extension with esbuild pipeline"
```

---

### Task 2: Core types + text utilities

**Files:**
- Create: `src/types.ts`, `src/engine/normalize.ts`, `src/engine/fuzzy.ts`
- Test: `tests/engine/normalize.test.ts`, `tests/engine/fuzzy.test.ts`

**Interfaces:**
- Produces (used by every later task):

```ts
// src/types.ts — the complete file
export type Site = 'aliexpress' | 'ebay' | 'amazon';
export type Level = 'clear' | 'caution' | 'danger' | 'unknown';
export type CategoryId = 'vero' | 'prohibited' | 'branded' | 'size' | 'sensitive' | 'fragile';

export interface Listing {
  site: Site;
  url: string;
  title: string;
  brand?: string;
  description?: string;
  priceGBP?: number;
  images: string[];
  dimensionsCm?: { l?: number; w?: number; h?: number };
  weightG?: number;
  material?: string;
  missing: string[];
}

export interface RuleHit {
  ruleId: string;
  level: 'caution' | 'danger';
  label: string;
  detail: string;
  action?: string;   // plain-English "what to do" for new members
  link?: string;     // eBay policy URL or VeRO profile PDF
}

export interface CategoryResult {
  category: CategoryId;
  level: Level;
  hits: RuleHit[];
  note?: string;     // e.g. "size unknown — check manually"
}

export interface Verdict {
  overall: Level;
  categories: CategoryResult[];
  rulesVersion: string;
  rulesFetchedAt: number;
  checkedAt: number;
}

export interface VeroBrand {
  name: string;
  profile?: string;
  source: 'official' | 'curated' | 'local';
  confirmedSafe?: boolean;
}

export interface KeywordClass {
  id: string;
  category: 'prohibited' | 'sensitive' | 'fragile';
  level: 'caution' | 'danger';
  label: string;
  keywords: string[];
  patterns?: string[];
  policyUrl?: string;
  action: string;
}

export interface SizeRules {
  largeLetter: { l: number; w: number; h: number; weightG: number };
  simpleDeliveryPriceGBP: number;
  hugeSideCm: number;
  hugeWeightG: number;
}

export interface RulesPack {
  version: string;
  fetchedAt: number;
  veroBrands: VeroBrand[];
  aliases: Record<string, string>; // normalized alias phrase -> canonical brand name
  topBrands: string[];
  classes: KeywordClass[];
  size: SizeRules;
}

export const LEVEL_RANK: Record<Level, number> = { danger: 3, caution: 2, unknown: 1, clear: 0 };
export function worst(levels: Level[]): Level {
  return levels.reduce<Level>((a, b) => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a), 'clear');
}
```

```ts
// src/engine/normalize.ts — exact signatures
export function normalize(text: string): string;
export function tokens(text: string): string[];
export function containsPhrase(textTokens: string[], phrase: string): boolean;
export function brandMatchTerm(name: string): string; // '' = unmatchable
```

```ts
// src/engine/fuzzy.ts
export function editDistance(a: string, b: string): number; // Damerau-Levenshtein
export function fuzzyIncludes(textTokens: string[], term: string): boolean;
```

- [ ] **Step 1: Write failing tests**

`tests/engine/normalize.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { normalize, tokens, containsPhrase, brandMatchTerm } from '../../src/engine/normalize';

describe('normalize', () => {
  it('lowercases, strips punctuation/accents, collapses spaces', () => {
    expect(normalize('  DYSON — V8™ (Animal+) ')).toBe('dyson v8 animal');
    expect(normalize('Café Nestlé')).toBe('cafe nestle');
  });
});

describe('containsPhrase', () => {
  const t = tokens('genuine louis vuitton wallet brand new');
  it('matches consecutive tokens', () => {
    expect(containsPhrase(t, 'louis vuitton')).toBe(true);
    expect(containsPhrase(t, 'vuitton wallet')).toBe(true);
  });
  it('rejects non-consecutive and absent phrases', () => {
    expect(containsPhrase(t, 'louis wallet')).toBe(false);
    expect(containsPhrase(t, 'gucci')).toBe(false);
  });
});

describe('brandMatchTerm', () => {
  it('strips company suffixes', () => {
    expect(brandMatchTerm('3M Company')).toBe('3m');
    expect(brandMatchTerm('Alessi S.p.A.')).toBe('alessi');
    expect(brandMatchTerm('Zen Design Group Ltd')).toBe('zen design');
  });
  it('returns empty for unmatchably generic terms', () => {
    expect(brandMatchTerm('The One Company')).toBe('');
    expect(brandMatchTerm('It')).toBe('');
  });
});
```

`tests/engine/fuzzy.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { editDistance, fuzzyIncludes } from '../../src/engine/fuzzy';
import { tokens } from '../../src/engine/normalize';

describe('editDistance', () => {
  it('counts substitution, insertion, transposition', () => {
    expect(editDistance('dyson', 'dysson')).toBe(1);
    expect(editDistance('nike', 'nkie')).toBe(1); // transposition
    expect(editDistance('dyson', 'dyson')).toBe(0);
    expect(editDistance('abc', 'xyz')).toBe(3);
  });
});

describe('fuzzyIncludes', () => {
  it('catches near-miss brand spellings', () => {
    expect(fuzzyIncludes(tokens('new dysson vacuum filter'), 'dyson')).toBe(true);
  });
  it('never fuzzy-matches short or multi-word terms', () => {
    expect(fuzzyIncludes(tokens('nkie trainers'), 'nike')).toBe(false); // len 4 < 5
    expect(fuzzyIncludes(tokens('louis vuittonn bag'), 'louis vuitton')).toBe(false);
  });
  it('does not fire on unrelated words', () => {
    expect(fuzzyIncludes(tokens('kitchen season spoon'), 'dyson')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL**

Run: `npx vitest run tests/engine`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/engine/normalize.ts`:
```ts
const SUFFIXES = new Set([
  'inc', 'ltd', 'llc', 'gmbh', 'co', 'company', 'corp', 'corporation', 'spa',
  'plc', 'limited', 'group', 'holdings', 'international', 'intl', 'sa', 'ag',
  'bv', 'srl', 'kg', 'uk', 'usa', 'brands', 'industries', 'enterprises',
]);
const GENERIC = new Set([
  'the', 'a', 'an', 'it', 'one', 'all', 'pro', 'plus', 'home', 'life', 'best',
  'new', 'you', 'my', 'top', 'first', 'and', 'of', 'for',
]);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(text: string): string[] {
  const n = normalize(text);
  return n ? n.split(' ') : [];
}

export function containsPhrase(textTokens: string[], phrase: string): boolean {
  const p = phrase.split(' ');
  if (p.length === 0 || p[0] === '') return false;
  outer: for (let i = 0; i <= textTokens.length - p.length; i++) {
    for (let j = 0; j < p.length; j++) {
      if (textTokens[i + j] !== p[j]) continue outer;
    }
    return true;
  }
  return false;
}

export function brandMatchTerm(name: string): string {
  const words = tokens(name).filter((w) => !GENERIC.has(w));
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop();
  const term = words.join(' ');
  if (term.length < 3) return '';
  if (words.length === 1 && GENERIC.has(words[0])) return '';
  return term;
}
```

`src/engine/fuzzy.ts`:
```ts
export function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

export function fuzzyIncludes(textTokens: string[], term: string): boolean {
  if (term.includes(' ') || term.length < 5) return false;
  const max = term.length >= 8 ? 2 : 1;
  return textTokens.some(
    (t) =>
      t.length >= 5 &&
      Math.abs(t.length - term.length) <= max &&
      t !== term &&
      editDistance(t, term) <= max,
  );
}
```

Create `src/types.ts` exactly as shown in Interfaces above.

- [ ] **Step 4: Run tests + typecheck, verify PASS**

Run: `npx vitest run tests/engine && npm run typecheck`
Expected: all PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: core types and text-matching utilities"
```

---

### Task 3: Bundled rules data

**Files:**
- Create: `src/rules/bundled/curated-pack.json`, `src/rules/bundled/index.ts`
- Test: `tests/rules/bundled.test.ts`

**Interfaces:**
- Consumes: `data/vero-brands-seed.json` (committed; array of `{name, profile}` ×1,141), types from Task 2.
- Produces: `bundledPack(): RulesPack` — merged bundled rules (official seed + curated additions + classes + size).

- [ ] **Step 1: Write failing test**

`tests/rules/bundled.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { bundledPack } from '../../src/rules/bundled/index';

describe('bundledPack', () => {
  const pack = bundledPack();
  it('contains the official seed plus curated additions', () => {
    expect(pack.veroBrands.length).toBeGreaterThan(1100);
    const names = pack.veroBrands.map((b) => b.name.toLowerCase());
    expect(names).toContain('dyson limited');       // official
    expect(names).toContain('apple');               // curated addition
    expect(names).toContain('lego');
  });
  it('marks Sage/Breville confirmedSafe', () => {
    const sage = pack.veroBrands.find((b) => b.name.toLowerCase() === 'sage');
    expect(sage?.confirmedSafe).toBe(true);
  });
  it('has aliases, top brands, classes and size rules', () => {
    expect(pack.aliases['iphone']).toBe('Apple');
    expect(pack.topBrands.length).toBeGreaterThan(30);
    expect(pack.classes.some((c) => c.id === 'knives')).toBe(true);
    expect(pack.size.largeLetter).toEqual({ l: 35.3, w: 25, h: 2.5, weightG: 750 });
  });
  it('does not duplicate brands present in both seed and curated list', () => {
    const chanel = pack.veroBrands.filter((b) => b.name.toLowerCase().startsWith('chanel'));
    expect(chanel.length).toBe(1);
  });
});
```

Note: verify the exact official name for Dyson first — run `python3 -c "import json;print([b['name'] for b in json.load(open('data/vero-brands-seed.json')) if 'yson' in b['name']])"` and use that exact string in the test.

- [ ] **Step 2: Run test, verify FAIL**

Run: `npx vitest run tests/rules`
Expected: FAIL — module not found.

- [ ] **Step 3: Write curated-pack.json**

`src/rules/bundled/curated-pack.json` (complete file):
```json
{
  "version": "2026-08-16.1",
  "veroAdditions": [
    "Apple", "LEGO", "Disney", "Gucci", "Makita", "Nintendo", "Rolex",
    "Pandora", "Ray-Ban", "Cartier", "Tiffany", "Louis Vuitton", "Hermes",
    "Burberry", "Prada", "Michael Kors", "Swarovski", "GoPro", "Beats",
    "Marvel", "Pokemon", "Hello Kitty", "Harry Potter", "Star Wars"
  ],
  "confirmedSafe": ["Sage", "Breville"],
  "aliases": {
    "iphone": "Apple", "ipad": "Apple", "macbook": "Apple", "airpods": "Apple",
    "magsafe": "Apple", "apple watch": "Apple", "imac": "Apple", "airtag": "Apple",
    "lv": "Louis Vuitton", "playstation": "Sony", "ps5": "Sony", "ps4": "Sony",
    "dualsense": "Sony", "xbox": "Microsoft", "air jordan": "Nike", "jordan": "Nike",
    "air max": "Nike", "yeezy": "Adidas", "minifigure": "LEGO", "mickey mouse": "Disney",
    "frozen elsa": "Disney", "pikachu": "Pokemon", "airwrap": "Dyson", "supersonic": "Dyson"
  },
  "topBrands": [
    "Samsung", "LG", "Philips", "Ninja", "Tefal", "DeLonghi", "Russell Hobbs",
    "Bosch", "Karcher", "Xiaomi", "Anker", "JBL", "Logitech", "Braun", "Oral-B",
    "Gillette", "Shark", "Tower", "Swan", "Morphy Richards", "Kenwood", "Vax",
    "Hoover", "Beko", "Hotpoint", "Indesit", "Zanussi", "Miele", "Panasonic",
    "Toshiba", "Canon", "Nikon", "Fitbit", "Garmin", "TP-Link", "Ring", "Nest",
    "Nespresso", "Dolce Gusto", "Tassimo", "Krups", "Melitta", "Lavazza",
    "Weber", "Stanley", "DeWalt", "Ryobi", "Black and Decker", "Worx", "Einhell"
  ],
  "classes": [
    { "id": "knives", "category": "prohibited", "level": "danger",
      "label": "Knives / bladed items",
      "keywords": ["knife", "knives", "blade", "machete", "dagger", "sword", "katana", "bayonet", "cleaver", "stanley knife", "craft knife", "box cutter", "pocket knife", "folding knife", "flick knife", "butterfly knife", "throwing knife", "multi tool knife", "axe", "hatchet", "scalpel"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/knives-policy?id=5047",
      "action": "Do not dropship. Bladed products cannot be imported into the UK after sale — stock must already be in the UK and needs age-verified delivery." },
    { "id": "weapons", "category": "prohibited", "level": "danger",
      "label": "Weapons",
      "keywords": ["brass knuckles", "knuckle duster", "nunchaku", "nunchucks", "throwing star", "shuriken", "blow gun", "blowgun", "pepper spray", "cs spray", "stun gun", "taser", "crossbow", "baton", "truncheon", "nightstick", "slingshot ammo", "catapult hunting", "flick baton", "swordstick", "zombie knife"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/weapons-policy?id=5050",
      "action": "Banned on eBay UK. Do not list." },
    { "id": "firearms", "category": "prohibited", "level": "danger",
      "label": "Firearms, air guns & replicas",
      "keywords": ["firearm", "pistol", "rifle", "shotgun", "ammunition", "bullet", "gun magazine clip", "silencer", "suppressor", "air rifle", "airsoft", "bb gun", "bb pellets", "replica gun", "prop gun", "gun holster tactical"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/firearms-accessories-policy?id=4277",
      "action": "Firearms, air weapons, airsoft and realistic replicas are banned or heavily restricted. Do not list." },
    { "id": "drugs", "category": "prohibited", "level": "danger",
      "label": "Drugs & paraphernalia",
      "keywords": ["cannabis", "thc", "cbd flower", "marijuana", "weed grinder", "bong", "dab rig", "magic mushroom", "psilocybin", "kratom", "poppers", "nitrous oxide", "laughing gas", "pill press"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/illegal-drugs-drug-paraphernalia-policy?id=4333",
      "action": "Banned. Do not list." },
    { "id": "pharma", "category": "prohibited", "level": "danger",
      "label": "Medicines",
      "keywords": ["prescription", "antibiotic", "viagra", "sildenafil", "tramadol", "codeine", "insulin", "steroid anabolic", "hgh", "melanotan", "semaglutide", "ozempic"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/prescription-overthecounter-drugs-policy?id=5048",
      "action": "Medicines cannot be sold. Do not list." },
    { "id": "hazmat", "category": "prohibited", "level": "danger",
      "label": "Hazardous materials",
      "keywords": ["flammable", "explosive", "fireworks", "firework", "gunpowder", "mercury", "asbestos", "radioactive", "tear gas", "acid attack", "sulfuric acid", "hydrofluoric", "chloroform", "cyanide", "loose lithium cell", "18650 battery", "21700 battery"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/hazardous-materials-policy?id=4335",
      "action": "Hazardous goods are banned or courier-restricted. Do not dropship." },
    { "id": "tobacco-vape", "category": "prohibited", "level": "danger",
      "label": "Tobacco & e-cigarettes",
      "keywords": ["cigarette", "tobacco", "cigar", "vape", "e-liquid", "eliquid", "e liquid", "nicotine", "elf bar", "disposable vape", "shisha", "hookah"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/tobacco-ecigarettes-policy?id=4273",
      "action": "Tobacco and vaping products are banned on eBay UK. Do not list." },
    { "id": "alcohol", "category": "prohibited", "level": "danger",
      "label": "Alcohol",
      "keywords": ["whisky bottle", "vodka bottle", "wine bottle full", "alcohol drink", "liqueur"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/alcohol-policy?id=4274",
      "action": "Alcohol sales need pre-approval; sealed collectible exceptions only. Avoid." },
    { "id": "lockpicking", "category": "prohibited", "level": "danger",
      "label": "Lockpicking devices",
      "keywords": ["lock pick", "lockpick", "lock picking", "bump key", "jiggler key", "slim jim car entry", "decoder pick"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/lockpicking-devices-policy?id=4329",
      "action": "Banned. Do not list." },
    { "id": "defeat-devices", "category": "prohibited", "level": "danger",
      "label": "Emissions / signal / defeat devices",
      "keywords": ["dpf delete", "egr delete", "adblue emulator", "o2 sensor spacer defeat", "signal jammer", "gps jammer", "wifi jammer", "iptv subscription", "fully loaded firestick", "radar jammer", "laser pointer high power", "odometer correction", "mileage blocker"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/emissions-control-defeat-devices-policy?id=5383",
      "action": "Defeat devices and jammers are illegal to sell. Do not list." },
    { "id": "animals", "category": "prohibited", "level": "danger",
      "label": "Live animals / animal products / traps",
      "keywords": ["live animal", "live fish", "live insect", "ivory", "tortoiseshell", "taxidermy", "fur pelt", "snare trap", "glue trap bird", "leghold trap", "gin trap"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/animal-products-policy?id=5046",
      "action": "Banned or CITES-restricted. Do not list." },
    { "id": "counterfeit-signals", "category": "prohibited", "level": "danger",
      "label": "Counterfeit signals in listing text",
      "keywords": ["replica", "aaa quality", "1 1 quality", "inspired by", "mirror quality", "same as original", "copy watch", "faux designer", "unauthorized copy", "knock off", "knockoff"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/counterfeit-item-policy?id=4276",
      "action": "This wording signals a counterfeit. Never list replicas of branded goods." },
    { "id": "military-police", "category": "prohibited", "level": "danger",
      "label": "Military / police items",
      "keywords": ["police uniform", "police badge", "military issue current", "body armour plate", "ballistic vest", "handcuffs police", "blue lights strobe police"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/policerelated-items-policy?id=4319",
      "action": "Restricted. Do not list." },
    { "id": "offensive", "category": "prohibited", "level": "danger",
      "label": "Offensive materials",
      "keywords": ["nazi", "swastika", "ss insignia", "kkk", "hate symbol"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/offensive-materials-policy?id=4324",
      "action": "Banned. Do not list." },
    { "id": "adult", "category": "prohibited", "level": "danger",
      "label": "Adult items",
      "keywords": ["sex toy", "dildo", "vibrator adult", "fleshlight", "bondage", "pornographic"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/adult-items-policy?id=4278",
      "action": "Adult items are restricted to approved sellers/categories. Avoid for dropshipping." },
    { "id": "blacklist-water-filters", "category": "prohibited", "level": "danger",
      "label": "Team blacklist: appliance & coffee water filters",
      "keywords": ["water filter cartridge", "fridge water filter", "coffee machine water filter", "brita compatible", "claris filter", "maxtra"],
      "action": "Protocol v5 blacklist: owned end-to-end by UK trade filter houses (filtersonline, bartyspares, beautymagasin…). Do not enter." },
    { "id": "blacklist-espresso-tablets", "category": "prohibited", "level": "danger",
      "label": "Team blacklist: generic espresso cleaning tablets",
      "keywords": ["espresso cleaning tablets generic", "coffee cleaning tablets bulk"],
      "action": "Protocol v5 blacklist: bulk trade market at £0.13/tablet. Only model-coded retail-box segment carries a premium." },
    { "id": "cosmetics", "category": "sensitive", "level": "caution",
      "label": "Cosmetics / skincare / perfume",
      "keywords": ["skincare", "serum", "moisturiser", "moisturizer", "makeup", "mascara", "lipstick", "foundation cosmetic", "perfume", "fragrance", "eau de toilette", "teeth whitening", "whitening cream", "eyelash growth"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/cosmetics-policy?id=4290",
      "action": "Must be new, sealed and UK/EU-compliant. Skin/teeth products from AliExpress risk safety complaints — avoid unless certain." },
    { "id": "food", "category": "sensitive", "level": "caution",
      "label": "Food & ingestibles",
      "keywords": ["food supplement", "vitamins", "protein powder", "herbal tea slimming", "diet pills", "appetite suppressant", "detox tea", "gummies supplement", "snack imported"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/food-policy?id=4295",
      "action": "Food/supplements need date marking, UK labelling and hygiene compliance. Slimming/detox claims get removed. Avoid dropshipping." },
    { "id": "medical", "category": "sensitive", "level": "caution",
      "label": "Medical devices & health claims",
      "keywords": ["medical device", "blood pressure monitor", "pulse oximeter", "tens machine", "hearing aid", "contact lenses", "pain relief device", "massage gun therapy", "orthopedic brace", "blood glucose"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/medical-devices-policy?id=4322",
      "action": "Many consumer medical items need CE/UKCA marking and some are prohibited. Verify the exact policy before listing." },
    { "id": "product-safety", "category": "sensitive", "level": "caution",
      "label": "UKCA/CE-critical items (toys, chargers, child safety)",
      "keywords": ["toy for children", "kids toy", "baby toy", "teether", "dummy pacifier", "cot bumper", "baby sleep positioner", "car seat child", "usb charger plug", "mains charger", "power adapter uk plug", "phone charger plug", "hoverboard", "e-scooter battery", "smoke alarm", "carbon monoxide alarm"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/product-safety-policy?id=4300",
      "action": "Needs UKCA/CE compliance and traceable safety documentation. Uncertified AliExpress versions are removed and are a real safety/liability risk. Safety alarms without certification: do not list." },
    { "id": "batteries", "category": "sensitive", "level": "caution",
      "label": "Lithium battery products",
      "keywords": ["lithium battery", "li-ion", "power bank", "battery pack", "rechargeable 3.7v"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/hazardous-materials-policy?id=4335",
      "action": "Couriers restrict loose lithium batteries; devices with installed cells are usually fine but check the carrier. Loose cells: do not dropship." },
    { "id": "plants", "category": "sensitive", "level": "caution",
      "label": "Plants & seeds",
      "keywords": ["plant seeds", "flower seeds", "vegetable seeds", "bonsai seeds", "live plant", "bulbs perennial"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/plants-seeds-policy?id=4287",
      "action": "Seeds/plants from outside the UK face import/phytosanitary restrictions. Do not dropship from China." },
    { "id": "vehicle-safety", "category": "sensitive", "level": "caution",
      "label": "Safety-critical vehicle parts",
      "keywords": ["brake pads", "brake discs", "airbag", "seat belt", "tyre", "steering rack", "suspension arm"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/vehicle-parts-accessories-policy?id=4293",
      "action": "Safety-critical parts carry liability and policy scrutiny. Cosmetic accessories are fine; avoid anything braking/steering/restraint related." },
    { "id": "event-tickets", "category": "sensitive", "level": "caution",
      "label": "Tickets, vouchers, digital goods",
      "keywords": ["event ticket", "concert ticket", "gift card", "voucher code", "digital download", "account subscription"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/event-tickets-policy?id=4309",
      "action": "Heavily restricted categories with fraud rules. Not dropshippable." },
    { "id": "used-clothing", "category": "sensitive", "level": "caution",
      "label": "Used clothing / hygiene items",
      "keywords": ["used underwear", "worn clothing", "second hand shoes"],
      "policyUrl": "https://www.ebay.co.uk/help/policies/prohibited-restricted-items/used-clothing-policy?id=4281",
      "action": "Used underwear is banned; other used clothing must be cleaned. Irrelevant for dropshipping new goods — flag means the listing text sounds second-hand." },
    { "id": "fragile-materials", "category": "fragile", "level": "caution",
      "label": "Fragile / easy to break",
      "keywords": ["glass", "glassware", "ceramic", "porcelain", "mirror", "crystal", "chandelier", "china plate", "stoneware", "earthenware", "terracotta", "marble thin", "wine glass", "vase"],
      "action": "High breakage risk in 6–13 day transit. Expect returns and refund costs. Prefer unbreakable alternatives (silicone, bamboo, stainless)." }
  ],
  "size": {
    "largeLetter": { "l": 35.3, "w": 25, "h": 2.5, "weightG": 750 },
    "simpleDeliveryPriceGBP": 20,
    "hugeSideCm": 60,
    "hugeWeightG": 5000
  }
}
```

- [ ] **Step 4: Implement `src/rules/bundled/index.ts`**

```ts
import type { RulesPack, VeroBrand } from '../../types';
import seed from '../../../data/vero-brands-seed.json';
import curated from './curated-pack.json';

interface SeedEntry { name: string; profile: string; }

export function bundledPack(): RulesPack {
  const officialNames = new Set(
    (seed as SeedEntry[]).map((b) => b.name.toLowerCase()),
  );
  const brands: VeroBrand[] = (seed as SeedEntry[]).map((b) => ({
    name: b.name, profile: b.profile, source: 'official',
  }));
  for (const name of curated.veroAdditions) {
    // skip additions whose name is a prefix of an official entry (e.g. "Chanel" vs "Chanel, Inc.")
    const lower = name.toLowerCase();
    const dupe = [...officialNames].some(
      (o) => o === lower || o.startsWith(lower + ' ') || o.startsWith(lower + ','),
    );
    if (!dupe) brands.push({ name, source: 'curated' });
  }
  for (const name of curated.confirmedSafe) {
    brands.push({ name, source: 'curated', confirmedSafe: true });
  }
  return {
    version: curated.version,
    fetchedAt: 0, // bundled; real fetchedAt comes from the worker's live scrape
    veroBrands: brands,
    aliases: curated.aliases as Record<string, string>,
    topBrands: curated.topBrands,
    classes: curated.classes as RulesPack['classes'],
    size: curated.size,
  };
}
```

- [ ] **Step 5: Run tests, verify PASS**

Run: `npx vitest run tests/rules && npm run typecheck`
Expected: PASS. If the Chanel-dedupe test fails, print the actual seed entry name and adjust the dupe check accordingly (keep the official entry, drop the curated one).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: bundled rules pack — official VeRO seed + curated additions, 27 policy classes, size rules"
```

---

### Task 4: C1 — VeRO brand check

**Files:**
- Create: `src/engine/vero.ts`
- Test: `tests/engine/vero.test.ts`

**Interfaces:**
- Consumes: `bundledPack()` for test data; `normalize/tokens/containsPhrase/brandMatchTerm/fuzzyIncludes`.
- Produces: `checkVero(listing: Listing, pack: RulesPack): CategoryResult` and helper `isCompatUsage(normText: string, term: string): boolean` (exported for reuse in C3).

- [ ] **Step 1: Write failing tests**

`tests/engine/vero.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { checkVero } from '../../src/engine/vero';
import { bundledPack } from '../../src/rules/bundled/index';
import type { Listing } from '../../src/types';

const pack = bundledPack();
const listing = (title: string, extra: Partial<Listing> = {}): Listing => ({
  site: 'aliexpress', url: 'https://x', title, images: [], missing: [], ...extra,
});

describe('checkVero', () => {
  it('flags a direct VeRO brand as danger', () => {
    const r = checkVero(listing('Dyson V8 Vacuum Filter Replacement'), pack);
    expect(r.level).toBe('danger');
    expect(r.hits[0].label).toMatch(/dyson/i);
  });
  it('flags curated additions (Apple via alias magsafe)', () => {
    const r = checkVero(listing('Magsafe Wireless Charger 15W'), pack);
    expect(r.level).toBe('danger');
    expect(r.hits[0].detail).toMatch(/Apple/);
  });
  it('gives caution for compatible-wording usage', () => {
    const r = checkVero(listing('Filter for Dyson V8 Animal, compatible replacement'), pack);
    expect(r.level).toBe('caution');
    expect(r.hits[0].action).toMatch(/compatible with/i);
  });
  it('never flags confirmedSafe brands as danger', () => {
    const r = checkVero(listing('Water Filter for Sage Barista Express'), pack);
    expect(r.hits.every((h) => h.level !== 'danger')).toBe(true);
  });
  it('catches fuzzy misspellings', () => {
    const r = checkVero(listing('Dysson cordless vacuum spare part'), pack);
    expect(r.level).toBe('danger');
  });
  it('is clear for unbranded items', () => {
    const r = checkVero(listing('Strimmer Spool Line 1.65mm 15m Refill'), pack);
    expect(r.level).toBe('clear');
    expect(r.hits).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL**

Run: `npx vitest run tests/engine/vero.test.ts`

- [ ] **Step 3: Implement `src/engine/vero.ts`**

```ts
import type { CategoryResult, Listing, RuleHit, RulesPack, VeroBrand } from '../types';
import { worst } from '../types';
import { brandMatchTerm, containsPhrase, normalize, tokens } from './normalize';
import { fuzzyIncludes } from './fuzzy';

const COMPAT = [
  'compatible with', 'for', 'fits', 'to fit', 'fit for', 'replacement for',
  'designed for', 'suits', 'suitable for', 'works with',
];

export function isCompatUsage(normText: string, term: string): boolean {
  let idx = normText.indexOf(term);
  if (idx === -1) return false;
  while (idx !== -1) {
    const boundedStart = idx === 0 || normText[idx - 1] === ' ';
    const before = normText.slice(Math.max(0, idx - 30), idx).trim();
    if (boundedStart && !COMPAT.some((c) => before.endsWith(c))) return false;
    idx = normText.indexOf(term, idx + term.length);
  }
  return true;
}

const SAFE_WORDING =
  'Use "compatible with" / "for" / "fits" + brand, your own photos, no manufacturer logo, and never imply the item is genuine.';

function searchText(listing: Listing): { toks: string[]; norm: string } {
  const raw = [listing.title, listing.brand ?? '', (listing.description ?? '').slice(0, 1000)].join(' ');
  return { toks: tokens(raw), norm: normalize(raw) };
}

export function checkVero(listing: Listing, pack: RulesPack): CategoryResult {
  const { toks, norm } = searchText(listing);
  const hits: RuleHit[] = [];
  const seen = new Set<string>();

  const addHit = (brand: VeroBrand, term: string, fuzzy: boolean) => {
    if (seen.has(brand.name) || brand.confirmedSafe) return;
    seen.add(brand.name);
    const compat = !fuzzy && isCompatUsage(norm, term);
    hits.push({
      ruleId: `vero:${term}`,
      level: compat ? 'caution' : 'danger',
      label: brand.name,
      detail: compat
        ? `"${brand.name}" appears only in compatible-accessory wording. Listable with the safe-wording rules.`
        : `${brand.name} is a VeRO ${brand.source === 'official' ? 'participant' : 'enforcer (curated list — not on eBay’s public page)'}${fuzzy ? ' (near-miss spelling detected)' : ''}. Listing risks takedown and account strikes.`,
      action: compat ? SAFE_WORDING : 'Do not list this item, or remove every trace of the brand (name, model marketing names, logos in images).',
      link: brand.profile,
    });
  };

  for (const brand of pack.veroBrands) {
    const term = brandMatchTerm(brand.name);
    if (!term) continue;
    if (containsPhrase(toks, term)) addHit(brand, term, false);
    else if (fuzzyIncludes(toks, term)) addHit(brand, term, true);
  }

  const brandByName = new Map(pack.veroBrands.map((b) => [b.name.toLowerCase(), b] as const));
  for (const [alias, canonical] of Object.entries(pack.aliases)) {
    if (!containsPhrase(toks, normalize(alias))) continue;
    const brand =
      brandByName.get(canonical.toLowerCase()) ??
      ({ name: canonical, source: 'curated' } as VeroBrand);
    if (seen.has(brand.name)) continue;
    seen.add(brand.name);
    const compat = isCompatUsage(norm, normalize(alias));
    hits.push({
      ruleId: `vero-alias:${alias}`,
      level: compat ? 'caution' : 'danger',
      label: `${alias} → ${canonical}`,
      detail: compat
        ? `"${alias}" (implies ${canonical}) appears only in compatible wording.`
        : `"${alias}" implies ${canonical}, a VeRO enforcer. Trademarked product names count as brand use.`,
      action: compat ? SAFE_WORDING : `Remove "${alias}" from title/description, or do not list.`,
    });
  }

  return {
    category: 'vero',
    level: hits.length ? worst(hits.map((h) => h.level)) : 'clear',
    hits,
  };
}
```

- [ ] **Step 4: Run tests, verify PASS**

Run: `npx vitest run tests/engine/vero.test.ts && npm run typecheck`
Expected: PASS. Likely failure point: the compat test — "for dyson v8" requires `isCompatUsage` to accept "for" preceding; if `Filter for Dyson…` fails because "compatible replacement" clause contains "replacement for"-less mention, debug with the actual `norm` string before changing logic.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: C1 VeRO brand check with aliases, fuzzy match and compatible-wording nuance"
```

---

### Task 5: Keyword-class matcher (C2 prohibited, C5 sensitive, C6 fragile)

**Files:**
- Create: `src/engine/classes.ts`
- Test: `tests/engine/classes.test.ts`

**Interfaces:**
- Produces: `checkClasses(listing: Listing, pack: RulesPack, category: 'prohibited' | 'sensitive' | 'fragile'): CategoryResult`

- [ ] **Step 1: Write failing tests**

`tests/engine/classes.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { checkClasses } from '../../src/engine/classes';
import { bundledPack } from '../../src/rules/bundled/index';
import type { Listing } from '../../src/types';

const pack = bundledPack();
const listing = (title: string, extra: Partial<Listing> = {}): Listing => ({
  site: 'ebay', url: 'https://x', title, images: [], missing: [], ...extra,
});

describe('checkClasses — prohibited', () => {
  it('flags knives as danger with policy link', () => {
    const r = checkClasses(listing('Damascus Steel Chef Knife 8 inch'), pack, 'prohibited');
    expect(r.level).toBe('danger');
    expect(r.hits[0].link).toContain('id=5047');
  });
  it('flags counterfeit wording', () => {
    const r = checkClasses(listing('Luxury watch AAA quality replica'), pack, 'prohibited');
    expect(r.level).toBe('danger');
  });
  it('flags team blacklist categories', () => {
    const r = checkClasses(listing('Fridge Water Filter Cartridge 3-pack'), pack, 'prohibited');
    expect(r.level).toBe('danger');
    expect(r.hits[0].label).toMatch(/blacklist/i);
  });
  it('clear for a harmless item', () => {
    expect(checkClasses(listing('Silicone Air Fryer Liner 2 pack'), pack, 'prohibited').level).toBe('clear');
  });
});

describe('checkClasses — sensitive', () => {
  it('cautions on uncertified-toy risk', () => {
    const r = checkClasses(listing('Kids Toy Montessori Wooden Puzzle'), pack, 'sensitive');
    expect(r.level).toBe('caution');
  });
  it('cautions on health claims in description', () => {
    const r = checkClasses(
      listing('Herbal patch', { description: 'natural pain relief device for joints' }),
      pack, 'sensitive',
    );
    expect(r.level).toBe('caution');
  });
});

describe('checkClasses — fragile', () => {
  it('cautions on glass via material field', () => {
    const r = checkClasses(listing('Teapot 600ml', { material: 'Borosilicate Glass' }), pack, 'fragile');
    expect(r.level).toBe('caution');
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npx vitest run tests/engine/classes.test.ts`

- [ ] **Step 3: Implement `src/engine/classes.ts`**

```ts
import type { CategoryResult, Listing, RuleHit, RulesPack } from '../types';
import { worst } from '../types';
import { containsPhrase, normalize, tokens } from './normalize';

export function checkClasses(
  listing: Listing,
  pack: RulesPack,
  category: 'prohibited' | 'sensitive' | 'fragile',
): CategoryResult {
  const raw = [
    listing.title,
    (listing.description ?? '').slice(0, 2000),
    listing.material ?? '',
  ].join(' ');
  const toks = tokens(raw);
  const hits: RuleHit[] = [];

  for (const cls of pack.classes.filter((c) => c.category === category)) {
    const kwHit = cls.keywords.find((kw) => containsPhrase(toks, normalize(kw)));
    const reHit = cls.patterns?.find((p) => new RegExp(p, 'i').test(raw));
    if (!kwHit && !reHit) continue;
    hits.push({
      ruleId: `class:${cls.id}`,
      level: cls.level,
      label: cls.label,
      detail: `Matched ${kwHit ? `"${kwHit}"` : `pattern /${reHit}/`}.`,
      action: cls.action,
      link: cls.policyUrl,
    });
  }

  return { category, level: hits.length ? worst(hits.map((h) => h.level)) : 'clear', hits };
}
```

- [ ] **Step 4: Run tests, verify PASS**

Run: `npx vitest run tests/engine/classes.test.ts && npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: keyword-class matcher powering prohibited/sensitive/fragile categories"
```

---

### Task 6: C3 branded + C4 size

**Files:**
- Create: `src/engine/branded.ts`, `src/engine/size.ts`
- Test: `tests/engine/branded.test.ts`, `tests/engine/size.test.ts`

**Interfaces:**
- Consumes: `isCompatUsage` from `src/engine/vero.ts`.
- Produces: `checkBranded(listing: Listing, pack: RulesPack, veroFlaggedNames: Set<string>): CategoryResult` · `checkSize(listing: Listing, size: SizeRules): CategoryResult`

- [ ] **Step 1: Write failing tests**

`tests/engine/branded.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { checkBranded } from '../../src/engine/branded';
import { bundledPack } from '../../src/rules/bundled/index';
import type { Listing } from '../../src/types';

const pack = bundledPack();
const listing = (title: string): Listing => ({
  site: 'amazon', url: 'https://x', title, images: [], missing: [],
});

describe('checkBranded', () => {
  it('cautions on a non-VeRO brand used directly', () => {
    const r = checkBranded(listing('Ninja Air Fryer Basket Genuine Part'), pack, new Set());
    expect(r.level).toBe('caution');
    expect(r.hits[0].detail).toMatch(/genuine-branded-only|IP complaint/i);
  });
  it('stays clear for compatible wording', () => {
    const r = checkBranded(listing('Liner for Ninja AF400UK Air Fryer'), pack, new Set());
    expect(r.level).toBe('clear');
  });
  it('skips brands already flagged by C1', () => {
    const r = checkBranded(listing('Ninja blender jug'), pack, new Set(['Ninja']));
    expect(r.hits).toEqual([]);
  });
});
```

`tests/engine/size.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { checkSize } from '../../src/engine/size';
import { bundledPack } from '../../src/rules/bundled/index';
import type { Listing } from '../../src/types';

const size = bundledPack().size;
const base: Listing = { site: 'amazon', url: 'https://x', title: 't', images: [], missing: [] };

describe('checkSize', () => {
  it('clear + note when it fits large letter', () => {
    const r = checkSize({ ...base, dimensionsCm: { l: 30, w: 20, h: 2 }, weightG: 300 }, size);
    expect(r.level).toBe('clear');
    expect(r.note).toMatch(/large letter/i);
  });
  it('caution when over large letter, with Simple Delivery warning above £20', () => {
    const r = checkSize({ ...base, dimensionsCm: { l: 40, w: 30, h: 10 }, weightG: 900, priceGBP: 24.99 }, size);
    expect(r.level).toBe('caution');
    expect(r.hits.map((h) => h.detail).join(' ')).toMatch(/£2\.94/);
  });
  it('danger for huge items', () => {
    const r = checkSize({ ...base, dimensionsCm: { l: 120, w: 40, h: 40 } }, size);
    expect(r.level).toBe('danger');
  });
  it('unknown when no dimensions or weight', () => {
    const r = checkSize(base, size);
    expect(r.level).toBe('unknown');
    expect(r.note).toMatch(/check manually/i);
  });
  it('sorted-fit: 25 x 35 x 2 still fits large letter', () => {
    const r = checkSize({ ...base, dimensionsCm: { l: 25, w: 35, h: 2 }, weightG: 100 }, size);
    expect(r.level).toBe('clear');
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npx vitest run tests/engine/branded.test.ts tests/engine/size.test.ts`

- [ ] **Step 3: Implement**

`src/engine/branded.ts`:
```ts
import type { CategoryResult, Listing, RuleHit, RulesPack } from '../types';
import { brandMatchTerm, containsPhrase, normalize, tokens } from './normalize';
import { isCompatUsage } from './vero';

export function checkBranded(
  listing: Listing,
  pack: RulesPack,
  veroFlaggedNames: Set<string>,
): CategoryResult {
  const raw = [listing.title, listing.brand ?? '', (listing.description ?? '').slice(0, 1000)].join(' ');
  const toks = tokens(raw);
  const norm = normalize(raw);
  const hits: RuleHit[] = [];

  for (const brand of pack.topBrands) {
    if (veroFlaggedNames.has(brand)) continue;
    const term = brandMatchTerm(brand);
    if (!term || !containsPhrase(toks, term)) continue;
    if (isCompatUsage(norm, term)) continue; // compatible accessory — the good pattern
    hits.push({
      ruleId: `branded:${term}`,
      level: 'caution',
      label: brand,
      detail: `Branded item (${brand}). Off-VeRO brands can still file IP complaints, and genuine branded stock is rarely sourceable from AliExpress (genuine-branded-only failure mode).`,
      action: 'Prefer an unbranded or model-coded alternative, or switch to "compatible with" accessory wording.',
    });
  }

  return { category: 'branded', level: hits.length ? 'caution' : 'clear', hits };
}
```

`src/engine/size.ts`:
```ts
import type { CategoryResult, Listing, RuleHit, SizeRules } from '../types';

export function checkSize(listing: Listing, size: SizeRules): CategoryResult {
  const d = listing.dimensionsCm;
  const w = listing.weightG;
  if (!d && w === undefined) {
    return {
      category: 'size', level: 'unknown', hits: [],
      note: 'Size unknown — check manually. Large-letter limit is 35.3 × 25 × 2.5 cm, 750 g.',
    };
  }

  const sides = [d?.l, d?.w, d?.h].filter((x): x is number => x !== undefined).sort((a, b) => b - a);
  const limits = [size.largeLetter.l, size.largeLetter.w, size.largeLetter.h].sort((a, b) => b - a);
  const hits: RuleHit[] = [];

  const huge = sides.some((s) => s > size.hugeSideCm) || (w !== undefined && w > size.hugeWeightG);
  if (huge) {
    hits.push({
      ruleId: 'size:huge', level: 'danger', label: 'Very large / heavy item',
      detail: `Exceeds ${size.hugeSideCm} cm or ${size.hugeWeightG / 1000} kg — courier surcharges and damage risk make this unsuitable for dropshipping.`,
      action: 'Do not dropship. Pick a smaller product.',
    });
    return { category: 'size', level: 'danger', hits };
  }

  const fitsDims = sides.length > 0 && sides.every((s, i) => s <= limits[i]);
  const fitsWeight = w === undefined || w <= size.largeLetter.weightG;
  if (fitsDims && fitsWeight && sides.length === 3) {
    return {
      category: 'size', level: 'clear', hits: [],
      note: 'Fits large letter (≤ 35.3 × 25 × 2.5 cm, ≤ 750 g) — best postage economics.',
    };
  }

  hits.push({
    ruleId: 'size:parcel', level: 'caution', label: 'Over large-letter size',
    detail:
      (listing.priceGBP !== undefined && listing.priceGBP > size.simpleDeliveryPriceGBP
        ? `Parcel rates apply, and above £${size.simpleDeliveryPriceGBP} eBay Simple Delivery adds £2.94–£3.38 to the buyer.`
        : 'Parcel rates apply — factor postage into the 30% cost ratio.'),
    action: 'Re-run your cost gate with parcel postage included.',
  });
  return { category: 'size', level: 'caution', hits };
}
```

- [ ] **Step 4: Run tests, verify PASS**

Run: `npx vitest run tests/engine && npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: C3 branded-item and C4 size/weight checks"
```

---

### Task 7: evaluate() orchestrator

**Files:**
- Create: `src/engine/evaluate.ts`
- Test: `tests/engine/evaluate.test.ts`

**Interfaces:**
- Produces: `evaluate(listing: Listing, pack: RulesPack): Verdict` — categories always in order `vero, prohibited, branded, size, sensitive, fragile`.

- [ ] **Step 1: Write failing tests** — the spec's known-answer table:

`tests/engine/evaluate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/engine/evaluate';
import { bundledPack } from '../../src/rules/bundled/index';
import type { Listing } from '../../src/types';

const pack = bundledPack();
const listing = (title: string, extra: Partial<Listing> = {}): Listing => ({
  site: 'aliexpress', url: 'https://x', title, images: [], missing: [], ...extra,
});

describe('evaluate — known answers', () => {
  it('Dyson filter → danger via vero', () => {
    const v = evaluate(listing('Dyson V8 replacement filter'), pack);
    expect(v.overall).toBe('danger');
    expect(v.categories.find((c) => c.category === 'vero')?.level).toBe('danger');
  });
  it('kitchen knife → danger via prohibited', () => {
    const v = evaluate(listing('Stainless kitchen knife set'), pack);
    expect(v.categories.find((c) => c.category === 'prohibited')?.level).toBe('danger');
  });
  it('glass teapot → caution via fragile', () => {
    const v = evaluate(listing('Glass teapot with infuser', { dimensionsCm: { l: 20, w: 15, h: 2 }, weightG: 300 }), pack);
    expect(v.overall).toBe('caution');
    expect(v.categories.find((c) => c.category === 'fragile')?.level).toBe('caution');
  });
  it('unbranded strimmer spool, letter-size → overall clear', () => {
    const v = evaluate(
      listing('Strimmer Spool Line 1.65mm Refill', { dimensionsCm: { l: 10, w: 10, h: 2 }, weightG: 50 }),
      pack,
    );
    expect(v.overall).toBe('clear');
  });
  it('missing dimensions can never be overall clear', () => {
    const v = evaluate(listing('Strimmer Spool Line Refill'), pack);
    expect(v.overall).toBe('unknown');
  });
  it('categories come in fixed order and verdict carries rules metadata', () => {
    const v = evaluate(listing('anything'), pack);
    expect(v.categories.map((c) => c.category)).toEqual([
      'vero', 'prohibited', 'branded', 'size', 'sensitive', 'fragile',
    ]);
    expect(v.rulesVersion).toBe(pack.version);
    expect(v.checkedAt).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**, then **Step 3: Implement `src/engine/evaluate.ts`**

```ts
import type { Listing, RulesPack, Verdict } from '../types';
import { worst } from '../types';
import { checkVero } from './vero';
import { checkClasses } from './classes';
import { checkBranded } from './branded';
import { checkSize } from './size';

export function evaluate(listing: Listing, pack: RulesPack): Verdict {
  const vero = checkVero(listing, pack);
  const veroFlagged = new Set(vero.hits.map((h) => h.label.split(' → ').pop() ?? h.label));
  const categories = [
    vero,
    checkClasses(listing, pack, 'prohibited'),
    checkBranded(listing, pack, veroFlagged),
    checkSize(listing, pack.size),
    checkClasses(listing, pack, 'sensitive'),
    checkClasses(listing, pack, 'fragile'),
  ];
  return {
    overall: worst(categories.map((c) => c.level)),
    categories,
    rulesVersion: pack.version,
    rulesFetchedAt: pack.fetchedAt,
    checkedAt: Date.now(),
  };
}
```

- [ ] **Step 4: Run full engine suite, verify PASS**

Run: `npx vitest run && npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: evaluate() orchestrator with fixed category order and worst-of overall"
```

---

### Task 8: VeRO page scraper + rules merging

**Files:**
- Create: `src/rules/veroScraper.ts`, `src/rules/merge.ts`
- Create: `tests/fixtures/vero-page.html` (copy of the real page)
- Test: `tests/rules/veroScraper.test.ts`, `tests/rules/merge.test.ts`

**Interfaces:**
- Produces: `parseVeroPage(html: string): VeroBrand[]` · `mergeRules(bundled: RulesPack, official?: { brands: VeroBrand[]; fetchedAt: number }, curated?: unknown, local?: LocalOverrides): RulesPack` · `interface LocalOverrides { addBrands?: string[]; ignoreBrands?: string[] }` (export from `merge.ts`).
- `curated?: unknown` is the remote curated-pack JSON (same shape as the bundled one); when present its `version/aliases/topBrands/classes/size/veroAdditions/confirmedSafe` replace the bundled ones.

- [ ] **Step 1: Copy the fixture**

Run: `mkdir -p tests/fixtures && cp "/private/tmp/claude-501/-Users-zahoorkhan/11af87de-fe3f-4a60-a3e6-14ad9a565604/scratchpad/vero.html" tests/fixtures/vero-page.html`
(If the scratchpad file no longer exists, re-download: `curl -sL -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" "https://www.ebay.co.uk/sellercentre/protection/verified-rights-owner-profiles" -o tests/fixtures/vero-page.html`)

- [ ] **Step 2: Write failing tests**

`tests/rules/veroScraper.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseVeroPage } from '../../src/rules/veroScraper';

describe('parseVeroPage', () => {
  const html = readFileSync('tests/fixtures/vero-page.html', 'utf8');
  const brands = parseVeroPage(html);
  it('extracts at least 1,100 unique brands', () => {
    expect(brands.length).toBeGreaterThan(1100);
  });
  it('decodes HTML entities in names', () => {
    expect(brands.some((b) => b.name.includes('&amp;'))).toBe(false);
    expect(brands.some((b) => b.name.includes('&'))).toBe(true);
  });
  it('every brand has an official source and a profile PDF', () => {
    expect(brands.every((b) => b.source === 'official' && b.profile?.endsWith('.pdf'))).toBe(true);
  });
  it('returns [] for HTML without the list (layout change)', () => {
    expect(parseVeroPage('<html><body>maintenance</body></html>')).toEqual([]);
  });
});
```

`tests/rules/merge.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { bundledPack } from '../../src/rules/bundled/index';
import { mergeRules } from '../../src/rules/merge';

describe('mergeRules', () => {
  it('fresh official list replaces bundled official brands and sets fetchedAt', () => {
    const merged = mergeRules(bundledPack(), {
      brands: [{ name: 'TestCo', profile: 'https://x/t.pdf', source: 'official' }],
      fetchedAt: 1234,
    });
    expect(merged.veroBrands.filter((b) => b.source === 'official')).toHaveLength(1);
    expect(merged.veroBrands.some((b) => b.name === 'Apple' && b.source === 'curated')).toBe(true);
    expect(merged.fetchedAt).toBe(1234);
  });
  it('local overrides add and ignore brands', () => {
    const merged = mergeRules(bundledPack(), undefined, undefined, {
      addBrands: ['MyRiskyBrand'], ignoreBrands: ['Apple'],
    });
    expect(merged.veroBrands.some((b) => b.name === 'MyRiskyBrand' && b.source === 'local')).toBe(true);
    expect(merged.veroBrands.find((b) => b.name === 'Apple')?.confirmedSafe).toBe(true);
  });
  it('remote curated pack replaces aliases/classes when provided', () => {
    const merged = mergeRules(bundledPack(), undefined, {
      version: '2026-09-01.1', veroAdditions: [], confirmedSafe: [],
      aliases: { zzz: 'ZZZ Co' }, topBrands: [], classes: [],
      size: bundledPack().size,
    });
    expect(merged.version).toBe('2026-09-01.1');
    expect(merged.aliases['zzz']).toBe('ZZZ Co');
    expect(merged.aliases['iphone']).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run, verify FAIL**, then **Step 4: Implement**

`src/rules/veroScraper.ts`:
```ts
import type { VeroBrand } from '../types';

const LINK_RE =
  /<a[^>]+href="(https:\/\/ir\.ebaystatic\.com\/pictures\/aw\/pics\/pdf\/us\/help\/community\/vpp\/[^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/g;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&rsquo;|&#8217;/g, '’').replace(/&nbsp;/g, ' ');
}

export function parseVeroPage(html: string): VeroBrand[] {
  const out: VeroBrand[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(LINK_RE)) {
    const name = decodeEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, profile: m[1], source: 'official' });
  }
  return out;
}
```

`src/rules/merge.ts`:
```ts
import type { RulesPack, VeroBrand } from '../types';

export interface LocalOverrides { addBrands?: string[]; ignoreBrands?: string[]; }

interface CuratedShape {
  version: string; veroAdditions: string[]; confirmedSafe: string[];
  aliases: Record<string, string>; topBrands: string[];
  classes: RulesPack['classes']; size: RulesPack['size'];
}

export function mergeRules(
  bundled: RulesPack,
  official?: { brands: VeroBrand[]; fetchedAt: number },
  curated?: unknown,
  local?: LocalOverrides,
): RulesPack {
  const c = (curated ?? null) as CuratedShape | null;
  const officialBrands = official?.brands ?? bundled.veroBrands.filter((b) => b.source === 'official');
  const officialLower = new Set(officialBrands.map((b) => b.name.toLowerCase()));

  const additions = c ? c.veroAdditions : bundled.veroBrands.filter((b) => b.source === 'curated' && !b.confirmedSafe).map((b) => b.name);
  const safe = c ? c.confirmedSafe : bundled.veroBrands.filter((b) => b.confirmedSafe).map((b) => b.name);

  const brands: VeroBrand[] = [...officialBrands];
  for (const name of additions) {
    const lower = name.toLowerCase();
    const dupe = [...officialLower].some((o) => o === lower || o.startsWith(lower + ' ') || o.startsWith(lower + ','));
    if (!dupe) brands.push({ name, source: 'curated' });
  }
  for (const name of safe) brands.push({ name, source: 'curated', confirmedSafe: true });
  for (const name of local?.addBrands ?? []) {
    if (!brands.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
      brands.push({ name, source: 'local' });
    }
  }
  for (const name of local?.ignoreBrands ?? []) {
    const lower = name.toLowerCase();
    for (const b of brands) if (b.name.toLowerCase() === lower) b.confirmedSafe = true;
  }

  return {
    version: c?.version ?? bundled.version,
    fetchedAt: official?.fetchedAt ?? bundled.fetchedAt,
    veroBrands: brands,
    aliases: c?.aliases ?? bundled.aliases,
    topBrands: c?.topBrands ?? bundled.topBrands,
    classes: c?.classes ?? bundled.classes,
    size: c?.size ?? bundled.size,
  };
}
```

- [ ] **Step 5: Run tests, verify PASS**

Run: `npx vitest run tests/rules && npm run typecheck`

- [ ] **Step 6: Commit** (fixture is ~600 KB — that is fine, commit it)

```bash
git add -A && git commit -m "feat: live VeRO page parser and layered rules merging"
```

---

### Task 9: Adapter shared helpers + eBay adapter

**Files:**
- Create: `src/adapters/shared.ts`, `src/adapters/ebay.ts`, `src/adapters/index.ts`
- Create: `tests/fixtures/ebay-item.html`
- Test: `tests/adapters/shared.test.ts`, `tests/adapters/ebay.test.ts`

**Interfaces:**
- Produces:

```ts
// src/adapters/shared.ts
export function parseDimensionsCm(text: string): { l?: number; w?: number; h?: number } | undefined;
export function parseWeightG(text: string): number | undefined;
export function parsePriceGBP(text: string): number | undefined;
export function textOf(doc: Document, selectors: string[]): string | undefined; // first match's trimmed textContent

// src/adapters/index.ts
export interface Adapter {
  site: Site;
  matches(url: string): boolean;
  extract(doc: Document, url: string): Listing;
}
export function pickAdapter(url: string): Adapter | undefined;
```

- [ ] **Step 1: Write fixture** `tests/fixtures/ebay-item.html` (hand-written mini page using real eBay UK DOM shapes):

```html
<!doctype html><html><head><meta charset="utf-8">
<meta property="og:image" content="https://i.ebayimg.com/images/g/abc/s-l1600.jpg">
</head><body>
<h1 class="x-item-title__mainTitle"><span class="ux-textspans ux-textspans--BOLD">Glass Teapot with Infuser 600ml Borosilicate</span></h1>
<div class="x-price-primary"><span class="ux-textspans">£12.99</span></div>
<div class="x-about-this-item">
  <dl class="ux-labels-values"><dt><span>Brand</span></dt><dd><span>Unbranded</span></dd></dl>
  <dl class="ux-labels-values"><dt><span>Material</span></dt><dd><span>Borosilicate Glass</span></dd></dl>
  <dl class="ux-labels-values"><dt><span>Item Length</span></dt><dd><span>20 cm</span></dd></dl>
  <dl class="ux-labels-values"><dt><span>Item Width</span></dt><dd><span>15 cm</span></dd></dl>
  <dl class="ux-labels-values"><dt><span>Item Height</span></dt><dd><span>12 cm</span></dd></dl>
  <dl class="ux-labels-values"><dt><span>Item Weight</span></dt><dd><span>350 g</span></dd></dl>
</div>
<div class="d-item-description"><iframe id="desc_ifr" src="about:blank"></iframe></div>
</body></html>
```

- [ ] **Step 2: Write failing tests**

`tests/adapters/shared.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseDimensionsCm, parsePriceGBP, parseWeightG } from '../../src/adapters/shared';

describe('parseDimensionsCm', () => {
  it('parses "L x W x H cm"', () => {
    expect(parseDimensionsCm('35 x 25 x 2.5 cm')).toEqual({ l: 35, w: 25, h: 2.5 });
  });
  it('converts inches', () => {
    const d = parseDimensionsCm('10 x 5 x 2 inches')!;
    expect(d.l).toBeCloseTo(25.4, 1);
  });
  it('returns undefined for prose without dimensions', () => {
    expect(parseDimensionsCm('lovely teapot for the whole family')).toBeUndefined();
  });
});

describe('parseWeightG', () => {
  it('parses g and kg', () => {
    expect(parseWeightG('350 g')).toBe(350);
    expect(parseWeightG('1.2 kg')).toBe(1200);
  });
});

describe('parsePriceGBP', () => {
  it('parses £ prices', () => {
    expect(parsePriceGBP('£12.99')).toBe(12.99);
    expect(parsePriceGBP('GBP 8.50')).toBe(8.5);
  });
  it('ignores non-GBP', () => {
    expect(parsePriceGBP('US $4.99')).toBeUndefined();
  });
});
```

`tests/adapters/ebay.test.ts`:
```ts
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ebayAdapter } from '../../src/adapters/ebay';

describe('ebayAdapter', () => {
  const html = readFileSync('tests/fixtures/ebay-item.html', 'utf8');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const url = 'https://www.ebay.co.uk/itm/123456789';

  it('matches only item pages', () => {
    expect(ebayAdapter.matches(url)).toBe(true);
    expect(ebayAdapter.matches('https://www.ebay.co.uk/sch/i.html?_nkw=x')).toBe(false);
  });
  it('extracts title, price, material, dimensions, weight, image', () => {
    const l = ebayAdapter.extract(doc, url);
    expect(l.title).toMatch(/Glass Teapot/);
    expect(l.priceGBP).toBe(12.99);
    expect(l.material).toBe('Borosilicate Glass');
    expect(l.dimensionsCm).toEqual({ l: 20, w: 15, h: 12 });
    expect(l.weightG).toBe(350);
    expect(l.images[0]).toContain('ebayimg');
    expect(l.site).toBe('ebay');
  });
  it('records missing fields instead of guessing', () => {
    const empty = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    const l = ebayAdapter.extract(empty, url);
    expect(l.title).toBe('');
    expect(l.missing).toContain('title');
    expect(l.missing).toContain('price');
  });
});
```

- [ ] **Step 3: Run, verify FAIL**, then **Step 4: Implement**

`src/adapters/shared.ts`:
```ts
const DIM_RE =
  /(\d+(?:\.\d+)?)\s*(?:cm)?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:cm)?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(cm|mm|in|inch|inches|")/i;

export function parseDimensionsCm(text: string): { l?: number; w?: number; h?: number } | undefined {
  const m = text.match(DIM_RE);
  if (!m) return undefined;
  const unit = m[4].toLowerCase();
  const f = unit === 'mm' ? 0.1 : unit.startsWith('in') || unit === '"' ? 2.54 : 1;
  return { l: +m[1] * f, w: +m[2] * f, h: +m[3] * f };
}

export function parseWeightG(text: string): number | undefined {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|grams?|lbs?|pounds?|oz)\b/i);
  if (!m) return undefined;
  const v = +m[1];
  const u = m[2].toLowerCase();
  if (u === 'kg') return v * 1000;
  if (u.startsWith('lb') || u.startsWith('pound')) return Math.round(v * 453.6);
  if (u === 'oz') return Math.round(v * 28.35);
  return v;
}

export function parsePriceGBP(text: string): number | undefined {
  const m = text.match(/(?:£|GBP\s*)(\d+(?:[.,]\d{2})?)/);
  return m ? Number(m[1].replace(',', '.')) : undefined;
}

export function textOf(doc: Document, selectors: string[]): string | undefined {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    const t = el?.textContent?.trim();
    if (t) return t;
  }
  return undefined;
}

export function specValue(doc: Document, labels: string[], rowSelector: string, dtSel: string, ddSel: string): string | undefined {
  const want = labels.map((l) => l.toLowerCase());
  for (const row of Array.from(doc.querySelectorAll(rowSelector))) {
    const key = row.querySelector(dtSel)?.textContent?.trim().toLowerCase() ?? '';
    if (want.includes(key)) {
      const val = row.querySelector(ddSel)?.textContent?.trim();
      if (val) return val;
    }
  }
  return undefined;
}
```

`src/adapters/ebay.ts`:
```ts
import type { Listing } from '../types';
import type { Adapter } from './index';
import { parseDimensionsCm, parsePriceGBP, parseWeightG, specValue, textOf } from './shared';

export const ebayAdapter: Adapter = {
  site: 'ebay',
  matches: (url) => /https:\/\/www\.ebay\.(co\.uk|com)\/itm\//.test(url),
  extract(doc, url) {
    const missing: string[] = [];
    const title = textOf(doc, ['h1.x-item-title__mainTitle span', 'h1.x-item-title__mainTitle', '#itemTitle']) ?? '';
    if (!title) missing.push('title');

    const priceText = textOf(doc, ['.x-price-primary span', '#prcIsum']);
    const priceGBP = priceText ? parsePriceGBP(priceText) : undefined;
    if (priceGBP === undefined) missing.push('price');

    const spec = (labels: string[]) =>
      specValue(doc, labels, 'dl.ux-labels-values', 'dt', 'dd');
    const brand = spec(['brand']);
    if (!brand) missing.push('brand');
    const material = spec(['material']);

    const lNum = (s?: string) => (s ? parseDimensionsCm(`${s} x ${s} x ${s} cm`)?.l : undefined);
    const len = lNum(spec(['item length', 'length']));
    const wid = lNum(spec(['item width', 'width']));
    const hei = lNum(spec(['item height', 'height', 'item depth', 'depth']));
    const dimensionsCm = len !== undefined || wid !== undefined || hei !== undefined
      ? { l: len, w: wid, h: hei } : undefined;
    if (!dimensionsCm) missing.push('dimensions');

    const weightText = spec(['item weight', 'weight']);
    const weightG = weightText ? parseWeightG(weightText) : undefined;
    if (weightG === undefined) missing.push('weight');

    const og = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
    const images = [
      ...(og ? [og] : []),
      ...Array.from(doc.querySelectorAll<HTMLImageElement>('.ux-image-carousel-item img'))
        .map((i) => i.src).filter(Boolean),
    ].slice(0, 5);
    if (images.length === 0) missing.push('images');

    const description = doc.querySelector('.d-item-description')?.textContent?.trim() || undefined;
    if (!description) missing.push('description');

    return {
      site: 'ebay', url, title,
      brand: brand && brand.toLowerCase() !== 'unbranded' ? brand : undefined,
      description, priceGBP, images, dimensionsCm, weightG, material, missing,
    };
  },
};
```

Note on the `lNum` helper: eBay gives per-axis values like "20 cm"; feeding "20 cm x 20 cm x 20 cm" through `parseDimensionsCm` reuses one parser. If this reads poorly, extract a `parseSingleLengthCm` in `shared.ts` instead — either way, tests stay green.

`src/adapters/index.ts`:
```ts
import type { Listing, Site } from '../types';
import { ebayAdapter } from './ebay';

export interface Adapter {
  site: Site;
  matches(url: string): boolean;
  extract(doc: Document, url: string): Listing;
}

const adapters: Adapter[] = [ebayAdapter];

export function registerAdapter(a: Adapter): void {
  adapters.push(a);
}

export function pickAdapter(url: string): Adapter | undefined {
  return adapters.find((a) => a.matches(url));
}
```
(Task 10 will import aliexpress/amazon adapters into this file directly instead of using `registerAdapter` from content code — keep `registerAdapter` exported for tests.)

- [ ] **Step 5: Run tests, verify PASS**

Run: `npx vitest run tests/adapters && npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: adapter framework, parsing helpers and eBay UK adapter"
```

---

### Task 10: AliExpress + Amazon adapters

**Files:**
- Create: `src/adapters/aliexpress.ts`, `src/adapters/amazon.ts`
- Modify: `src/adapters/index.ts` (add both to the `adapters` array)
- Create: `tests/fixtures/aliexpress-item.html`, `tests/fixtures/amazon-item.html`
- Test: `tests/adapters/aliexpress.test.ts`, `tests/adapters/amazon.test.ts`

**Interfaces:**
- Consumes: `Adapter`, helpers from `shared.ts`.
- Produces: `aliexpressAdapter: Adapter`, `amazonAdapter: Adapter`. Amazon `matches()` must require `/dp/` or `/gp/product/` in the URL.

- [ ] **Step 1: Write fixtures**

`tests/fixtures/aliexpress-item.html`:
```html
<!doctype html><html><head><meta charset="utf-8">
<meta property="og:title" content="Stainless Steel Folding Pocket Knife Outdoor Camping Tool">
<meta property="og:image" content="https://ae01.alicdn.com/kf/abc.jpg">
</head><body>
<h1 data-pl="product-title">Stainless Steel Folding Pocket Knife Outdoor Camping Tool</h1>
<div class="price--currentPriceText--V8_y_b5">£3.42</div>
<div id="nav-specification">
  <ul><li><span>Brand Name:</span><span>NOENNULL</span></li>
  <li><span>Material:</span><span>Stainless Steel</span></li></ul>
</div>
<div id="product-description"><p>Sharp blade folding knife, size 16 x 3 x 2 cm, weight 120 g.</p></div>
</body></html>
```

`tests/fixtures/amazon-item.html`:
```html
<!doctype html><html><head><meta charset="utf-8"></head><body>
<span id="productTitle">  LEGO Technic Monster Jam Truck 42119  </span>
<a id="bylineInfo" href="/stores/LEGO">Visit the LEGO Store</a>
<span class="a-price"><span class="a-offscreen">£17.99</span></span>
<img id="landingImage" src="https://m.media-amazon.com/images/I/x.jpg">
<table id="productDetails_techSpec_section_1">
  <tr><th> Product Dimensions </th><td> 26.2 x 14.1 x 7.05 cm; 320 g </td></tr>
  <tr><th> Material </th><td> Plastic </td></tr>
</table>
<div id="productDescription"><p>Buildable monster truck toy for children.</p></div>
</body></html>
```

- [ ] **Step 2: Write failing tests**

`tests/adapters/aliexpress.test.ts`:
```ts
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aliexpressAdapter } from '../../src/adapters/aliexpress';

describe('aliexpressAdapter', () => {
  const doc = new DOMParser().parseFromString(
    readFileSync('tests/fixtures/aliexpress-item.html', 'utf8'), 'text/html');
  const url = 'https://www.aliexpress.com/item/1005001234567.html';

  it('matches item pages', () => {
    expect(aliexpressAdapter.matches(url)).toBe(true);
    expect(aliexpressAdapter.matches('https://www.aliexpress.com/w/wholesale-knife.html')).toBe(false);
  });
  it('extracts title, price, brand, material, dims from description', () => {
    const l = aliexpressAdapter.extract(doc, url);
    expect(l.title).toMatch(/Folding Pocket Knife/);
    expect(l.priceGBP).toBe(3.42);
    expect(l.brand).toBe('NOENNULL');
    expect(l.material).toBe('Stainless Steel');
    expect(l.dimensionsCm).toEqual({ l: 16, w: 3, h: 2 });
    expect(l.weightG).toBe(120);
  });
});
```

`tests/adapters/amazon.test.ts`:
```ts
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { amazonAdapter } from '../../src/adapters/amazon';

describe('amazonAdapter', () => {
  const doc = new DOMParser().parseFromString(
    readFileSync('tests/fixtures/amazon-item.html', 'utf8'), 'text/html');
  const url = 'https://www.amazon.co.uk/dp/B08XYZ1234';

  it('matches only product pages', () => {
    expect(amazonAdapter.matches(url)).toBe(true);
    expect(amazonAdapter.matches('https://www.amazon.co.uk/s?k=lego')).toBe(false);
  });
  it('extracts title, brand from byline, price, dims+weight from one cell', () => {
    const l = amazonAdapter.extract(doc, url);
    expect(l.title).toBe('LEGO Technic Monster Jam Truck 42119');
    expect(l.brand).toBe('LEGO');
    expect(l.priceGBP).toBe(17.99);
    expect(l.dimensionsCm?.l).toBeCloseTo(26.2);
    expect(l.weightG).toBe(320);
    expect(l.material).toBe('Plastic');
  });
});
```

- [ ] **Step 3: Run, verify FAIL**, then **Step 4: Implement**

`src/adapters/aliexpress.ts`:
```ts
import type { Listing } from '../types';
import type { Adapter } from './index';
import { parseDimensionsCm, parsePriceGBP, parseWeightG, textOf } from './shared';

function specPair(doc: Document, label: string): string | undefined {
  for (const li of Array.from(doc.querySelectorAll('#nav-specification li, .specification--prop--Jh28bKu'))) {
    const spans = li.querySelectorAll('span');
    if (spans.length >= 2 && spans[0].textContent?.toLowerCase().includes(label)) {
      return spans[1].textContent?.trim();
    }
  }
  return undefined;
}

export const aliexpressAdapter: Adapter = {
  site: 'aliexpress',
  matches: (url) => /https:\/\/[^/]*aliexpress\.(com|us)\/item\//.test(url),
  extract(doc, url) {
    const missing: string[] = [];
    const title =
      textOf(doc, ['h1[data-pl="product-title"]', 'h1.product-title-text']) ??
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? '';
    if (!title) missing.push('title');

    const priceText = textOf(doc, ['[class*="currentPriceText"]', '.product-price-value']);
    const priceGBP = priceText ? parsePriceGBP(priceText) : undefined;
    if (priceGBP === undefined) missing.push('price');

    const brand = specPair(doc, 'brand');
    if (!brand) missing.push('brand');
    const material = specPair(doc, 'material');

    const description = textOf(doc, ['#product-description', '.description--wrap--LscZ0He']) ?? undefined;
    if (!description) missing.push('description');

    const dimSource = [specPair(doc, 'size') ?? '', description ?? ''].join(' ');
    const dimensionsCm = parseDimensionsCm(dimSource);
    if (!dimensionsCm) missing.push('dimensions');
    const weightG = parseWeightG([specPair(doc, 'weight') ?? '', description ?? ''].join(' '));
    if (weightG === undefined) missing.push('weight');

    const og = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
    const images = og ? [og] : [];
    if (images.length === 0) missing.push('images');

    const cleanBrand = brand && !/^(no|none|oem|no brand)$/i.test(brand) ? brand : undefined;
    return { site: 'aliexpress', url, title, brand: cleanBrand, description, priceGBP, images, dimensionsCm, weightG, material, missing };
  },
};
```

`src/adapters/amazon.ts`:
```ts
import type { Listing } from '../types';
import type { Adapter } from './index';
import { parseDimensionsCm, parsePriceGBP, parseWeightG, textOf } from './shared';

export const amazonAdapter: Adapter = {
  site: 'amazon',
  matches: (url) => /https:\/\/www\.amazon\.(co\.uk|com)\/(?:.*\/)?(dp|gp\/product)\//.test(url),
  extract(doc, url) {
    const missing: string[] = [];
    const title = textOf(doc, ['#productTitle']) ?? '';
    if (!title) missing.push('title');

    const byline = textOf(doc, ['#bylineInfo']);
    const brand = byline?.replace(/^(visit the|brand:)\s*/i, '').replace(/\s*store$/i, '').trim() || undefined;
    if (!brand) missing.push('brand');

    const priceText = textOf(doc, ['.a-price .a-offscreen', '#priceblock_ourprice']);
    const priceGBP = priceText ? parsePriceGBP(priceText) : undefined;
    if (priceGBP === undefined) missing.push('price');

    let dimText: string | undefined;
    let material: string | undefined;
    for (const row of Array.from(doc.querySelectorAll('#productDetails_techSpec_section_1 tr, #detailBullets_feature_div li'))) {
      const text = row.textContent ?? '';
      if (/dimensions/i.test(text)) dimText = text;
      if (/^\s*material/i.test(text.trim())) material = text.split(/\n|:/).pop()?.trim();
    }
    const dimensionsCm = dimText ? parseDimensionsCm(dimText) : undefined;
    if (!dimensionsCm) missing.push('dimensions');
    const weightG = dimText ? parseWeightG(dimText) : undefined;
    if (weightG === undefined) missing.push('weight');

    const description = textOf(doc, ['#productDescription', '#feature-bullets']) ?? undefined;
    if (!description) missing.push('description');

    const img = doc.querySelector<HTMLImageElement>('#landingImage')?.src;
    const images = img ? [img] : [];
    if (images.length === 0) missing.push('images');

    return { site: 'amazon', url, title, brand, description, priceGBP, images, dimensionsCm, weightG, material, missing };
  },
};
```

Modify `src/adapters/index.ts` — change the adapters array:
```ts
import { aliexpressAdapter } from './aliexpress';
import { amazonAdapter } from './amazon';
// ...
const adapters: Adapter[] = [ebayAdapter, aliexpressAdapter, amazonAdapter];
```
(Watch for the import cycle `index.ts ↔ ebay.ts`: `Adapter` is a type-only import in the adapter files, so `import type { Adapter } from './index'` is erased at build time and safe. Keep it `import type`.)

- [ ] **Step 5: Run tests, verify PASS**

Run: `npx vitest run tests/adapters && npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: AliExpress and Amazon adapters"
```

---

### Task 11: Service worker — rules refresh, messages, history

**Files:**
- Create: `src/worker/index.ts` (replace stub), `src/worker/messages.ts`
- Test: `tests/worker/messages.test.ts` (pure helpers only)

**Interfaces:**
- Produces message protocol (used by content script Task 12 and options Task 13):

```ts
// src/worker/messages.ts — shared protocol types + pure helpers
import type { Listing, RulesPack, Level } from '../types';

export interface HistoryEntry {
  url: string; site: string; title: string; overall: Level;
  firedRuleIds: string[]; at: number;
}
export interface Settings { apiKey?: string; curatedUrl?: string; }
export interface RulesStatus {
  officialCount: number; officialFetchedAt: number;
  curatedVersion: string; usingRemoteCurated: boolean;
}
export type WorkerRequest =
  | { type: 'get-rules' }
  | { type: 'log-check'; entry: HistoryEntry }
  | { type: 'deep-check'; listing: Listing }
  | { type: 'refresh-rules' }
  | { type: 'get-status' }
  | { type: 'get-history' }
  | { type: 'clear-history' };

export function historyToCsv(entries: HistoryEntry[]): string;
export function pushHistory(entries: HistoryEntry[], entry: HistoryEntry, cap?: number): HistoryEntry[];
```

- Storage keys (chrome.storage.local): `officialVero` = `{ brands: VeroBrand[], fetchedAt: number }` · `curatedPack` = remote JSON · `localOverrides` = `LocalOverrides` · `history` = `HistoryEntry[]` · `settings` = `Settings`.
- Alarms: `refresh-official` weekly (period 10080 min), `refresh-curated` daily (1440 min); both also run on `chrome.runtime.onInstalled`.

- [ ] **Step 1: Write failing tests for the pure helpers**

`tests/worker/messages.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { historyToCsv, pushHistory, type HistoryEntry } from '../../src/worker/messages';

const e = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  url: 'https://x/item/1', site: 'aliexpress', title: 'Knife, "sharp"',
  overall: 'danger', firedRuleIds: ['class:knives'], at: 1755300000000, ...over,
});

describe('historyToCsv', () => {
  it('emits pipeline-compatible header and escapes quotes/commas', () => {
    const csv = historyToCsv([e()]);
    const [header, row] = csv.trim().split('\n');
    expect(header).toBe('timestamp,site,title,url,verdict,failure_mode,rules');
    expect(row).toContain('"Knife, ""sharp"""');
    expect(row).toContain('vero'); // danger with vero/prohibited rule → failure_mode vero
  });
});

describe('pushHistory', () => {
  it('caps at the limit, dropping oldest', () => {
    const list = Array.from({ length: 5 }, (_, i) => e({ at: i }));
    const out = pushHistory(list, e({ at: 99 }), 5);
    expect(out).toHaveLength(5);
    expect(out[out.length - 1].at).toBe(99);
    expect(out[0].at).toBe(1);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**, then **Step 3: Implement**

`src/worker/messages.ts`:
```ts
import type { Level, Listing } from '../types';

export interface HistoryEntry {
  url: string; site: string; title: string; overall: Level;
  firedRuleIds: string[]; at: number;
}
export interface Settings { apiKey?: string; curatedUrl?: string; }
export interface RulesStatus {
  officialCount: number; officialFetchedAt: number;
  curatedVersion: string; usingRemoteCurated: boolean;
}
export type WorkerRequest =
  | { type: 'get-rules' }
  | { type: 'log-check'; entry: HistoryEntry }
  | { type: 'deep-check'; listing: Listing }
  | { type: 'refresh-rules' }
  | { type: 'get-status' }
  | { type: 'get-history' }
  | { type: 'clear-history' };

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function failureMode(entry: HistoryEntry): string {
  if (entry.overall !== 'danger') return '';
  return entry.firedRuleIds.some((r) => r.startsWith('vero') || r.startsWith('class:'))
    ? 'vero'
    : 'other';
}

export function historyToCsv(entries: HistoryEntry[]): string {
  const rows = entries.map((e) =>
    [
      new Date(e.at).toISOString(), e.site, csvCell(e.title), csvCell(e.url),
      e.overall, failureMode(e), csvCell(e.firedRuleIds.join(';')),
    ].join(','),
  );
  return ['timestamp,site,title,url,verdict,failure_mode,rules', ...rows].join('\n') + '\n';
}

export function pushHistory(entries: HistoryEntry[], entry: HistoryEntry, cap = 2000): HistoryEntry[] {
  const out = [...entries, entry];
  return out.length > cap ? out.slice(out.length - cap) : out;
}
```

`src/worker/index.ts` (full replacement of the stub):
```ts
import { bundledPack } from '../rules/bundled/index';
import { mergeRules, type LocalOverrides } from '../rules/merge';
import { parseVeroPage } from '../rules/veroScraper';
import type { RulesPack, VeroBrand } from '../types';
import { deepCheck } from './ai';
import { historyToCsv, pushHistory, type HistoryEntry, type Settings, type WorkerRequest } from './messages';

const VERO_URL = 'https://www.ebay.co.uk/sellercentre/protection/verified-rights-owner-profiles';

async function store<T>(key: string): Promise<T | undefined> {
  const o = await chrome.storage.local.get(key);
  return o[key] as T | undefined;
}

async function currentPack(): Promise<RulesPack> {
  const official = await store<{ brands: VeroBrand[]; fetchedAt: number }>('officialVero');
  const curated = await store<unknown>('curatedPack');
  const local = await store<LocalOverrides>('localOverrides');
  return mergeRules(bundledPack(), official, curated, local);
}

async function refreshOfficial(): Promise<void> {
  try {
    const res = await fetch(VERO_URL, { credentials: 'omit' });
    if (!res.ok) return;
    const brands = parseVeroPage(await res.text());
    if (brands.length > 500) {
      await chrome.storage.local.set({ officialVero: { brands, fetchedAt: Date.now() } });
    }
  } catch { /* keep cached list; footer shows its age */ }
}

async function refreshCurated(): Promise<void> {
  const settings = (await store<Settings>('settings')) ?? {};
  if (!settings.curatedUrl) return;
  try {
    const res = await fetch(settings.curatedUrl, { cache: 'no-cache' });
    if (!res.ok) return;
    const pack = await res.json();
    if (pack && typeof pack.version === 'string' && Array.isArray(pack.classes)) {
      await chrome.storage.local.set({ curatedPack: pack });
    }
  } catch { /* bundled fallback stands */ }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('refresh-official', { periodInMinutes: 10080, delayInMinutes: 1 });
  chrome.alarms.create('refresh-curated', { periodInMinutes: 1440, delayInMinutes: 2 });
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'refresh-official') void refreshOfficial();
  if (a.name === 'refresh-curated') void refreshCurated();
});

chrome.runtime.onMessage.addListener((msg: WorkerRequest, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'get-rules':
        sendResponse({ pack: await currentPack() });
        break;
      case 'log-check': {
        const history = (await store<HistoryEntry[]>('history')) ?? [];
        await chrome.storage.local.set({ history: pushHistory(history, msg.entry) });
        sendResponse({ ok: true });
        break;
      }
      case 'deep-check': {
        const settings = (await store<Settings>('settings')) ?? {};
        if (!settings.apiKey) { sendResponse({ error: 'no-key' }); break; }
        try {
          sendResponse({ result: await deepCheck(msg.listing, settings.apiKey) });
        } catch (e) {
          sendResponse({ error: String(e) });
        }
        break;
      }
      case 'refresh-rules':
        await refreshOfficial();
        await refreshCurated();
        sendResponse({ ok: true });
        break;
      case 'get-status': {
        const official = await store<{ brands: VeroBrand[]; fetchedAt: number }>('officialVero');
        const curated = await store<{ version?: string }>('curatedPack');
        const pack = await currentPack();
        sendResponse({
          officialCount: official?.brands.length ?? pack.veroBrands.filter((b) => b.source === 'official').length,
          officialFetchedAt: official?.fetchedAt ?? 0,
          curatedVersion: pack.version,
          usingRemoteCurated: Boolean(curated),
        });
        break;
      }
      case 'get-history':
        sendResponse({
          history: (await store<HistoryEntry[]>('history')) ?? [],
          csv: historyToCsv((await store<HistoryEntry[]>('history')) ?? []),
        });
        break;
      case 'clear-history':
        await chrome.storage.local.set({ history: [] });
        sendResponse({ ok: true });
        break;
    }
  })();
  return true; // async response
});
```

Create a temporary `src/worker/ai.ts` stub so the worker compiles (Task 14 replaces it):
```ts
import type { Listing } from '../types';
export interface DeepCheckResult {
  brand?: string; logoLikely: boolean; concerns: string[];
  recommendation: 'clear' | 'caution' | 'danger'; reasoning: string;
}
export async function deepCheck(_listing: Listing, _apiKey: string): Promise<DeepCheckResult> {
  throw new Error('deep check not implemented yet');
}
```

- [ ] **Step 4: Run tests + build, verify PASS**

Run: `npx vitest run tests/worker && npm run typecheck && npm run build`
Expected: tests pass, build emits `dist/worker.js` with no errors.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: service worker — layered rules refresh, message protocol, history"
```

---

### Task 12: Content script + verdict panel (the "ultra" frontend)

**Files:**
- Create: `src/panel/panel.ts`, replace `src/content/main.ts`
- Test: `tests/panel/panel.test.ts`

**Interfaces:**
- Consumes: `pickAdapter`, `evaluate`, worker messages `get-rules` / `log-check` / `deep-check`.
- Produces: `renderPanel(container: HTMLElement, verdict: Verdict, opts: PanelOptions): void` where

```ts
export interface PanelOptions {
  rulesAgeLabel: string;                    // e.g. "VeRO list: 2 days old · rules 2026-08-16.1"
  partial: boolean;                         // listing.missing.length > 0
  onDeepCheck?: () => Promise<{ recommendation: string; reasoning: string; concerns: string[] } | { error: string }>;
}
```

**Design requirements (this is the polish the user asked for — implement all of it):**
- Shadow DOM (`mode: 'open'` so tests can inspect), self-contained CSS, system font stack, `z-index: 2147483646`.
- Collapsed state: a pill badge fixed bottom-right — colored dot + "VeRO Detect" + overall word (CLEAR / CAUTION / DO NOT LIST / CHECK MANUALLY). Danger state pulses (CSS `@keyframes` glow). Hover lifts it (translateY + shadow).
- Expanded card (~360 px wide, max-height 70vh, overflow-y auto): dark glassmorphism — `background: rgba(17,24,39,0.92)`, `backdrop-filter: blur(14px) saturate(140%)`, 16 px radius, 1 px rgba border, layered shadow. Header: big status icon in a tinted circle, verdict word, one-line summary ("2 blockers, 1 warning"). Six category rows, each: emoji icon, category name, status chip; rows with hits expand on click (max-height transition) to show each hit's `detail`, an "→ What to do" line (`action`), and a "policy ↗" link when present. Colors: clear `#34d399`, caution `#fbbf24`, danger `#f87171`, unknown `#9ca3af`.
- Category icons: vero 🛡️ · prohibited 🚫 · branded 🏷️ · size 📦 · sensitive ⚠️ · fragile 🥂.
- If `opts.partial`: an amber strip under the header — "Partial check — some fields couldn't be read. Verify manually."
- Footer: rules age label · disclaimer "Checks known rules only — a green result is not a guarantee." · Deep-check button (only when `onDeepCheck` given) with loading spinner state; result (or "Add your API key in Options" on `{error:'no-key'}`) renders in an inset box.
- Entrance animation: card scales/fades in from the badge (transform-origin bottom right, 180 ms cubic-bezier(0.32,0.72,0,1)). Re-render on SPA nav must replace, not duplicate, the host node (fixed host id `vero-detect-host`).

- [ ] **Step 1: Write failing tests**

`tests/panel/panel.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderPanel } from '../../src/panel/panel';
import type { Verdict } from '../../src/types';

const verdict: Verdict = {
  overall: 'danger',
  categories: [
    { category: 'vero', level: 'danger', hits: [{ ruleId: 'vero:dyson', level: 'danger', label: 'Dyson Limited', detail: 'VeRO participant', action: 'Do not list', link: 'https://x/dyson.pdf' }] },
    { category: 'prohibited', level: 'clear', hits: [] },
    { category: 'branded', level: 'clear', hits: [] },
    { category: 'size', level: 'unknown', hits: [], note: 'Size unknown — check manually.' },
    { category: 'sensitive', level: 'clear', hits: [] },
    { category: 'fragile', level: 'clear', hits: [] },
  ],
  rulesVersion: '2026-08-16.1', rulesFetchedAt: 0, checkedAt: Date.now(),
};

describe('renderPanel', () => {
  it('renders badge with overall verdict into a shadow root', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    renderPanel(host, verdict, { rulesAgeLabel: 'rules 2026-08-16.1', partial: true });
    const sr = host.shadowRoot!;
    expect(sr.querySelector('.badge')!.textContent).toMatch(/DO NOT LIST/i);
    expect(sr.querySelectorAll('.cat-row')).toHaveLength(6);
    expect(sr.textContent).toMatch(/Partial check/);
    expect(sr.textContent).toMatch(/not a guarantee/i);
  });
  it('expands a category row to show hit details and policy link', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    renderPanel(host, verdict, { rulesAgeLabel: 'x', partial: false });
    const sr = host.shadowRoot!;
    (sr.querySelector('.cat-row[data-cat="vero"]') as HTMLElement).click();
    expect(sr.querySelector('.cat-row[data-cat="vero"] .hits')!.textContent).toMatch(/Do not list/);
    expect(sr.querySelector('.cat-row[data-cat="vero"] a')!.getAttribute('href')).toBe('https://x/dyson.pdf');
  });
  it('re-render replaces content, not duplicates', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    renderPanel(host, verdict, { rulesAgeLabel: 'x', partial: false });
    renderPanel(host, verdict, { rulesAgeLabel: 'x', partial: false });
    expect(host.shadowRoot!.querySelectorAll('.badge')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**, then **Step 3: Implement `src/panel/panel.ts`**

Implement per the design requirements. Structure (complete skeleton — fill CSS to match every requirement above):

```ts
import type { CategoryId, Level, Verdict } from '../types';

export interface PanelOptions {
  rulesAgeLabel: string;
  partial: boolean;
  onDeepCheck?: () => Promise<{ recommendation: string; reasoning: string; concerns: string[] } | { error: string }>;
}

const META: Record<CategoryId, { icon: string; name: string }> = {
  vero: { icon: '🛡️', name: 'VeRO brand' },
  prohibited: { icon: '🚫', name: 'Prohibited / restricted' },
  branded: { icon: '🏷️', name: 'Branded item' },
  size: { icon: '📦', name: 'Size & weight' },
  sensitive: { icon: '⚠️', name: 'Sensitive item' },
  fragile: { icon: '🥂', name: 'Fragile' },
};
const LEVEL_META: Record<Level, { word: string; chip: string; color: string }> = {
  clear: { word: 'CLEAR', chip: 'No known flags', color: '#34d399' },
  caution: { word: 'CAUTION', chip: 'Conditions', color: '#fbbf24' },
  danger: { word: 'DO NOT LIST', chip: 'Blocked', color: '#f87171' },
  unknown: { word: 'CHECK MANUALLY', chip: 'Unknown', color: '#9ca3af' },
};

const CSS = `/* full stylesheet per design requirements — badge, card, rows, chips,
  glassmorphism, pulse keyframes, entrance animation, transitions, scrollbar styling */`;

export function renderPanel(container: HTMLElement, verdict: Verdict, opts: PanelOptions): void {
  const sr = container.shadowRoot ?? container.attachShadow({ mode: 'open' });
  sr.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = CSS;
  sr.appendChild(style);

  // badge (collapsed) — toggles .open on the card
  // card: header (icon circle, verdict word, summary counts), optional partial strip,
  //       six .cat-row[data-cat] with click-to-expand .hits,
  //       footer (rulesAgeLabel · disclaimer · deep-check button when opts.onDeepCheck)
  // Build with createElement/append — no innerHTML for hit text (listing data is untrusted).
  // Hit text must be set via textContent; the only innerHTML use is the static CSS/style block.
  // ... (implementation)
}
```

**Security note (hard requirement):** listing-derived strings (title, brand, hit details containing matched text) go into the DOM via `textContent` only — never string-concatenated into `innerHTML`. A malicious product title must not become markup.

Replace `src/content/main.ts`:
```ts
import { pickAdapter } from '../adapters/index';
import { evaluate } from '../engine/evaluate';
import { renderPanel } from '../panel/panel';
import type { Listing, RulesPack, Verdict } from '../types';
import type { HistoryEntry, WorkerRequest } from '../worker/messages';

const HOST_ID = 'vero-detect-host';

function send<T>(msg: WorkerRequest): Promise<T> {
  return chrome.runtime.sendMessage(msg);
}

function rulesAgeLabel(pack: RulesPack): string {
  const age = pack.fetchedAt
    ? `VeRO list: ${Math.max(0, Math.round((Date.now() - pack.fetchedAt) / 86400000))} days old`
    : 'VeRO list: bundled copy';
  return `${age} · rules ${pack.version}`;
}

async function run(): Promise<void> {
  const adapter = pickAdapter(location.href);
  if (!adapter) return;

  // Retry extraction briefly — SPA pages hydrate late
  let listing: Listing | undefined;
  for (let i = 0; i < 10; i++) {
    listing = adapter.extract(document, location.href);
    if (listing.title) break;
    await new Promise((r) => setTimeout(r, 800));
  }
  if (!listing || !listing.title) return;

  const { pack } = await send<{ pack: RulesPack }>({ type: 'get-rules' });
  const verdict: Verdict = evaluate(listing, pack);

  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    document.documentElement.appendChild(host);
  }
  renderPanel(host, verdict, {
    rulesAgeLabel: rulesAgeLabel(pack),
    partial: listing.missing.length > 0,
    onDeepCheck: async () => {
      const res = await send<{ result?: never; error?: string } & Record<string, unknown>>({
        type: 'deep-check', listing: listing!,
      });
      return (res.result ?? res) as never;
    },
  });

  const entry: HistoryEntry = {
    url: listing.url, site: listing.site, title: listing.title,
    overall: verdict.overall,
    firedRuleIds: verdict.categories.flatMap((c) => c.hits.map((h) => h.ruleId)),
    at: Date.now(),
  };
  void send({ type: 'log-check', entry });
}

let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    void run();
  }
}, 1000);
void run();
```

- [ ] **Step 4: Run tests + build, verify PASS**

Run: `npx vitest run tests/panel && npm run typecheck && npm run build`

- [ ] **Step 5: Manual smoke test in Chrome**

Load `dist/` unpacked (chrome://extensions → Developer mode → Load unpacked). Visit a real AliExpress knife listing and an eBay Dyson filter listing. Expected: badge appears bottom-right, opens to a glass card, categories expand, danger badge pulses. Fix visual defects now — this is the "ultra polish" gate; spend real time here (spacing, contrast, animation timing) before committing.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: content script and glassmorphism verdict panel"
```

---

### Task 13: Options page

**Files:**
- Replace: `src/options/options.html`, `src/options/options.ts`

**Interfaces:**
- Consumes: worker messages `get-status`, `refresh-rules`, `get-history`, `clear-history`; `chrome.storage.local` keys `settings`, `localOverrides`.

**Layout (same visual language as the panel — dark glass, same palette):**
1. **Rules status** card: official brand count + fetched date, curated version, remote-curated badge, "Refresh now" button.
2. **Deep check** card: password-type input for API key (stored in `settings.apiKey`), explanatory line "Optional. Uses your own Anthropic API key — the free tool never requires one."
3. **Curated pack URL** card: text input for `settings.curatedUrl` + "This is the team rules feed (GitHub raw URL). Leave blank to use built-in rules."
4. **My overrides** card: two textareas (one brand per line) for `localOverrides.addBrands` / `ignoreBrands`, save button.
5. **History** card: total checks count, "Export CSV" (downloads via Blob + `URL.createObjectURL`, filename `vero-detect-history.csv`), "Clear".

- [ ] **Step 1: Implement** `options.html` (semantic structure + full inline `<style>`) and `options.ts` (wire every control; load current values on open; save on change with a brief "Saved ✓" toast).

Core of `options.ts` (complete the DOM wiring around it):
```ts
import type { Settings } from '../worker/messages';
import type { LocalOverrides } from '../rules/merge';

async function load(): Promise<{ settings: Settings; overrides: LocalOverrides }> {
  const o = await chrome.storage.local.get(['settings', 'localOverrides']);
  return { settings: o.settings ?? {}, overrides: o.localOverrides ?? {} };
}
async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const { settings } = await load();
  await chrome.storage.local.set({ settings: { ...settings, ...patch } });
}
async function saveOverrides(overrides: LocalOverrides): Promise<void> {
  await chrome.storage.local.set({ localOverrides: overrides });
}
function linesToArray(v: string): string[] {
  return v.split('\n').map((s) => s.trim()).filter(Boolean);
}
async function exportCsv(): Promise<void> {
  const { csv } = await chrome.runtime.sendMessage({ type: 'get-history' });
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'vero-detect-history.csv' });
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run build`, reload the unpacked extension, open the options page. Expected: all five cards render, values persist across reloads, Refresh now updates the official count, CSV downloads.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: options page — settings, overrides, rules status, CSV export"
```

---

### Task 14: AI deep check + packaging + install guide

**Files:**
- Replace: `src/worker/ai.ts`
- Create: `scripts/package.sh`, `INSTALL.md`
- Test: `tests/worker/ai.test.ts`

**Interfaces:**
- Produces: real `deepCheck(listing: Listing, apiKey: string): Promise<DeepCheckResult>` (same signature as the Task 11 stub) and exported `buildRequestBody(listing: Listing): object` for testing.

- [ ] **Step 1: Write failing test** (pure request-builder + response parsing; no network)

`tests/worker/ai.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildRequestBody, parseDeepCheckResponse } from '../../src/worker/ai';
import type { Listing } from '../../src/types';

const listing: Listing = {
  site: 'aliexpress', url: 'https://x', title: 'Cool watch',
  description: 'looks great', images: ['https://img/1.jpg', 'https://img/2.jpg', 'https://img/3.jpg', 'https://img/4.jpg'],
  missing: [],
};

describe('buildRequestBody', () => {
  const body = buildRequestBody(listing) as any;
  it('uses the pinned model and caps images at 3', () => {
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    const imgs = body.messages[0].content.filter((c: any) => c.type === 'image');
    expect(imgs).toHaveLength(3);
    expect(imgs[0].source).toEqual({ type: 'url', url: 'https://img/1.jpg' });
  });
  it('includes the title in the prompt text', () => {
    const text = body.messages[0].content.find((c: any) => c.type === 'text').text;
    expect(text).toContain('Cool watch');
  });
});

describe('parseDeepCheckResponse', () => {
  it('extracts JSON even when wrapped in prose', () => {
    const r = parseDeepCheckResponse('Sure: {"logoLikely":true,"concerns":["Rolex crown logo visible"],"recommendation":"danger","reasoning":"logo"}');
    expect(r.recommendation).toBe('danger');
    expect(r.logoLikely).toBe(true);
  });
  it('falls back to caution on unparseable output', () => {
    const r = parseDeepCheckResponse('cannot analyze');
    expect(r.recommendation).toBe('caution');
    expect(r.reasoning).toMatch(/could not parse/i);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**, then **Step 3: Implement `src/worker/ai.ts`**

```ts
import type { Listing } from '../types';

export interface DeepCheckResult {
  brand?: string; logoLikely: boolean; concerns: string[];
  recommendation: 'clear' | 'caution' | 'danger'; reasoning: string;
}

const PROMPT = (l: Listing) => `You are a dropshipping compliance checker for eBay UK.
Analyze this product listing and its images.
Title: ${l.title}
Brand field: ${l.brand ?? 'none'}
Description: ${(l.description ?? '').slice(0, 800)}

Check: (1) is a brand implied even without being named (trade dress, model names, lookalike design)?
(2) is any brand logo or trademark visible in the images? (3) does the item fall in a restricted
class (blade, weapon, medical, safety-critical, adult, battery)?
Reply with ONLY a JSON object: {"brand": string|null, "logoLikely": boolean,
"concerns": string[], "recommendation": "clear"|"caution"|"danger", "reasoning": string}`;

export function buildRequestBody(l: Listing): object {
  return {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: PROMPT(l) },
        ...l.images.slice(0, 3).map((url) => ({ type: 'image', source: { type: 'url', url } })),
      ],
    }],
  };
}

export function parseDeepCheckResponse(text: string): DeepCheckResult {
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      return {
        brand: j.brand ?? undefined,
        logoLikely: Boolean(j.logoLikely),
        concerns: Array.isArray(j.concerns) ? j.concerns.map(String) : [],
        recommendation: ['clear', 'caution', 'danger'].includes(j.recommendation) ? j.recommendation : 'caution',
        reasoning: String(j.reasoning ?? ''),
      };
    } catch { /* fall through */ }
  }
  return { logoLikely: false, concerns: [], recommendation: 'caution', reasoning: 'Could not parse AI response — treat as caution and check manually.' };
}

export async function deepCheck(listing: Listing, apiKey: string): Promise<DeepCheckResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(buildRequestBody(listing)),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const text = (data.content ?? []).filter((c: { type: string }) => c.type === 'text')
    .map((c: { text: string }) => c.text).join('');
  return parseDeepCheckResponse(text);
}
```

- [ ] **Step 4: Packaging + install guide**

`scripts/package.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
VERSION=$(node -p "require('./package.json').version")
rm -f "vero-detect-v${VERSION}.zip"
(cd dist && zip -qr "../vero-detect-v${VERSION}.zip" .)
echo "✔ vero-detect-v${VERSION}.zip"
```
Run: `chmod +x scripts/package.sh`

`INSTALL.md` — write member-facing install steps: unzip → chrome://extensions → enable Developer mode → Load unpacked → select the folder; how to open Options; note that rules update automatically but the extension itself updates via a new ZIP; the disclaimer paragraph ("a green result is not a guarantee — the VeRO public list is incomplete by design"); screenshots optional.

- [ ] **Step 5: Full verification**

Run: `npx vitest run && npm run typecheck && ./scripts/package.sh`
Expected: entire suite green, ZIP produced. Then the full manual pass:
1. Load unpacked; check the worker console (chrome://extensions → service worker) shows no errors.
2. AliExpress knife item → 🔴 prohibited with knives policy link.
3. eBay "Dyson filter" item → 🔴 vero, "for Dyson" compatible item → 🟡.
4. Amazon LEGO item → 🔴 vero (curated addition).
5. Options → Refresh now → official count ≈ 1,141 and "days old" resets in the panel footer.
6. Add an API key → Deep check on any item returns a result box.
7. Export CSV → opens in Numbers/Excel with correct columns.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: AI deep check, ZIP packaging and member install guide"
```

---

## Self-Review (completed at plan time)

- **Spec coverage:** 6 categories (Tasks 4–7) ✓ · live VeRO scrape (8, 11) ✓ · curated pack + local overrides (3, 8, 11, 13) ✓ · 3 site adapters (9, 10) ✓ · fail-soft partial checks (adapters `missing` + panel strip) ✓ · polished panel (12) ✓ · options + CSV pipeline export (13) ✓ · BYO-key AI with images (14) ✓ · ZIP + INSTALL.md (14) ✓ · never-false-green (unknown level ranks above clear; tested in Task 7) ✓.
- **Placeholder scan:** the only intentionally-summarized block is the panel CSS string in Task 12 — the design requirements list above it is the binding spec for it; everything else is complete code.
- **Type consistency:** `Listing/Verdict/RulesPack` defined once in Task 2 and imported everywhere; `deepCheck` stub (Task 11) and real (Task 14) share one signature; `HistoryEntry` defined in Task 11 and consumed in Tasks 12–13. Checked.
