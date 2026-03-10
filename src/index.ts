/**
 * @cellar-door/eas — EAS adapter for EXIT Protocol
 *
 * Anchor EXIT departure markers as Ethereum Attestation Service attestations.
 * Attestations are inherently non-transferable (soul-bound) — no SBT wrapper needed.
 *
 * **Finality:** On L2 chains (Base, Optimism, Arbitrum), attestations are confirmed
 * at sequencer level (~2s), not L1 finality (~7 days for OP Stack). The `finality`
 * field in AnchorResult communicates this explicitly.
 *
 * **Schema modes:**
 * - `full`: All fields on-chain for maximum queryability (default).
 * - `minimal`: Commitment hash + subjectDid + vcUri. Reduced data, keeps DID.
 * - `commitment`: Commitment hash + vcUri only. True GDPR-safe — no personal data on-chain.
 *
 * @example
 * ```typescript
 * import { anchorExit, verifyAnchor, registerExitSchema, setExitSchemaUid } from '@cellar-door/eas';
 * import { Wallet, JsonRpcProvider } from 'ethers';
 *
 * const provider = new JsonRpcProvider('https://mainnet.base.org');
 * const signer = new Wallet(privateKey, provider);
 *
 * // Register schema (one-time)
 * const { schemaUid } = await registerExitSchema({ chain: 'base', signer });
 *
 * // Anchor an EXIT marker (GDPR-safe commitment mode)
 * const result = await anchorExit(marker, {
 *   chain: 'base', signer, schemaMode: 'commitment',
 * });
 *
 * // Verify
 * const verification = await verifyAnchor(result.uid, { chain: 'base', provider });
 * ```
 *
 * @packageDocumentation
 */

// Core operations — EXIT
export { anchorExit } from './anchor.js';
export { verifyAnchor, verifyOffchainAnchor, type OffchainVerifyOptions } from './verify.js';
export { revokeAnchor } from './revoke.js';

// Core operations — ARRIVAL
export { anchorArrival } from './anchor-arrival.js';
export { verifyArrivalAnchor } from './verify-arrival.js';

// Schema management
export {
  registerExitSchema, getExitSchemaUid, setExitSchemaUid,
  registerArrivalSchema, getArrivalSchemaUidForChain, setArrivalSchemaUidForChain,
} from './schema.js';

// Codec utilities
export {
  EXIT_SCHEMA,
  EXIT_SCHEMA_MINIMAL,
  EXIT_SCHEMA_COMMITMENT,
  ARRIVAL_SCHEMA,
  didToAddress,
  addressToPkhDid,
  markerToSchemaData,
  markerToMinimalSchemaData,
  markerToCommitmentSchemaData,
  computeExitHash,
  computeArrivalHash,
  encodeArrivalData,
  decodeArrivalData,
  computeLineageHash,
  computeOffchainNonce,
  exitTypeToUint,
  uintToExitType,
  statusToUint,
  uintToStatus,
} from './codec.js';

// Chain configuration
export { CHAIN_CONFIGS, getChainConfig } from './chains.js';

// Types
export type {
  ChainName,
  ChainConfig,
  ExitType,
  ExitStatus,
  SchemaMode,
  ExitMarkerLike,
  ArrivalMarkerLike,
  AnchorOptions,
  AnchorResult,
  VerifyOptions,
  VerifyResult,
  ArrivalVerifyResult,
  DecodedExitData,
  DecodedMinimalExitData,
  DecodedCommitmentExitData,
  DecodedArrivalData,
  OffchainAttestationObject,
  RevokeOptions,
  RevokeResult,
  RegisterSchemaOptions,
  RegisterSchemaResult,
} from './types.js';
