import { EAS, SchemaEncoder } from '@ethereum-attestation-service/eas-sdk';
import { getChainConfig } from './chains.js';
import { getArrivalSchemaUid } from './chains.js';
import { ARRIVAL_SCHEMA, encodeArrivalData, didToAddress, computeOffchainNonce } from './codec.js';
import type { ArrivalMarkerLike, AnchorOptions, AnchorResult } from './types.js';

/**
 * Anchor an ARRIVAL marker as an EAS attestation.
 *
 * Creates an on-chain or off-chain attestation recording the agent's
 * arrival at a new platform. Links back to the departure (exit)
 * attestation via the `departureRef` field in the schema data.
 *
 * @example
 * ```typescript
 * import { anchorArrival } from '@cellar-door/eas';
 *
 * const result = await anchorArrival(arrivalMarker, {
 *   chain: 'base',
 *   signer,
 *   vcUri: 'ipfs://bafybeig...',
 * });
 * console.log(`Anchored arrival: ${result.uid}`);
 * ```
 */
export async function anchorArrival(
  marker: ArrivalMarkerLike,
  options: AnchorOptions,
): Promise<AnchorResult> {
  const chain = options.chain ?? 'base';
  const mode = options.mode ?? 'onchain';
  const config = getChainConfig(chain);

  const schemaUid = options.schemaUid ?? getArrivalSchemaUid(chain);
  if (!schemaUid) {
    throw new Error(
      `No ARRIVAL schema UID configured for ${chain}. ` +
      `Register the schema first with registerArrivalSchema(), or pass schemaUid in options.`
    );
  }

  const eas = new EAS(config.easAddress);
  eas.connect(options.signer);

  const schemaEncoder = new SchemaEncoder(ARRIVAL_SCHEMA);
  const schemaData = encodeArrivalData(marker, options.vcUri);
  const encodedData = schemaEncoder.encodeData(schemaData);

  const recipient = didToAddress(marker.subject);

  const finality = mode === 'offchain' ? 'offchain' as const
    : (chain === 'ethereum' ? 'l1-pending' as const : 'sequencer' as const);

  if (mode === 'offchain') {
    const now = Math.floor(Date.now() / 1000);
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
        refUID: nonce,
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
