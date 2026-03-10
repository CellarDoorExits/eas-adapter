import { EAS, SchemaEncoder } from '@ethereum-attestation-service/eas-sdk';
import { getChainConfig } from './chains.js';
import { getSchemaUid } from './chains.js';
import {
  EXIT_SCHEMA, EXIT_SCHEMA_MINIMAL, EXIT_SCHEMA_COMMITMENT,
  markerToSchemaData, markerToMinimalSchemaData, markerToCommitmentSchemaData,
  didToAddress, computeOffchainNonce,
} from './codec.js';
import type { ExitMarkerLike, AnchorOptions, AnchorResult, SchemaMode } from './types.js';

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Resolve effective schema mode from AnchorOptions.
 * `schemaMode` takes precedence over deprecated `minimal` flag.
 */
function resolveSchemaMode(options: AnchorOptions): SchemaMode {
  if (options.schemaMode) return options.schemaMode;
  if (options.minimal) return 'minimal';
  return 'commitment';
}

/**
 * Anchor an EXIT marker as an EAS attestation.
 *
 * Creates an on-chain or off-chain attestation recording the agent's
 * departure. On-chain attestations are indexed by EASSCAN and queryable
 * by smart contracts. Off-chain attestations are signed EIP-712 data
 * that can be stored anywhere and optionally timestamped on-chain later.
 *
 * **Schema modes:**
 * - `full`: All fields on-chain for maximum queryability.
 * - `minimal`: Commitment hash + subjectDid + vcUri. Reduces data but keeps DID.
 * - `commitment` (default): Commitment hash + vcUri only. True GDPR-safe — no personal data on-chain.
 *
 * **Finality:** On L2 chains (Base, Optimism, Arbitrum), the returned result
 * reflects sequencer-grade confirmation (~2s), NOT L1 finality (~7 days for
 * OP Stack). Check result.finality for the confirmation level.
 *
 * **Off-chain deduplication:** When mode='offchain', the refUID field contains
 * a deterministic nonce derived from keccak256(markerId + chain + timestamp).
 * Consumers should check refUID uniqueness to detect duplicate attestations.
 *
 * @example
 * ```typescript
 * import { anchorExit } from '@cellar-door/eas';
 * import { Wallet } from 'ethers';
 *
 * const signer = new Wallet(privateKey, provider);
 * const result = await anchorExit(marker, {
 *   chain: 'base',
 *   signer,
 *   schemaMode: 'commitment', // GDPR-safe
 *   vcUri: 'ipfs://bafybeig...',
 * });
 * console.log(`Anchored: ${result.uid} (finality: ${result.finality})`);
 * ```
 */
export async function anchorExit(
  marker: ExitMarkerLike,
  options: AnchorOptions,
): Promise<AnchorResult> {
  const chain = options.chain ?? 'base';
  const mode = options.mode ?? 'onchain';
  const schemaMode = resolveSchemaMode(options);
  const config = getChainConfig(chain);

  // Resolve schema UID — check options, then registry
  const schemaUid = options.schemaUid ?? getSchemaUid(chain, schemaMode);
  if (!schemaUid) {
    throw new Error(
      `No EXIT schema UID configured for ${chain} (${schemaMode} mode). ` +
      `Register the schema first with registerExitSchema(), or pass schemaUid in options.`
    );
  }

  // Initialize EAS
  const eas = new EAS(config.easAddress);
  eas.connect(options.signer);

  // Select schema string and encode data
  const schemaString = schemaMode === 'commitment' ? EXIT_SCHEMA_COMMITMENT
    : schemaMode === 'minimal' ? EXIT_SCHEMA_MINIMAL
    : EXIT_SCHEMA;

  const schemaEncoder = new SchemaEncoder(schemaString);
  const schemaData = schemaMode === 'commitment'
    ? markerToCommitmentSchemaData(marker, options.vcUri)
    : schemaMode === 'minimal'
    ? markerToMinimalSchemaData(marker, options.vcUri)
    : markerToSchemaData(marker, options.vcUri);
  const encodedData = schemaEncoder.encodeData(schemaData);

  // Resolve recipient address from DID.
  // In commitment mode, use zero address to avoid leaking pseudonymous personal
  // data (the DID-derived address) on-chain. The commitment hash in the schema
  // data is sufficient for linkage back to the subject. This is a GDPR consideration:
  // even a pseudonymous Ethereum address derived from a DID constitutes personal data.
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const recipient = schemaMode === 'commitment' ? ZERO_ADDRESS : didToAddress(marker.subject);

  // Determine finality level
  const finality = mode === 'offchain' ? 'offchain' as const
    : (chain === 'ethereum' ? 'l1-pending' as const : 'sequencer' as const);

  if (mode === 'offchain') {
    const now = Math.floor(Date.now() / 1000);
    // Use marker timestamp (not wall clock) for deterministic dedup nonce
    const markerTs = typeof marker.timestamp === 'string'
      ? Math.floor(new Date(marker.timestamp).getTime() / 1000)
      : Math.floor(marker.timestamp / 1000);
    const nonce = computeOffchainNonce(marker.id, chain, markerTs);

    const offchain = await eas.getOffchain();
    const attestation = await offchain.signOffchainAttestation(
      {
        schema: schemaUid,
        recipient,
        time: BigInt(now),
        expirationTime: 0n,
        revocable: true,
        refUID: nonce, // Dedup nonce — consumers should check refUID uniqueness
        data: encodedData,
      },
      options.signer,
    );

    return {
      uid: attestation.uid,
      chain,
      mode: 'offchain',
      recipient,
      finality,
      offchainAttestation: attestation,
    };
  }

  // On-chain attestation
  const tx = await eas.attest({
    schema: schemaUid,
    data: {
      recipient,
      expirationTime: 0n,
      revocable: true,
      data: encodedData,
    },
  });

  const uid = await tx.wait();
  const gasUsed = tx.receipt?.gasUsed ? BigInt(tx.receipt.gasUsed) : undefined;

  return {
    uid,
    txHash: tx.receipt?.hash,
    chain,
    mode: 'onchain',
    recipient,
    finality,
    gasUsed,
  };
}
