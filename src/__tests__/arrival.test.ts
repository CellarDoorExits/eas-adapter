import { describe, it, expect } from 'vitest';
import {
  ARRIVAL_SCHEMA,
  computeArrivalHash,
  encodeArrivalData,
  decodeArrivalData,
  didToAddress,
} from '../codec.js';
import { setArrivalSchemaUid, getArrivalSchemaUid } from '../chains.js';
import type { ArrivalMarkerLike } from '../types.js';

const marker: ArrivalMarkerLike = {
  id: 'urn:arrival:test-001',
  subject: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  destination: 'did:web:newplatform.example',
  timestamp: '2026-03-10T12:00:00Z',
  departureRef: '0xabc123def456',
  vcUri: 'ipfs://bafytest',
};

describe('ARRIVAL_SCHEMA constant', () => {
  it('includes all arrival fields', () => {
    expect(ARRIVAL_SCHEMA).toContain('bytes32 arrivalHash');
    expect(ARRIVAL_SCHEMA).toContain('string subjectDid');
    expect(ARRIVAL_SCHEMA).toContain('string departureRef');
    expect(ARRIVAL_SCHEMA).toContain('string vcUri');
  });

  it('does not include exit-specific fields', () => {
    expect(ARRIVAL_SCHEMA).not.toContain('exitId');
    expect(ARRIVAL_SCHEMA).not.toContain('exitType');
    expect(ARRIVAL_SCHEMA).not.toContain('lineageHash');
  });
});

describe('computeArrivalHash', () => {
  it('is deterministic', () => {
    expect(computeArrivalHash(marker)).toBe(computeArrivalHash(marker));
  });

  it('returns bytes32 hex string', () => {
    expect(computeArrivalHash(marker)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('different markers produce different hashes', () => {
    const h1 = computeArrivalHash(marker);
    const h2 = computeArrivalHash({ ...marker, id: 'urn:arrival:test-002' });
    expect(h1).not.toBe(h2);
  });

  it('handles unix ms timestamps', () => {
    const h1 = computeArrivalHash({ ...marker, timestamp: 1741608000000 });
    expect(h1).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('different departureRef produces different hash', () => {
    const h1 = computeArrivalHash(marker);
    const h2 = computeArrivalHash({ ...marker, departureRef: '0xdifferent' });
    expect(h1).not.toBe(h2);
  });
});

describe('encodeArrivalData', () => {
  it('produces 4-field data array', () => {
    const data = encodeArrivalData(marker, 'ipfs://test');
    expect(data).toHaveLength(4);
    expect(data[0]?.name).toBe('arrivalHash');
    expect(data[0]?.type).toBe('bytes32');
    expect(data[1]).toEqual({ name: 'subjectDid', value: marker.subject, type: 'string' });
    expect(data[2]).toEqual({ name: 'departureRef', value: '0xabc123def456', type: 'string' });
    expect(data[3]).toEqual({ name: 'vcUri', value: 'ipfs://test', type: 'string' });
  });

  it('defaults vcUri to empty string', () => {
    const data = encodeArrivalData(marker);
    expect(data[3]?.value).toBe('');
  });

  it('arrivalHash matches computeArrivalHash', () => {
    const data = encodeArrivalData(marker);
    expect(data[0]?.value).toBe(computeArrivalHash(marker));
  });
});

describe('decodeArrivalData', () => {
  it('decodes items into DecodedArrivalData', () => {
    const items = [
      { name: 'arrivalHash', value: { value: '0x1234' }, type: 'bytes32' },
      { name: 'subjectDid', value: { value: 'did:key:z6Mk...' }, type: 'string' },
      { name: 'departureRef', value: { value: '0xabc' }, type: 'string' },
      { name: 'vcUri', value: { value: 'ipfs://test' }, type: 'string' },
    ];

    const decoded = decodeArrivalData(items);
    expect(decoded.arrivalHash).toBe('0x1234');
    expect(decoded.subjectDid).toBe('did:key:z6Mk...');
    expect(decoded.departureRef).toBe('0xabc');
    expect(decoded.vcUri).toBe('ipfs://test');
  });
});

describe('Arrival schema UID registry', () => {
  it('stores and retrieves arrival schema UIDs', () => {
    setArrivalSchemaUid('base', '0xarrival-uid');
    expect(getArrivalSchemaUid('base')).toBe('0xarrival-uid');
  });

  it('returns undefined for unregistered chains', () => {
    expect(getArrivalSchemaUid('arbitrum')).toBeUndefined();
  });
});

describe('anchorArrival recipient logic', () => {
  it('arrival uses DID-derived address as recipient', () => {
    const recipient = didToAddress(marker.subject);
    expect(recipient).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(recipient).not.toBe('0x0000000000000000000000000000000000000000');
  });
});
