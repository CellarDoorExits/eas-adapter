import { EAS } from '@ethereum-attestation-service/eas-sdk';
import { getChainConfig } from './chains.js';
import type { RevokeOptions, RevokeResult } from './types.js';

/**
 * Revoke an anchored EXIT attestation.
 *
 * Sets the revocationTime on-chain, flagging the attestation as revoked.
 * The attestation data remains on-chain but is marked invalid.
 * Revocation requires the original attester's signer.
 *
 * @example
 * ```typescript
 * import { revokeAnchor } from '@cellar-door/eas';
 *
 * const result = await revokeAnchor(uid, {
 *   chain: 'base',
 *   signer,
 *   reason: 'Marker issued in error',
 * });
 * console.log(`Revoked at ${result.revocationTime}`);
 * ```
 */
export async function revokeAnchor(
  uid: string,
  options: RevokeOptions,
): Promise<RevokeResult> {
  const chain = options.chain ?? 'base';
  const config = getChainConfig(chain);

  // We need the schema UID to revoke. Fetch the attestation first.
  const eas = new EAS(config.easAddress);
  eas.connect(options.signer);

  const attestation = await eas.getAttestation(uid);
  if (!attestation) {
    throw new Error(`Attestation not found: ${uid}`);
  }

  if (Number(attestation.revocationTime ?? 0) > 0) {
    throw new Error(`Attestation already revoked: ${uid}`);
  }

  const tx = await eas.revoke({
    schema: attestation.schema,
    data: {
      uid,
      value: 0n,
    },
  });

  await tx.wait();

  return {
    txHash: tx.receipt?.hash ?? '',
    revocationTime: Math.floor(Date.now() / 1000),
  };
}
