import { keccak256, toUtf8Bytes, getAddress, zeroPadValue, hexlify } from 'ethers';
import {
  computeMarkerHash as coreComputeMarkerHash,
  computeArrivalHash as coreComputeArrivalHash,
  type MarkerHashResult,
} from '@cellar-door/attestation-core';
import type { ExitMarkerLike, ExitType, ExitStatus, DecodedExitData, ArrivalMarkerLike } from './types.js';

// ═══════════════════════════════════════════
// EXIT Schema Definition
// ═══════════════════════════════════════════

/**
 * The canonical EXIT marker EAS schema string (full mode).
 * Includes all fields for maximum queryability on-chain.
 * Registered once per chain via registerExitSchema().
 *
 * Note: `address recipient` is redundant with the EAS struct's built-in recipient
 * field, but is kept in the schema string for queryability via EASSCAN and to
 * preserve the deterministic schema UID. Removing it would change the UID.
 */
export const EXIT_SCHEMA =
  'string exitId, string subjectDid, address recipient, string origin, uint64 timestamp, uint8 exitType, uint8 status, bool selfAttested, bytes32 lineageHash, string vcUri';

/**
 * Minimal EXIT marker schema.
 * Stores a commitment hash, subject DID, and VC reference.
 * Reduces on-chain data but still includes DID for queryability.
 */
export const EXIT_SCHEMA_MINIMAL =
  'bytes32 exitHash, string subjectDid, string vcUri';

/**
 * Commitment-only EXIT marker schema (true GDPR-safe mode).
 * Stores only a commitment hash and VC reference — no personal data on-chain.
 * Full data (including DID) lives off-chain at the vcUri.
 */
export const EXIT_SCHEMA_COMMITMENT =
  'bytes32 exitHash, string vcUri';

// ═══════════════════════════════════════════
// ARRIVAL Schema Definition
// ═══════════════════════════════════════════

/**
 * The canonical ARRIVAL marker EAS schema string.
 * Records an agent's arrival at a new platform, linking back to
 * the departure (exit) attestation via departureRef.
 *
 * Fields:
 * - arrivalHash: SHA-256 commitment hash of the canonicalized arrival marker
 * - subjectDid: The agent's DID
 * - departureRef: UID or marker ID of the linked departure/exit attestation
 * - vcUri: URI to the full Verifiable Credential (e.g. IPFS)
 */
export const ARRIVAL_SCHEMA =
  'bytes32 arrivalHash, string subjectDid, string departureRef, string vcUri';

// ═══════════════════════════════════════════
// Enum Mappings
// ═══════════════════════════════════════════

const EXIT_TYPE_TO_UINT: Record<ExitType, number> = {
  voluntary: 0,
  forced: 1,
  emergency: 2,
  keyCompromise: 3,
  platform_shutdown: 4,
  directed: 5,
  constructive: 6,
  acquisition: 7,
};

const UINT_TO_EXIT_TYPE: Record<number, ExitType> = {
  0: 'voluntary',
  1: 'forced',
  2: 'emergency',
  3: 'keyCompromise',
  4: 'platform_shutdown',
  5: 'directed',
  6: 'constructive',
  7: 'acquisition',
};

const STATUS_TO_UINT: Record<ExitStatus, number> = {
  good_standing: 0,
  disputed: 1,
  unverified: 2,
};

const UINT_TO_STATUS: Record<number, ExitStatus> = {
  0: 'good_standing',
  1: 'disputed',
  2: 'unverified',
};

export function exitTypeToUint(t: ExitType): number {
  const v = EXIT_TYPE_TO_UINT[t];
  if (v === undefined) throw new Error(`Unknown exitType: ${t}`);
  return v;
}

export function uintToExitType(v: number): ExitType {
  const t = UINT_TO_EXIT_TYPE[v];
  if (!t) throw new Error(`Unknown exitType uint: ${v}`);
  return t;
}

export function statusToUint(s: ExitStatus): number {
  const v = STATUS_TO_UINT[s];
  if (v === undefined) throw new Error(`Unknown status: ${s}`);
  return v;
}

export function uintToStatus(v: number): ExitStatus {
  const s = UINT_TO_STATUS[v];
  if (!s) throw new Error(`Unknown status uint: ${v}`);
  return s;
}

// ═══════════════════════════════════════════
// DID → Ethereum Address Conversion
// ═══════════════════════════════════════════

/**
 * Convert a DID to an Ethereum address for EAS recipient field.
 *
 * Supported DID methods:
 * - did:ethr:0x...         → direct extraction
 * - did:ethr:<network>:0x... → direct extraction (e.g., did:ethr:base:0x...)
 * - did:pkh:eip155:<chainId>:0x... → direct extraction
 * - did:key:z6Mk...        → deterministic keccak256-derived address
 *                            (Ed25519 keys have no native ETH address)
 *
 * For did:key, we derive a deterministic address via keccak256(did_string).
 * This is an attestation ABOUT the DID, not FROM it.
 *
 * **Note on did:pkh chain IDs:** `did:pkh:eip155:1:0x...` and `did:pkh:eip155:137:0x...`
 * intentionally produce the same recipient address. The EAS recipient is an Ethereum
 * address, and the same address is valid across all EVM chains. The chain ID in did:pkh
 * identifies which chain the key controls, not which chain the attestation targets.
 * The attestation's target chain is determined by the EAS contract it's submitted to.
 */
export function didToAddress(did: string): string {
  if (!did || typeof did !== 'string') {
    throw new Error('DID must be a non-empty string');
  }

  // did:ethr:0x... or did:ethr:<network>:0x...
  if (did.startsWith('did:ethr:')) {
    const parts = did.slice('did:ethr:'.length).split(':');
    const addr = parts[parts.length - 1];
    if (!addr?.startsWith('0x') || addr.length !== 42) {
      throw new Error(`Invalid did:ethr address: ${did}`);
    }
    return getAddress(addr);
  }

  // did:pkh:eip155:<chainId>:0x...
  if (did.startsWith('did:pkh:eip155:')) {
    const parts = did.split(':');
    const addr = parts[parts.length - 1];
    if (!addr?.startsWith('0x') || addr.length !== 42) {
      throw new Error(`Invalid did:pkh address: ${did}`);
    }
    return getAddress(addr);
  }

  // did:key:z6Mk... (Ed25519) or any other did:key
  // Derive deterministic address from keccak256 of the full DID string
  if (did.startsWith('did:key:')) {
    const hash = keccak256(toUtf8Bytes(did));
    return getAddress('0x' + hash.slice(-40));
  }

  // No silent fallback — reject unsupported DID methods
  throw new Error(
    `Unsupported DID method: ${did.split(':').slice(0, 2).join(':')}. ` +
    `Supported: did:ethr, did:pkh, did:key`
  );
}

/**
 * Convert an Ethereum address back to a did:pkh representation.
 * Useful for display purposes.
 */
export function addressToPkhDid(address: string, chainId: number = 1): string {
  return `did:pkh:eip155:${chainId}:${getAddress(address)}`;
}

// ═══════════════════════════════════════════
// Marker → Schema Encoding
// ═══════════════════════════════════════════

/**
 * Prepare full schema encoder data array from an EXIT marker.
 * Returns the array format expected by EAS SchemaEncoder.encodeData().
 *
 * Note: The `recipient` field here is redundant with the EAS attestation struct's
 * built-in recipient field. It is included in the schema data for queryability
 * via EASSCAN's decoded data views. The schema string cannot be changed without
 * altering the deterministic schema UID.
 */
export function markerToSchemaData(marker: ExitMarkerLike, vcUri: string = '') {
  const ts = typeof marker.timestamp === 'string'
    ? Math.floor(new Date(marker.timestamp).getTime() / 1000)
    : Math.floor(marker.timestamp / 1000);

  const lineageHash = marker.lineageHash
    ? zeroPadValue(marker.lineageHash.startsWith('0x') ? marker.lineageHash : `0x${marker.lineageHash}`, 32)
    : zeroPadValue('0x00', 32);

  return [
    { name: 'exitId', value: marker.id, type: 'string' },
    { name: 'subjectDid', value: marker.subject, type: 'string' },
    { name: 'recipient', value: didToAddress(marker.subject), type: 'address' },
    { name: 'origin', value: marker.origin, type: 'string' },
    { name: 'timestamp', value: BigInt(ts), type: 'uint64' },
    { name: 'exitType', value: BigInt(exitTypeToUint(marker.exitType)), type: 'uint8' },
    { name: 'status', value: BigInt(statusToUint(marker.status)), type: 'uint8' },
    { name: 'selfAttested', value: marker.selfAttested ?? false, type: 'bool' },
    { name: 'lineageHash', value: lineageHash, type: 'bytes32' },
    { name: 'vcUri', value: vcUri, type: 'string' },
  ];
}

/**
 * Prepare minimal schema data.
 * Stores a commitment hash, subject DID, and VC URI.
 */
export function markerToMinimalSchemaData(marker: ExitMarkerLike, vcUri: string = '') {
  const exitHash = computeExitHash(marker);

  return [
    { name: 'exitHash', value: exitHash, type: 'bytes32' },
    { name: 'subjectDid', value: marker.subject, type: 'string' },
    { name: 'vcUri', value: vcUri, type: 'string' },
  ];
}

/**
 * Prepare commitment-only schema data (true GDPR-safe mode).
 * Stores only a commitment hash and VC URI — no personal data on-chain.
 */
export function markerToCommitmentSchemaData(marker: ExitMarkerLike, vcUri: string = '') {
  const exitHash = computeExitHash(marker);

  return [
    { name: 'exitHash', value: exitHash, type: 'bytes32' },
    { name: 'vcUri', value: vcUri, type: 'string' },
  ];
}

/**
 * Compute the commitment hash for an EXIT marker.
 * Delegates to @cellar-door/attestation-core for cross-adapter consistency.
 * Used by both minimal and commitment schema modes.
 *
 * Returns a deterministic hash (no salt) for schema embedding.
 * For salted commitments, use computeExitHashSalted().
 */
export function computeExitHash(marker: ExitMarkerLike): string {
  // Use a zero salt for deterministic (unsalted) schema embedding
  const zeroSalt = '0x0000000000000000000000000000000000000000000000000000000000000000';
  const { hash } = coreComputeMarkerHash(marker, zeroSalt);
  return hash;
}

/**
 * Compute a salted commitment hash for an EXIT marker.
 * Delegates to @cellar-door/attestation-core for cross-adapter consistency.
 */
export function computeExitHashSalted(marker: ExitMarkerLike, salt?: string): MarkerHashResult {
  return coreComputeMarkerHash(marker, salt as `0x${string}` | undefined);
}

/**
 * Decode raw ABI-encoded attestation data back to EXIT fields.
 * This manually decodes since we know the schema layout.
 */
export function decodeExitData(data: DecodedExitData): DecodedExitData {
  // If already decoded (from SchemaEncoder), pass through with enum mapping
  return {
    ...data,
    exitType: typeof data.exitType === 'number' ? uintToExitType(data.exitType) : data.exitType,
    status: typeof data.status === 'number' ? uintToStatus(data.status) : data.status,
  };
}

// ═══════════════════════════════════════════
// Lineage Hash Utilities
// ═══════════════════════════════════════════

/**
 * Compute a lineage hash from a sequence of EXIT marker IDs.
 * Uses keccak256 of the concatenated sorted IDs.
 */
export function computeLineageHash(markerIds: string[]): string {
  if (markerIds.length === 0) return zeroPadValue('0x00', 32);
  const sorted = [...markerIds].sort();
  return keccak256(toUtf8Bytes(sorted.join(',')));
}

/**
 * Compute a deterministic nonce for off-chain attestation deduplication.
 * Derived from keccak256(markerId + chain + timestamp).
 * Consumers should check refUID uniqueness to detect duplicates.
 */
export function computeOffchainNonce(markerId: string, chain: string, timestamp: number): string {
  return keccak256(toUtf8Bytes(`${markerId}:${chain}:${timestamp}`));
}

// ═══════════════════════════════════════════
// ARRIVAL Marker Encoding / Decoding
// ═══════════════════════════════════════════

/**
 * Compute the commitment hash for an ARRIVAL marker.
 * Delegates to @cellar-door/attestation-core for cross-adapter consistency.
 *
 * Returns a deterministic hash (no salt) for schema embedding.
 * For salted commitments, use computeArrivalHashSalted().
 */
export function computeArrivalHash(marker: ArrivalMarkerLike): string {
  const zeroSalt = '0x0000000000000000000000000000000000000000000000000000000000000000';
  const { hash } = coreComputeArrivalHash(marker, zeroSalt);
  return hash;
}

/**
 * Compute a salted commitment hash for an ARRIVAL marker.
 * Delegates to @cellar-door/attestation-core for cross-adapter consistency.
 */
export function computeArrivalHashSalted(marker: ArrivalMarkerLike, salt?: string): MarkerHashResult {
  return coreComputeArrivalHash(marker, salt as `0x${string}` | undefined);
}

/**
 * Prepare ARRIVAL schema encoder data array from an arrival marker.
 * Returns the array format expected by EAS SchemaEncoder.encodeData().
 */
export function encodeArrivalData(marker: ArrivalMarkerLike, vcUri: string = '') {
  const arrivalHash = computeArrivalHash(marker);

  return [
    { name: 'arrivalHash', value: arrivalHash, type: 'bytes32' },
    { name: 'subjectDid', value: marker.subject, type: 'string' },
    { name: 'departureRef', value: marker.departureRef, type: 'string' },
    { name: 'vcUri', value: vcUri, type: 'string' },
  ];
}

/**
 * Decode parsed schema items into typed ARRIVAL data.
 */
export function decodeArrivalData(items: Array<{ name: string; value: { value: unknown }; type: string }>): import('./types.js').DecodedArrivalData {
  const decodedMap = new Map(items.map(item => [item.name, item.value]));
  const get = (key: string): unknown => {
    const v = decodedMap.get(key);
    return v && typeof v === 'object' && 'value' in v ? (v as { value: unknown }).value : v;
  };

  return {
    arrivalHash: String(get('arrivalHash') ?? ''),
    subjectDid: String(get('subjectDid') ?? ''),
    departureRef: String(get('departureRef') ?? ''),
    vcUri: String(get('vcUri') ?? ''),
  };
}
