import type { Listing } from '../types';

export interface DeepCheckResult {
  brand?: string; logoLikely: boolean; concerns: string[];
  recommendation: 'clear' | 'caution' | 'danger'; reasoning: string;
}

export async function deepCheck(_listing: Listing, _apiKey: string): Promise<DeepCheckResult> {
  throw new Error('deep check not implemented yet');
}
