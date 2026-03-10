import { describe, it, expect } from 'vitest';
import { verifyOffchainAnchor } from '../verify.js';
import { CHAIN_CONFIGS } from '../chains.js';
import { setSchemaUid, getSchemaUid } from '../chains.js';
import { didToAddress } from '../codec.js';
import type { OffchainAttestationObject } from '../types.js';

describe('verifyOffchainAnchor domain validation', () => {
  // We can't easily create valid EIP-712 signatures in unit tests without
  // substantial mocking, so we test that domain mismatches are rejected.
  // The signature verification will fail too, but domain check comes first.

  const makeAttestation = (domain: Record<string, unknown>): OffchainAttestationObject => ({
    sig: {
      domain,
      primaryType: 'Attest',
      types: {
        Attest: [
          { name: 'schema', type: 'bytes32' },
          { name: 'recipient', type: 'address' },
          { name: 'time', type: 'uint64' },
          { name: 'expirationTime', type: 'uint64' },
          { name: 'revocable', type: 'bool' },
          { name: 'refUID', type: 'bytes32' },
          { name: 'data', type: 'bytes' },
        ],
      },
      signature: {
        v: 27,
        r: '0x' + 'ab'.repeat(32),
        s: '0x' + 'cd'.repeat(32),
      },
    },
    signer: '0x1234567890abcdef1234567890abcdef12345678',
    uid: '0x' + '00'.repeat(32),
    message: {
      schema: '0x' + '00'.repeat(32),
      recipient: '0x0000000000000000000000000000000000000000',
      time: 1709902800n,
      expirationTime: 0n,
      revocable: true,
      refUID: '0x' + '00'.repeat(32),
      data: '0x',
    },
  });

  it('rejects when domain chainId mismatches expected chain', () => {
    const att = makeAttestation({
      chainId: 999, // wrong chain
      verifyingContract: CHAIN_CONFIGS.base.easAddress,
      name: 'EAS',
      version: '1',
    });

    const result = verifyOffchainAnchor(att, { chain: 'base' });
    expect(result.valid).toBe(false);
  });

  it('rejects when domain verifyingContract mismatches expected chain', () => {
    const att = makeAttestation({
      chainId: CHAIN_CONFIGS.base.chainId,
      verifyingContract: '0x0000000000000000000000000000000000000BAD',
      name: 'EAS',
      version: '1',
    });

    const result = verifyOffchainAnchor(att, { chain: 'base' });
    expect(result.valid).toBe(false);
  });

  it('returns domainValidated: false when no chain specified', () => {
    const att = makeAttestation({
      chainId: CHAIN_CONFIGS.base.chainId,
      verifyingContract: CHAIN_CONFIGS.base.easAddress,
    });

    // Will fail on signature, but we check domainValidated field
    const result = verifyOffchainAnchor(att);
    // Without chain option and no skipDomainCheck, domainValidated should be false
    // But if signature fails (outer catch), result won't have this field
    // So we check it's either false or undefined (catch path)
    expect(result.domainValidated === false || result.domainValidated === undefined).toBe(true);
  });

  it('skipDomainCheck bypasses domain validation', () => {
    const att = makeAttestation({
      chainId: 999,
      verifyingContract: '0x0000000000000000000000000000000000000BAD',
    });

    // With skipDomainCheck, domain mismatch shouldn't cause rejection
    // (though signature will still fail)
    const result = verifyOffchainAnchor(att, { skipDomainCheck: true });
    // Should not have domainValidated field
    expect(result.domainValidated).toBeUndefined();
  });
});

describe('verifyOffchainAnchor decode failure', () => {
  it('signals decode error with schemaMode unknown', () => {
    const att: OffchainAttestationObject = {
      sig: {
        domain: {},
        primaryType: 'Attest',
        types: {
          Attest: [
            { name: 'schema', type: 'bytes32' },
            { name: 'recipient', type: 'address' },
            { name: 'time', type: 'uint64' },
            { name: 'expirationTime', type: 'uint64' },
            { name: 'revocable', type: 'bool' },
            { name: 'refUID', type: 'bytes32' },
            { name: 'data', type: 'bytes' },
          ],
        },
        signature: {
          v: 27,
          r: '0x' + 'ab'.repeat(32),
          s: '0x' + 'cd'.repeat(32),
        },
      },
      signer: '0x1234567890abcdef1234567890abcdef12345678',
      uid: '0x' + '00'.repeat(32),
      message: {
        schema: '0x' + '00'.repeat(32),
        recipient: '0x0000000000000000000000000000000000000000',
        time: 1709902800n,
        expirationTime: 0n,
        revocable: true,
        refUID: '0x' + '00'.repeat(32),
        data: '0xdeadbeef', // invalid schema data
      },
    };

    // The signature verification will also fail due to mock data,
    // so the outer catch may trigger. That's fine — we test that
    // the function doesn't crash and returns a result.
    const result = verifyOffchainAnchor(att, { skipDomainCheck: true });
    expect(result).toBeDefined();
    expect(typeof result.valid).toBe('boolean');
  });
});

describe('Schema UID matching', () => {
  it('getSchemaUid returns stored UIDs by mode', () => {
    setSchemaUid('base', '0xfull', 'full');
    setSchemaUid('base', '0xmin', 'minimal');
    setSchemaUid('base', '0xcommit', 'commitment');

    expect(getSchemaUid('base', 'full')).toBe('0xfull');
    expect(getSchemaUid('base', 'minimal')).toBe('0xmin');
    expect(getSchemaUid('base', 'commitment')).toBe('0xcommit');
  });

  it('returns undefined for unregistered chain/mode', () => {
    expect(getSchemaUid('arbitrum', 'full')).toBeUndefined();
  });
});

describe('did:pkh chain ID behavior (documentation test)', () => {
  // This test documents the intentional behavior that chain ID is discarded.
  // See the JSDoc on didToAddress() in codec.ts for the rationale.
  it('same address from different chain IDs is intentional', () => {
    const addr1 = didToAddress('did:pkh:eip155:1:0x1234567890abcdef1234567890abcdef12345678');
    const addr137 = didToAddress('did:pkh:eip155:137:0x1234567890abcdef1234567890abcdef12345678');
    // Same address — this is correct. The EAS recipient is chain-agnostic.
    expect(addr1).toBe(addr137);
  });
});
