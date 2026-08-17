import type { CategoryResult, Listing, RuleHit, RulesPack } from '../types';
import { worst } from '../types';
import { checkClasses } from './classes';

const COST_GATE_GBP = 3.4;

export function checkDropship(listing: Listing, pack: RulesPack): CategoryResult {
  const hits: RuleHit[] = [...checkClasses(listing, pack, 'dropship').hits];

  if (listing.site === 'aliexpress' && listing.priceGBP !== undefined && listing.priceGBP > COST_GATE_GBP) {
    hits.push({
      ruleId: 'dropship:cost-gate',
      level: 'caution',
      label: `£${COST_GATE_GBP} cost gate`,
      detail: `Costs £${listing.priceGBP.toFixed(2)}. Nothing costing over £${COST_GATE_GBP} has ever passed the screen — eBay volume prices in reachable niches top out around £9–£12, and 30% of £11 is £3.30 (Protocol v5).`,
      action: 'Reject and do not open eBay for it, unless you have a specific reason this one is different.',
    });
  }

  if (listing.choice) {
    hits.push({
      ruleId: 'dropship:choice-packaging',
      level: 'caution',
      label: 'AliExpress Choice packaging',
      detail: 'Choice orders ship in AliExpress-branded packaging — your eBay buyer will see where it came from. Free shipping only over £8; a single sub-£8 order pays £1.99 postage.',
      action: 'Ask the seller for neutral packaging, batch 3–4 units per order to clear £8, or pick a non-Choice supplier.',
    });
  }

  let note: string | undefined;
  if (hits.length === 0 && listing.site === 'aliexpress' && listing.priceGBP !== undefined) {
    note = `£${listing.priceGBP.toFixed(2)} — passes the £${COST_GATE_GBP} cost gate.`;
  }

  return {
    category: 'dropship',
    level: hits.length ? worst(hits.map((h) => h.level)) : 'clear',
    hits,
    note,
  };
}
