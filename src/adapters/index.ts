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
