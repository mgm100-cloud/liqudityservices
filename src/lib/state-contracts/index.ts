import type { StateAdapter, StateContract } from "./types";
import { washingtonAdapter } from "./washington";
import { marylandAdapter } from "./maryland";
import { chicagoAdapter } from "./chicago";
import { iowaAdapter } from "./iowa";
import { newJerseyAdapter } from "./newjersey";
import { cincinnatiAdapter } from "./cincinnati";
import { austinAdapter } from "./austin";
import { montgomeryMdAdapter } from "./montgomeryMd";
import { oregonAdapter } from "./oregon";

export const STATE_ADAPTERS: StateAdapter[] = [
  washingtonAdapter,
  marylandAdapter,
  chicagoAdapter,
  iowaAdapter,
  newJerseyAdapter,
  cincinnatiAdapter,
  austinAdapter,
  montgomeryMdAdapter,
  oregonAdapter,
];

export async function fetchAllStateContracts(): Promise<{
  contracts: StateContract[];
  perState: Record<string, { count: number; error: string | null }>;
}> {
  const perState: Record<string, { count: number; error: string | null }> = {};
  const contracts: StateContract[] = [];

  const results = await Promise.all(
    STATE_ADAPTERS.map(async (adapter) => {
      try {
        const rows = await adapter.fetch();
        return { adapter, rows, error: null as string | null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { adapter, rows: [] as StateContract[], error: msg };
      }
    }),
  );

  for (const { adapter, rows, error } of results) {
    perState[adapter.stateCode] = { count: rows.length, error };
    contracts.push(...rows);
  }

  return { contracts, perState };
}

export type { StateContract, StateAdapter } from "./types";
