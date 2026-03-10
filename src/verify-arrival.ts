import { EAS, SchemaEncoder } from '@ethereum-attestation-service/eas-sdk';
import { getChainConfig, getArrivalSchemaUid } from './chains.js';
import { ARRIVAL_SCHEMA, decodeArrivalData } from './codec.js';
import type { VerifyOptions, ArrivalVerifyResult, DecodedArrivalData } from './types.js';

/**
 * Verify an anchored ARRIVAL attestation by UID.
 *
 * Fetches the attestation from the on-chain EAS contract, decodes
 * the ARRIVAL marker fields, and checks revocation status.
 *
 * @example
 * ```typescript
 * import { verifyArrivalAnchor } from '@cellar-door/eas';
 * import { JsonRpcProvider } from 'ethers';
 *
 * const provider = new JsonRpcProvider('https://mainnet.base.org');
 * const result = await verifyArrivalAnchor(uid, { chain: 'base', provider });
 *
 * if (result.valid && !result.revoked) {
 *   console.log(`Arrival by ${result.attestation.data.subjectDid} is valid`);
 *   console.log(`Linked departure: ${result.attestation.data.departureRef}`);
 * }
 * ```
 */
export async function verifyArrivalAnchor(
  uid: string,
  options: VerifyOptions,
): Promise<ArrivalVerifyResult> {
  const chain = options.chain ?? 'base';
  const config = getChainConfig(chain);

  const eas = new EAS(config.easAddress);
  eas.connect(options.provider);

  const attestation = await eas.getAttestation(uid);

  const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

  if (!attestation || attestation.schema === ZERO_BYTES32) {
    return {
      valid: false,
      revoked: false,
      attestation: {
        uid,
        schema: '',
        attester: '',
        recipient: '',
        time: 0,
        revocationTime: 0,
        data: {} as DecodedArrivalData,
      },
    };
  }

  // Decode the arrival schema data
  const encoder = new SchemaEncoder(ARRIVAL_SCHEMA);
  const items = encoder.decodeData(attestation.data) as Array<{ name: string; value: { value: unknown }; type: string }>;
  const decoded = decodeArrivalData(items);

  const revocationTime = Number(attestation.revocationTime ?? 0);

  return {
    valid: true,
    revoked: revocationTime > 0,
    attestation: {
      uid,
      schema: attestation.schema,
      attester: attestation.attester,
      recipient: attestation.recipient,
      time: Number(attestation.time ?? 0),
      revocationTime,
      data: decoded,
    },
  };
}
