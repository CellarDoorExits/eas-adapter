import type { Signer, Provider } from 'ethers';

// ═══════════════════════════════════════════
// Chain Configuration
// ═══════════════════════════════════════════

export type ChainName = 'base' | 'optimism' | 'arbitrum' | 'ethereum' | 'sepolia';

export interface ChainConfig {
  readonly name: ChainName;
  readonly chainId: number;
  readonly easAddress: string;
  readonly schemaRegistryAddress: string;
  readonly rpcUrl: string;
  readonly explorerUrl: string;
  /** Pre-registered EXIT schema UID, if known */
  exitSchemaUid?: string;
}

// ═══════════════════════════════════════════
// EXIT Marker Types (subset needed for anchoring)
// ═══════════════════════════════════════════

export type ExitType = 'voluntary' | 'forced' | 'emergency' | 'keyCompromise' | 'platform_shutdown' | 'directed' | 'constructive' | 'acquisition';
export type ExitStatus = 'good_standing' | 'disputed' | 'unverified';

export type SchemaMode = 'full' | 'minimal' | 'commitment';

export interface ExitMarkerLike {
  id: string;                    // urn:exit:...
  subject: string;               // DID (did:key, did:ethr, did:pkh)
  origin: string;                // Platform DID (did:web, etc.)
  timestamp: string | number;    // ISO-8601 or unix ms
  exitType: ExitType;
  status: ExitStatus;
  selfAttested?: boolean;
  lineageHash?: string;          // Hex-encoded hash
}

// ═══════════════════════════════════════════
// Anchor Options & Results
// ═══════════════════════════════════════════

export interface AnchorOptions {
  chain?: ChainName;
  mode?: 'onchain' | 'offchain';
  /**
   * Schema mode: 'full' | 'minimal' | 'commitment'
   * - full: all fields on-chain
   * - minimal: commitment hash + subjectDid + vcUri
   * - commitment: commitment hash + vcUri only (true GDPR-safe, no personal data) (default)
   */
  schemaMode?: SchemaMode;
  /**
   * @deprecated Use `schemaMode: 'minimal'` instead. If both are set, schemaMode takes precedence.
   */
  minimal?: boolean;
  signer: Signer;
  vcUri?: string;
  schemaUid?: string;
  /** Custom RPC provider (overrides default public endpoints) */
  provider?: Provider;
}

export interface AnchorResult {
  uid: string;
  txHash?: string;
  chain: ChainName;
  mode: 'onchain' | 'offchain';
  recipient: string;
  gasUsed?: bigint;
  /** Off-chain: the full signed attestation object for storage/transmission */
  offchainAttestation?: unknown;
  /** Finality level at time of return */
  finality: 'sequencer' | 'l1-pending' | 'l1-finalized' | 'offchain';
}

// ═══════════════════════════════════════════
// ARRIVAL Marker Types (subset needed for anchoring)
// ═══════════════════════════════════════════

export interface ArrivalMarkerLike {
  id: string;                    // urn:arrival:...
  subject: string;               // DID (did:key, did:ethr, did:pkh)
  destination: string;           // Platform DID (did:web, etc.)
  timestamp: string | number;    // ISO-8601 or unix ms
  departureRef: string;          // Reference to the departure (exit) attestation UID or marker ID
  vcUri?: string;                // URI to the Verifiable Credential
}

// ═══════════════════════════════════════════
// Decoded Arrival Data
// ═══════════════════════════════════════════

export interface DecodedArrivalData {
  arrivalHash: string;
  subjectDid: string;
  departureRef: string;
  vcUri: string;
}

// ═══════════════════════════════════════════
// Verify Options & Results
// ═══════════════════════════════════════════

export interface VerifyOptions {
  chain?: ChainName;
  provider: Provider;
  /** If true, verify an off-chain attestation object instead of on-chain UID */
  offchain?: boolean;
}

export interface VerifyResult {
  valid: boolean;
  revoked: boolean;
  /** Which schema mode was detected. 'unknown' if decode failed. */
  schemaMode?: SchemaMode | 'unknown';
  /** True if schema data could not be decoded (signature may still be valid) */
  decodeError?: boolean;
  /** Whether the EIP-712 domain was validated against expected chain config */
  domainValidated?: boolean;
  attestation: {
    uid: string;
    schema: string;
    attester: string;
    recipient: string;
    time: number;
    revocationTime: number;
    data: DecodedExitData | DecodedMinimalExitData | DecodedCommitmentExitData;
  };
}

export interface DecodedExitData {
  exitId: string;
  subjectDid: string;
  origin: string;
  timestamp: number;
  exitType: ExitType;
  status: ExitStatus;
  selfAttested: boolean;
  lineageHash: string;
  vcUri: string;
}

export interface DecodedMinimalExitData {
  exitHash: string;
  subjectDid: string;
  vcUri: string;
}

export interface DecodedCommitmentExitData {
  exitHash: string;
  vcUri: string;
}

// ═══════════════════════════════════════════
// Off-chain Verification
// ═══════════════════════════════════════════

export interface OffchainAttestationObject {
  sig: {
    domain: Record<string, unknown>;
    primaryType: string;
    types: Record<string, unknown>;
    signature: {
      v: number;
      r: string;
      s: string;
    };
  };
  signer: string;
  uid: string;
  message: {
    schema: string;
    recipient: string;
    time: bigint | number;
    expirationTime: bigint | number;
    revocable: boolean;
    refUID: string;
    data: string;
    version?: number;
  };
}

// ═══════════════════════════════════════════
// Revoke Options & Results
// ═══════════════════════════════════════════

export interface RevokeOptions {
  chain?: ChainName;
  signer: Signer;
  reason?: string;
}

export interface RevokeResult {
  txHash: string;
  revocationTime: number;
}

// ═══════════════════════════════════════════
// Schema Registration
// ═══════════════════════════════════════════

export interface RegisterSchemaOptions {
  chain?: ChainName;
  signer: Signer;
}

export interface RegisterSchemaResult {
  schemaUid: string;
  txHash: string;
}

// ═══════════════════════════════════════════
// Arrival Verify Result
// ═══════════════════════════════════════════

export interface ArrivalVerifyResult {
  valid: boolean;
  revoked: boolean;
  attestation: {
    uid: string;
    schema: string;
    attester: string;
    recipient: string;
    time: number;
    revocationTime: number;
    data: DecodedArrivalData;
  };
}
