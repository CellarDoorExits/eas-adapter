import { describe, it, expect } from 'vitest';
import {
  didToAddress,
  addressToPkhDid,
  markerToSchemaData,
  markerToMinimalSchemaData,
  markerToCommitmentSchemaData,
  computeExitHash,
  computeLineageHash,
  computeOffchainNonce,
  exitTypeToUint,
  uintToExitType,
  statusToUint,
  uintToStatus,
  EXIT_SCHEMA,
  EXIT_SCHEMA_MINIMAL,
  EXIT_SCHEMA_COMMITMENT,
} from '../codec.js';
import type { ExitMarkerLike } from '../types.js';

describe('DID → Address Conversion', () => {
  it('converts did:ethr:0x... to checksummed address', () => {
    const addr = didToAddress('did:ethr:0x1234567890abcdef1234567890abcdef12345678');
    expect(addr).toBe('0x1234567890AbcdEF1234567890aBcdef12345678');
  });

  it('converts did:ethr:<network>:0x... to address', () => {
    const addr = didToAddress('did:ethr:base:0x1234567890abcdef1234567890abcdef12345678');
    expect(addr).toBe('0x1234567890AbcdEF1234567890aBcdef12345678');
  });

  it('converts did:pkh:eip155:<chainId>:0x... to address', () => {
    const addr = didToAddress('did:pkh:eip155:8453:0x1234567890abcdef1234567890abcdef12345678');
    expect(addr).toBe('0x1234567890AbcdEF1234567890aBcdef12345678');
  });

  it('converts did:key:z6Mk... to deterministic hash address', () => {
    const addr1 = didToAddress('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK');
    expect(addr1).toMatch(/^0x[0-9a-fA-F]{40}$/);

    // Same DID always produces same address
    const addr2 = didToAddress('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK');
    expect(addr1).toBe(addr2);

    // Different DID produces different address
    const addr3 = didToAddress('did:key:z6MksDifferentKeyHere');
    expect(addr1).not.toBe(addr3);
  });

  it('throws on unsupported DID methods', () => {
    expect(() => didToAddress('did:web:example.com')).toThrow('Unsupported DID method');
    expect(() => didToAddress('did:ion:abc123')).toThrow('Unsupported DID method');
  });

  it('throws on empty DID', () => {
    expect(() => didToAddress('')).toThrow('DID must be a non-empty string');
  });

  it('throws on invalid did:ethr address', () => {
    expect(() => didToAddress('did:ethr:not-an-address')).toThrow('Invalid did:ethr');
  });

  it('throws on invalid did:pkh address', () => {
    expect(() => didToAddress('did:pkh:eip155:1:not-an-address')).toThrow('Invalid did:pkh');
  });
});

describe('Address → DID', () => {
  it('converts address to did:pkh format', () => {
    const did = addressToPkhDid('0x1234567890abcdef1234567890abcdef12345678', 8453);
    expect(did).toBe('did:pkh:eip155:8453:0x1234567890AbcdEF1234567890aBcdef12345678');
  });

  it('defaults to chainId 1 (ethereum)', () => {
    const did = addressToPkhDid('0x1234567890abcdef1234567890abcdef12345678');
    expect(did).toMatch(/^did:pkh:eip155:1:/);
  });
});

describe('Enum Mappings', () => {
  it('maps exitType to uint and back', () => {
    expect(exitTypeToUint('voluntary')).toBe(0);
    expect(exitTypeToUint('forced')).toBe(1);
    expect(exitTypeToUint('emergency')).toBe(2);
    expect(exitTypeToUint('keyCompromise')).toBe(3);
    expect(exitTypeToUint('platform_shutdown')).toBe(4);
    expect(exitTypeToUint('directed')).toBe(5);
    expect(exitTypeToUint('constructive')).toBe(6);
    expect(exitTypeToUint('acquisition')).toBe(7);

    expect(uintToExitType(0)).toBe('voluntary');
    expect(uintToExitType(1)).toBe('forced');
    expect(uintToExitType(2)).toBe('emergency');
    expect(uintToExitType(3)).toBe('keyCompromise');
    expect(uintToExitType(4)).toBe('platform_shutdown');
    expect(uintToExitType(5)).toBe('directed');
    expect(uintToExitType(6)).toBe('constructive');
    expect(uintToExitType(7)).toBe('acquisition');
  });

  it('maps status to uint and back', () => {
    expect(statusToUint('good_standing')).toBe(0);
    expect(statusToUint('disputed')).toBe(1);
    expect(statusToUint('unverified')).toBe(2);

    expect(uintToStatus(0)).toBe('good_standing');
    expect(uintToStatus(1)).toBe('disputed');
    expect(uintToStatus(2)).toBe('unverified');
  });

  it('throws on unknown exitType', () => {
    expect(() => exitTypeToUint('invalid' as never)).toThrow();
    expect(() => uintToExitType(99)).toThrow();
  });

  it('throws on unknown status', () => {
    expect(() => statusToUint('invalid' as never)).toThrow();
    expect(() => uintToStatus(99)).toThrow();
  });
});

describe('Marker → Schema Data', () => {
  const marker: ExitMarkerLike = {
    id: 'urn:exit:test-001',
    subject: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    origin: 'did:web:platform.example',
    timestamp: '2026-03-08T12:00:00Z',
    exitType: 'voluntary',
    status: 'good_standing',
    selfAttested: false,
    lineageHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  };

  it('converts marker to schema data array', () => {
    const data = markerToSchemaData(marker, 'ipfs://bafytest');
    expect(data).toHaveLength(10);

    expect(data[0]).toEqual({ name: 'exitId', value: 'urn:exit:test-001', type: 'string' });
    expect(data[1]).toEqual({ name: 'subjectDid', value: marker.subject, type: 'string' });
    expect(data[2]?.name).toBe('recipient');
    expect(data[2]?.type).toBe('address');
    expect(data[3]).toEqual({ name: 'origin', value: 'did:web:platform.example', type: 'string' });
    expect(data[5]).toEqual({ name: 'exitType', value: 0n, type: 'uint8' });
    expect(data[6]).toEqual({ name: 'status', value: 0n, type: 'uint8' });
    expect(data[7]).toEqual({ name: 'selfAttested', value: false, type: 'bool' });
    expect(data[9]).toEqual({ name: 'vcUri', value: 'ipfs://bafytest', type: 'string' });
  });

  it('handles unix ms timestamps', () => {
    const m = { ...marker, timestamp: 1709902800000 };
    const data = markerToSchemaData(m);
    expect(Number(data[4]?.value)).toBe(1709902800);
  });

  it('defaults selfAttested to false', () => {
    const m = { ...marker, selfAttested: undefined };
    const data = markerToSchemaData(m);
    expect(data[7]?.value).toBe(false);
  });

  it('zero-pads missing lineageHash', () => {
    const m = { ...marker, lineageHash: undefined };
    const data = markerToSchemaData(m);
    expect(data[8]?.value).toBe('0x0000000000000000000000000000000000000000000000000000000000000000');
  });

  it('defaults vcUri to empty string', () => {
    const data = markerToSchemaData(marker);
    expect(data[9]?.value).toBe('');
  });
});

describe('Lineage Hash', () => {
  it('returns zero hash for empty array', () => {
    const hash = computeLineageHash([]);
    expect(hash).toBe('0x0000000000000000000000000000000000000000000000000000000000000000');
  });

  it('produces deterministic hash', () => {
    const ids = ['urn:exit:001', 'urn:exit:002', 'urn:exit:003'];
    const h1 = computeLineageHash(ids);
    const h2 = computeLineageHash(ids);
    expect(h1).toBe(h2);
  });

  it('is order-independent (sorts internally)', () => {
    const h1 = computeLineageHash(['urn:exit:002', 'urn:exit:001']);
    const h2 = computeLineageHash(['urn:exit:001', 'urn:exit:002']);
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different inputs', () => {
    const h1 = computeLineageHash(['urn:exit:001']);
    const h2 = computeLineageHash(['urn:exit:002']);
    expect(h1).not.toBe(h2);
  });
});

describe('Minimal Schema Data', () => {
  const marker: ExitMarkerLike = {
    id: 'urn:exit:test-001',
    subject: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    origin: 'did:web:platform.example',
    timestamp: '2026-03-08T12:00:00Z',
    exitType: 'voluntary',
    status: 'good_standing',
  };

  it('produces 3-field minimal data', () => {
    const data = markerToMinimalSchemaData(marker, 'ipfs://test');
    expect(data).toHaveLength(3);
    expect(data[0]?.name).toBe('exitHash');
    expect(data[0]?.type).toBe('bytes32');
    expect(data[1]).toEqual({ name: 'subjectDid', value: marker.subject, type: 'string' });
    expect(data[2]).toEqual({ name: 'vcUri', value: 'ipfs://test', type: 'string' });
  });

  it('produces deterministic exit hash', () => {
    const d1 = markerToMinimalSchemaData(marker);
    const d2 = markerToMinimalSchemaData(marker);
    expect(d1[0]?.value).toBe(d2[0]?.value);
  });

  it('different markers produce different hashes', () => {
    const d1 = markerToMinimalSchemaData(marker);
    const d2 = markerToMinimalSchemaData({ ...marker, id: 'urn:exit:test-002' });
    expect(d1[0]?.value).not.toBe(d2[0]?.value);
  });
});

describe('Commitment Schema Data', () => {
  const marker: ExitMarkerLike = {
    id: 'urn:exit:test-001',
    subject: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    origin: 'did:web:platform.example',
    timestamp: '2026-03-08T12:00:00Z',
    exitType: 'voluntary',
    status: 'good_standing',
  };

  it('produces 2-field commitment data (no subjectDid)', () => {
    const data = markerToCommitmentSchemaData(marker, 'ipfs://test');
    expect(data).toHaveLength(2);
    expect(data[0]?.name).toBe('exitHash');
    expect(data[0]?.type).toBe('bytes32');
    expect(data[1]).toEqual({ name: 'vcUri', value: 'ipfs://test', type: 'string' });
  });

  it('commitment exitHash matches minimal exitHash for same marker', () => {
    const commitData = markerToCommitmentSchemaData(marker);
    const minData = markerToMinimalSchemaData(marker);
    expect(commitData[0]?.value).toBe(minData[0]?.value);
  });

  it('produces deterministic exit hash', () => {
    const d1 = markerToCommitmentSchemaData(marker);
    const d2 = markerToCommitmentSchemaData(marker);
    expect(d1[0]?.value).toBe(d2[0]?.value);
  });

  it('different markers produce different hashes', () => {
    const d1 = markerToCommitmentSchemaData(marker);
    const d2 = markerToCommitmentSchemaData({ ...marker, id: 'urn:exit:test-002' });
    expect(d1[0]?.value).not.toBe(d2[0]?.value);
  });
});

describe('computeExitHash', () => {
  const marker: ExitMarkerLike = {
    id: 'urn:exit:test-001',
    subject: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    origin: 'did:web:platform.example',
    timestamp: '2026-03-08T12:00:00Z',
    exitType: 'voluntary',
    status: 'good_standing',
  };

  it('is deterministic', () => {
    expect(computeExitHash(marker)).toBe(computeExitHash(marker));
  });

  it('returns bytes32 hex string', () => {
    expect(computeExitHash(marker)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe('computeOffchainNonce', () => {
  it('is deterministic for same inputs', () => {
    const n1 = computeOffchainNonce('urn:exit:001', 'base', 1709902800);
    const n2 = computeOffchainNonce('urn:exit:001', 'base', 1709902800);
    expect(n1).toBe(n2);
  });

  it('returns bytes32 hex string', () => {
    const nonce = computeOffchainNonce('urn:exit:001', 'base', 1709902800);
    expect(nonce).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('different inputs produce different nonces', () => {
    const n1 = computeOffchainNonce('urn:exit:001', 'base', 1709902800);
    const n2 = computeOffchainNonce('urn:exit:002', 'base', 1709902800);
    const n3 = computeOffchainNonce('urn:exit:001', 'optimism', 1709902800);
    const n4 = computeOffchainNonce('urn:exit:001', 'base', 1709902801);
    expect(n1).not.toBe(n2);
    expect(n1).not.toBe(n3);
    expect(n1).not.toBe(n4);
  });
});

describe('EXIT_SCHEMA constants', () => {
  it('full schema includes all fields', () => {
    expect(EXIT_SCHEMA).toContain('string exitId');
    expect(EXIT_SCHEMA).toContain('string subjectDid');
    expect(EXIT_SCHEMA).toContain('address recipient');
    expect(EXIT_SCHEMA).toContain('bytes32 lineageHash');
    expect(EXIT_SCHEMA).toContain('string vcUri');
  });

  it('minimal schema has hash, subjectDid, and vcUri', () => {
    expect(EXIT_SCHEMA_MINIMAL).toContain('bytes32 exitHash');
    expect(EXIT_SCHEMA_MINIMAL).toContain('string subjectDid');
    expect(EXIT_SCHEMA_MINIMAL).toContain('string vcUri');
    expect(EXIT_SCHEMA_MINIMAL).not.toContain('address recipient');
  });

  it('commitment schema has only hash and vcUri (no personal data)', () => {
    expect(EXIT_SCHEMA_COMMITMENT).toContain('bytes32 exitHash');
    expect(EXIT_SCHEMA_COMMITMENT).toContain('string vcUri');
    expect(EXIT_SCHEMA_COMMITMENT).not.toContain('subjectDid');
    expect(EXIT_SCHEMA_COMMITMENT).not.toContain('address recipient');
  });
});

describe('schemaMode backwards compatibility', () => {
  // This tests that minimal: true still maps to minimal schema data
  const marker: ExitMarkerLike = {
    id: 'urn:exit:test-001',
    subject: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    origin: 'did:web:platform.example',
    timestamp: '2026-03-08T12:00:00Z',
    exitType: 'voluntary',
    status: 'good_standing',
  };

  it('minimal schema data is unchanged (backwards compat)', () => {
    const data = markerToMinimalSchemaData(marker, 'ipfs://test');
    expect(data).toHaveLength(3);
    expect(data[0]?.name).toBe('exitHash');
    expect(data[1]?.name).toBe('subjectDid');
    expect(data[2]?.name).toBe('vcUri');
  });
});
