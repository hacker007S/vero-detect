# VeRO Detect — Install Guide (for members)

VeRO Detect checks any product you open on **AliExpress**, **eBay UK** or **Amazon** against
eBay's VeRO brand list and UK restricted-item rules — before you list it. Free to use.

## Install (2 minutes)

1. **Unzip** `vero-detect-vX.Y.Z.zip` into a folder — e.g. `Documents/vero-detect`.
   ⚠️ Keep this folder — Chrome loads the extension from it. Don't delete or move it.
2. Open Chrome and go to `chrome://extensions`
3. Turn on **Developer mode** (toggle, top-right)
4. Click **Load unpacked** and select the folder you unzipped
5. Done — open any product page on AliExpress / eBay / Amazon and look for the
   **VeRO Detect** badge in the bottom-right corner.

## Reading the verdict

| Badge | Meaning |
|---|---|
| 🟢 **CLEAR** | No known flags. *Not a guarantee* — see below. |
| 🟡 **CAUTION** | Listable only with conditions — open the panel and read the "What to do" lines. |
| 🔴 **DO NOT LIST** | VeRO brand, prohibited item, or team-blacklisted category. |
| ⚪ **CHECK MANUALLY** | The page didn't expose enough data (usually size) — verify yourself. |

Click the badge to open the full six-check panel: **VeRO brand · Prohibited/restricted ·
Branded item · Size & weight · Sensitive item · Fragile**. Click any flagged row for
details, what-to-do guidance, and the exact eBay policy link.

## Get your free AI key (optional, 2 minutes)

The rule checks are always free. If you also want the **🔬 Deep check** button
(AI scans the listing images for brand logos), get your **own** free Google
Gemini key — do not share keys, each key has its own free daily quota:

1. Go to **aistudio.google.com** and sign in with any Google account
2. Click **Get API key** → **Create API key** (no card needed)
3. Copy the key (starts with `AIza…`)
4. Right-click the VeRO Detect icon → **Options** → paste it under
   **Gemini API key** (Gemini is already the selected provider)

That's it — deep checks now cost you nothing within Google's free daily quota.
(Claude and OpenAI keys also work if you prefer; they're paid but cost well
under a penny per check.)

**Power tip:** you can stack several free keys. Create a key in 2–3 different
Google accounts (or projects), paste them all into the Gemini field separated
by commas — the extension automatically switches to the next key whenever one
hits its free limit, multiplying your free quota.

## Settings (right-click the extension icon → Options)

- **Rules status** — the official VeRO list re-scrapes from eBay UK weekly and the team
  rules feed refreshes daily, automatically. "Refresh now" forces it.
- **Deep check** *(optional)* — add your own Anthropic API key to let AI scan listing
  images for logos and implied brands. Leave blank to skip; everything else is free.
- **My overrides** — add your own risky brands, or mute a brand you've verified is safe.
- **History** — every check is logged locally only. Export CSV for your product pipeline.

## Updating

- **Rules update themselves** — no action needed.
- **The extension itself** updates via a new ZIP: unzip over the same folder, then click
  the ↻ reload icon on `chrome://extensions`.

## The honest disclaimer

A green result means **no known flags** — it is not a guarantee. eBay's public VeRO page
is incomplete by design (many enforcing brands have no public profile), policies change,
and text rules can't see everything. When in doubt: don't list it.
