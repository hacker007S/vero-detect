/**
 * All marketing/branding text lives here — edit this one file to update
 * the panel footer, options page and coming-soon teaser everywhere.
 */
export const BRANDING = {
  product: 'VeRO Detect',
  owner: 'Zahoor Khan',
  company: 'Z Trade Ltd',
  email: 'khanzahoor301@gmail.com',
  phone: '', // e.g. '+44 7xxx xxxxxx' — leave empty to hide
  tagline: 'List smart. Stay safe.',
  comingSoon: '🚀 Coming soon: Auto Listing — stay tuned!',
};

export function contactLine(): string {
  return [BRANDING.email, BRANDING.phone].filter(Boolean).join(' · ');
}
