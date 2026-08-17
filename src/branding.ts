/**
 * All marketing/branding text lives here — edit this one file to update
 * the panel footer, options page and coming-soon teaser everywhere.
 */
export const BRANDING = {
  product: 'VeRO Detect',
  owner: 'Zahoor Khan',
  company: 'Pycode Ltd',
  email: 'Zahoor@pycode.co.uk',
  phone: '', // e.g. '+44 7xxx xxxxxx' — leave empty to hide
  tagline: 'List smart. Stay safe.',
  pitch: 'For any software automation — contact us.',
  comingSoon: '🚀 Coming soon: Hunting · Listing · Profit & Loss tools — stay tuned!',
};

export function contactLine(): string {
  return [BRANDING.email, BRANDING.phone].filter(Boolean).join(' · ');
}
