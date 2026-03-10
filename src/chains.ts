import type { ChainConfig, ChainName, SchemaMode } from './types.js';

/**
 * Schema UID registry — separate from chain configs to avoid mutable global state.
 * Set via setExitSchemaUid(), read via getExitSchemaUid().
 */
const schemaUidRegistry: Partial<Record<ChainName, { full?: string; minimal?: string; commitment?: string }>> = {};

export function setSchemaUid(chain: ChainName, uid: string, mode: SchemaMode = 'full'): void {
  if (!schemaUidRegistry[chain]) schemaUidRegistry[chain] = {};
  schemaUidRegistry[chain]![mode] = uid;
}

export function getSchemaUid(chain: ChainName, mode: SchemaMode = 'full'): string | undefined {
  return schemaUidRegistry[chain]?.[mode];
}

/**
 * Arrival schema UID registry — separate from exit schema UIDs.
 */
const arrivalSchemaUidRegistry: Partial<Record<ChainName, string>> = {};

export function setArrivalSchemaUid(chain: ChainName, uid: string): void {
  arrivalSchemaUidRegistry[chain] = uid;
}

export function getArrivalSchemaUid(chain: ChainName): string | undefined {
  return arrivalSchemaUidRegistry[chain];
}

/**
 * EAS contract addresses per chain.
 *
 * Base and Optimism use OP Stack predeploy addresses (0x42...).
 * Ethereum and Arbitrum use deployed contract addresses.
 * See: https://docs.attest.org/docs/quick--start/contracts
 *
 * **Finality note:** L2 chains (Base, Optimism, Arbitrum) return after
 * sequencer confirmation (~2s), NOT L1 finality (~7 days for OP Stack).
 * Use the `finality` field in AnchorResult to communicate this to consumers.
 */
export const CHAIN_CONFIGS: Record<ChainName, ChainConfig> = {
  base: {
    name: 'base',
    chainId: 8453,
    easAddress: '0x4200000000000000000000000000000000000021',
    schemaRegistryAddress: '0x4200000000000000000000000000000000000020',
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://base.easscan.org',
  },
  optimism: {
    name: 'optimism',
    chainId: 10,
    easAddress: '0x4200000000000000000000000000000000000021',
    schemaRegistryAddress: '0x4200000000000000000000000000000000000020',
    rpcUrl: 'https://mainnet.optimism.io',
    explorerUrl: 'https://optimism.easscan.org',
  },
  arbitrum: {
    name: 'arbitrum',
    chainId: 42161,
    easAddress: '0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458',
    schemaRegistryAddress: '0xA310da9c5B885E7fb3fbA9D66E9Ba6Df512b78eB',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbitrum.easscan.org',
  },
  ethereum: {
    name: 'ethereum',
    chainId: 1,
    easAddress: '0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587',
    schemaRegistryAddress: '0xA7b39296258348C78294F95B872b282326A97BDF',
    rpcUrl: 'https://eth.llamarpc.com',
    explorerUrl: 'https://easscan.org',
  },
  sepolia: {
    name: 'sepolia',
    chainId: 11155111,
    easAddress: '0xC2679fBD37d54388Ce493F1DB75320D236e1815e',
    schemaRegistryAddress: '0x0a7E2Ff54e76B8E6659aedc9103FB21c038050D0',
    rpcUrl: 'https://rpc.sepolia.org',
    explorerUrl: 'https://sepolia.easscan.org',
  },
};

export function getChainConfig(chain: ChainName = 'base'): ChainConfig {
  const config = CHAIN_CONFIGS[chain];
  if (!config) {
    throw new Error(`Unsupported chain: ${chain}. Supported: ${Object.keys(CHAIN_CONFIGS).join(', ')}`);
  }
  return config;
}
