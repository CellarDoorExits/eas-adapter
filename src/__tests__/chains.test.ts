import { describe, it, expect } from 'vitest';
import { getChainConfig, CHAIN_CONFIGS, setSchemaUid, getSchemaUid } from '../chains.js';

describe('Chain Configuration', () => {
  it('returns config for all supported chains', () => {
    for (const chain of ['base', 'optimism', 'arbitrum', 'ethereum', 'sepolia'] as const) {
      const config = getChainConfig(chain);
      expect(config.name).toBe(chain);
      expect(config.easAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(config.schemaRegistryAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(config.chainId).toBeGreaterThan(0);
      expect(config.rpcUrl).toMatch(/^https?:\/\//);
      expect(config.explorerUrl).toMatch(/^https?:\/\//);
    }
  });

  it('defaults to base', () => {
    const config = getChainConfig();
    expect(config.name).toBe('base');
  });

  it('throws on unsupported chain', () => {
    expect(() => getChainConfig('polygon' as never)).toThrow('Unsupported chain');
  });

  it('base and optimism use OP Stack predeploy addresses', () => {
    expect(CHAIN_CONFIGS.base.easAddress).toBe('0x4200000000000000000000000000000000000021');
    expect(CHAIN_CONFIGS.optimism.easAddress).toBe('0x4200000000000000000000000000000000000021');
    expect(CHAIN_CONFIGS.base.schemaRegistryAddress).toBe('0x4200000000000000000000000000000000000020');
    expect(CHAIN_CONFIGS.optimism.schemaRegistryAddress).toBe('0x4200000000000000000000000000000000000020');
  });

  it('ethereum uses deployed contract addresses', () => {
    expect(CHAIN_CONFIGS.ethereum.easAddress).not.toMatch(/^0x42000000/);
  });
});

describe('Schema UID Registry', () => {
  it('stores and retrieves full schema UIDs', () => {
    setSchemaUid('sepolia', '0xabc123', 'full');
    expect(getSchemaUid('sepolia', 'full')).toBe('0xabc123');
  });

  it('stores and retrieves minimal schema UIDs separately', () => {
    setSchemaUid('sepolia', '0xdef456', 'minimal');
    expect(getSchemaUid('sepolia', 'minimal')).toBe('0xdef456');
    expect(getSchemaUid('sepolia', 'full')).toBe('0xabc123'); // from previous test
  });

  it('stores and retrieves commitment schema UIDs separately', () => {
    setSchemaUid('sepolia', '0xghi789', 'commitment');
    expect(getSchemaUid('sepolia', 'commitment')).toBe('0xghi789');
    expect(getSchemaUid('sepolia', 'full')).toBe('0xabc123');
    expect(getSchemaUid('sepolia', 'minimal')).toBe('0xdef456');
  });

  it('returns undefined for unset chains', () => {
    expect(getSchemaUid('arbitrum', 'full')).toBeUndefined();
  });

  it('returns undefined for unset modes', () => {
    expect(getSchemaUid('arbitrum', 'commitment')).toBeUndefined();
  });
});
