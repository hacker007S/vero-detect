# Publish checklist — VeRO Detect (free)

## Before upload
- [x] Manifest V3, minimal permissions (storage, alarms)
- [x] No remote code / eval (verified)
- [x] 96/96 tests pass
- [ ] Host PRIVACY.md at a public URL — best: https://pycode.co.uk/vero-detect/privacy
      (fallback: GitHub Pages repo). URL must open without login.
- [ ] Bump manifest version for the store build (e.g. 2.0.0) + npm run zip
- [ ] Screenshots: 3-5 at 1280x800 (verdict panel on a real listing, deep
      check, options page). PNG/JPG, no rounded corners.
- [ ] Optional: small promo tile 440x280 (Pycode branding)

## Developer dashboard (chrome.google.com/webstore/devconsole)
- [ ] $5 fee paid (DONE), publisher email verified
- [ ] Upload ZIP -> fill Store listing (copy from LISTING.md)
- [ ] Privacy tab: single purpose + permission justifications (LISTING.md)
- [ ] Privacy practices: "does not collect user data"; certify limited use
- [ ] Distribution: Free, all regions (or UK-first)
- [ ] Submit -> review typically 1-7 days. Don't resubmit while pending.

## After approval
- [ ] Store link into VeRO Detect footer + WhatsApp/marketing
- [ ] Future updates: bump version, zip, upload — reviews for updates are
      usually faster. NEVER add new permissions without expecting re-review.

## SaaS architecture decision (agreed)
- VeRO Detect: FREE on the store = distribution + trust + lead magnet.
  Its footer's "upcoming products" bars advertise the paid tools.
- Product Hunter / Auto Lister: PAID via license key. Sell through
  Lemon Squeezy or Gumroad (they handle VAT/tax as merchant of record;
  ExtensionPay is the plug-and-play alternative at ~5% fees).
  Extension checks the key once via the vendor's licence API; cache result
  in storage. Free tier possible later (e.g. 20 hunts/month).
- Keep paid tools OFF the store initially (ZIP + key) or publish with
  license-gate — both allowed by CWS policy as long as it's disclosed.
