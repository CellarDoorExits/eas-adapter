import { EAS, SchemaEncoder } from '@ethereum-attestation-service/eas-sdk';
import { verifyTypedData } from 'ethers';
import { getChainConfig, getSchemaUid } from './chains.js';
import { EXIT_SCHEMA, EXIT_SCHEMA_MINIMAL, EXIT_SCHEMA_COMMITMENT, uintToExitType, uintToStatus } from './codec.js';
import type {
  ChainName, VerifyOptions, VerifyResult, SchemaMode,
  DecodedExitData, DecodedMinimalExitData, DecodedCommitmentExitData,
  OffchainAttestationObject,
} from './types.js';

/**
 * Options for off-chain attestation verification.
 */
export interface OffchainVerifyOptions {
  /** Expected chain for EIP-712 domain validation */
  chain?: ChainName;
  /** If true, skip domain validation (not recommended) */
  skipDomainCheck?: boolean;
}

/**
 * Try to decode attestation data with a given schema string.
 * Returns the decoded items array on success, or null on failure.
 */
function tryDecode(schema: string, data: string): Array<{ name: string; value: { value: unknown }; type: string }> | null {
  try {
    const encoder = new SchemaEncoder(schema);
    const decoded = encoder.decodeData(data);
    return decoded as Array<{ name: string; value: { value: unknown }; type: string }>;
  } catch {
    return null;
  }
}

/**
 * Decode already-parsed schema items into typed EXIT data for a known mode.
 */
function decodeItems(
  mode: SchemaMode,
  items: Array<{ name: string; value: { value: unknown }; type: string }>,
): { mode: SchemaMode; decoded: DecodedExitData | DecodedMinimalExitData | DecodedCommitmentExitData } {
  const decodedMap = new Map(items.map(item => [item.name, item.value]));
  const get = (key: string): unknown => {
    const v = decodedMap.get(key);
    return v && typeof v === 'object' && 'value' in v ? (v as { value: unknown }).value : v;
  };

  if (mode === 'full') {
    return {
      mode,
      decoded: {
        exitId: String(get('exitId') ?? ''),
        subjectDid: String(get('subjectDid') ?? ''),
        origin: String(get('origin') ?? ''),
        timestamp: Number(get('timestamp') ?? 0),
        exitType: uintToExitType(Number(get('exitType') ?? 0)),
        status: uintToStatus(Number(get('status') ?? 0)),
        selfAttested: Boolean(get('selfAttested') ?? false),
        lineageHash: String(get('lineageHash') ?? ''),
        vcUri: String(get('vcUri') ?? ''),
      } satisfies DecodedExitData,
    };
  } else if (mode === 'minimal') {
    return {
      mode,
      decoded: {
        exitHash: String(get('exitHash') ?? ''),
        subjectDid: String(get('subjectDid') ?? ''),
        vcUri: String(get('vcUri') ?? ''),
      } satisfies DecodedMinimalExitData,
    };
  } else {
    return {
      mode,
      decoded: {
        exitHash: String(get('exitHash') ?? ''),
        vcUri: String(get('vcUri') ?? ''),
      } satisfies DecodedCommitmentExitData,
    };
  }
}

/**
 * Detect which schema mode was used and decode the data accordingly.
 */
function detectAndDecode(data: string): {
  mode: SchemaMode;
  decoded: DecodedExitData | DecodedMinimalExitData | DecodedCommitmentExitData;
} {
  // Try full schema first (most fields)
  const fullDecoded = tryDecode(EXIT_SCHEMA, data);
  if (fullDecoded) {
    const decodedMap = new Map(fullDecoded.map(item => [item.name, item.value]));
    const get = (key: string): unknown => {
      const v = decodedMap.get(key);
      return v && typeof v === 'object' && 'value' in v ? (v as { value: unknown }).value : v;
    };

    return {
      mode: 'full',
      decoded: {
        exitId: String(get('exitId') ?? ''),
        subjectDid: String(get('subjectDid') ?? ''),
        origin: String(get('origin') ?? ''),
        timestamp: Number(get('timestamp') ?? 0),
        exitType: uintToExitType(Number(get('exitType') ?? 0)),
        status: uintToStatus(Number(get('status') ?? 0)),
        selfAttested: Boolean(get('selfAttested') ?? false),
        lineageHash: String(get('lineageHash') ?? ''),
        vcUri: String(get('vcUri') ?? ''),
      } satisfies DecodedExitData,
    };
  }

  // Try minimal schema (3 fields with subjectDid)
  const minDecoded = tryDecode(EXIT_SCHEMA_MINIMAL, data);
  if (minDecoded) {
    const decodedMap = new Map(minDecoded.map(item => [item.name, item.value]));
    const get = (key: string): unknown => {
      const v = decodedMap.get(key);
      return v && typeof v === 'object' && 'value' in v ? (v as { value: unknown }).value : v;
    };

    return {
      mode: 'minimal',
      decoded: {
        exitHash: String(get('exitHash') ?? ''),
        subjectDid: String(get('subjectDid') ?? ''),
        vcUri: String(get('vcUri') ?? ''),
      } satisfies DecodedMinimalExitData,
    };
  }

  // Try commitment schema (2 fields, no personal data)
  const commitDecoded = tryDecode(EXIT_SCHEMA_COMMITMENT, data);
  if (commitDecoded) {
    const decodedMap = new Map(commitDecoded.map(item => [item.name, item.value]));
    const get = (key: string): unknown => {
      const v = decodedMap.get(key);
      return v && typeof v === 'object' && 'value' in v ? (v as { value: unknown }).value : v;
    };

    return {
      mode: 'commitment',
      decoded: {
        exitHash: String(get('exitHash') ?? ''),
        vcUri: String(get('vcUri') ?? ''),
      } satisfies DecodedCommitmentExitData,
    };
  }

  throw new Error('Unable to decode attestation data: does not match any known EXIT schema');
}

/**
 * Verify an anchored EXIT attestation by UID.
 *
 * Fetches the attestation from the on-chain EAS contract, decodes
 * the EXIT marker fields, and checks revocation status.
 * Automatically detects which schema mode (full/minimal/commitment) was used.
 *
 * @example
 * ```typescript
 * import { verifyAnchor } from '@cellar-door/eas';
 * import { JsonRpcProvider } from 'ethers';
 *
 * const provider = new JsonRpcProvider('https://mainnet.base.org');
 * const result = await verifyAnchor(uid, { chain: 'base', provider });
 *
 * if (result.valid && !result.revoked) {
 *   if (result.schemaMode === 'full') {
 *     console.log(`EXIT by ${(result.attestation.data as DecodedExitData).exitId} is valid`);
 *   }
 * }
 * ```
 */
export async function verifyAnchor(
  uid: string,
  options: VerifyOptions,
): Promise<VerifyResult> {
  const chain = options.chain ?? 'base';
  const config = getChainConfig(chain);

  const eas = new EAS(config.easAddress);
  eas.connect(options.provider);

  const attestation = await eas.getAttestation(uid);

  if (!attestation || attestation.schema === '0x0000000000000000000000000000000000000000000000000000000000000000') {
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
        data: {} as DecodedExitData,
      },
    };
  }

  // Try to match schema UID against known UIDs before brute-force decode.
  // This prevents false-positive ABI decoding on wrong schemas.
  let mode: SchemaMode;
  let decoded: DecodedExitData | DecodedMinimalExitData | DecodedCommitmentExitData;

  const schemaUid = attestation.schema;
  const knownModes: SchemaMode[] = ['full', 'minimal', 'commitment'];
  const schemaStrings: Record<SchemaMode, string> = {
    full: EXIT_SCHEMA,
    minimal: EXIT_SCHEMA_MINIMAL,
    commitment: EXIT_SCHEMA_COMMITMENT,
  };

  let matchedByUid = false;
  for (const m of knownModes) {
    const uid = getSchemaUid(chain, m);
    if (uid && uid.toLowerCase() === schemaUid.toLowerCase()) {
      // Known UID — decode with the specific schema
      const items = tryDecode(schemaStrings[m], attestation.data);
      if (!items) {
        throw new Error(`Attestation matches ${m} schema UID but data failed to decode`);
      }
      const result = decodeItems(m, items);
      mode = result.mode;
      decoded = result.decoded;
      matchedByUid = true;
      break;
    }
  }

  if (!matchedByUid) {
    // Fall back to brute-force detection (for chains where UIDs weren't pre-registered)
    const result = detectAndDecode(attestation.data);
    mode = result.mode;
    decoded = result.decoded;
  }

  const revocationTime = Number(attestation.revocationTime ?? 0);

  return {
    valid: true,
    revoked: revocationTime > 0,
    schemaMode: mode,
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

/**
 * Verify an off-chain EXIT attestation.
 *
 * Verifies the EIP-712 signature, decodes the schema data, and returns
 * a VerifyResult. Off-chain attestations cannot be revoked on-chain,
 * so `revoked` is always `false`.
 *
 * @warning **Domain validation is strongly recommended.** Always pass `chain`
 * in the options to enable EIP-712 domain separator validation. Without it,
 * an attestation signed for one chain could be replayed on another (cross-chain
 * replay attack). When `chain` is omitted, the result will have
 * `domainValidated: false` — callers should treat this as reduced assurance.
 *
 * @param attestation - The signed off-chain attestation object
 * @param options - Verification options. Pass `chain` for cross-chain protection.
 * @returns VerifyResult with valid=true if signature is valid
 *
 * @example
 * ```typescript
 * import { verifyOffchainAnchor } from '@cellar-door/eas';
 *
 * // Recommended: always pass chain for domain validation
 * const result = verifyOffchainAnchor(offchainAttestation, { chain: 'base' });
 * if (result.valid && result.domainValidated) {
 *   console.log(`Valid off-chain attestation by ${result.attestation.attester}`);
 * }
 * ```
 */
export function verifyOffchainAnchor(
  attestation: OffchainAttestationObject,
  options?: OffchainVerifyOptions,
): VerifyResult {
  try {
    const { sig, signer, uid, message } = attestation;

    // Verify EIP-712 signature
    const recoveredAddress = verifyTypedData(
      sig.domain as Record<string, string | number | bigint>,
      sig.types as Record<string, Array<{ name: string; type: string }>>,
      message,
      {
        v: sig.signature.v,
        r: sig.signature.r,
        s: sig.signature.s,
      },
    );

    const valid = recoveredAddress.toLowerCase() === signer.toLowerCase();

    // Validate EIP-712 domain separator if chain is specified
    let domainValidated = false;
    if (options?.chain && !options?.skipDomainCheck) {
      const chainConfig = getChainConfig(options.chain);
      const domain = sig.domain as Record<string, unknown>;
      const domainChainId = Number(domain.chainId ?? 0);
      const domainContract = String(domain.verifyingContract ?? '').toLowerCase();

      if (domainChainId !== chainConfig.chainId) {
        return {
          valid: false,
          revoked: false,
          attestation: {
            uid,
            schema: message.schema,
            attester: signer,
            recipient: message.recipient,
            time: Number(message.time ?? 0),
            revocationTime: 0,
            data: {} as DecodedExitData,
          },
        };
      }

      if (domainContract !== chainConfig.easAddress.toLowerCase()) {
        return {
          valid: false,
          revoked: false,
          attestation: {
            uid,
            schema: message.schema,
            attester: signer,
            recipient: message.recipient,
            time: Number(message.time ?? 0),
            revocationTime: 0,
            data: {} as DecodedExitData,
          },
        };
      }

      domainValidated = true;
    }

    // Decode the schema data
    let decoded: DecodedExitData | DecodedMinimalExitData | DecodedCommitmentExitData;
    let schemaMode: SchemaMode;
    let decodeError = false;

    try {
      const result = detectAndDecode(message.data);
      decoded = result.decoded;
      schemaMode = result.mode;
    } catch {
      // Decode failed — signal partial verification
      decoded = {} as DecodedExitData;
      schemaMode = 'unknown' as SchemaMode;
      decodeError = true;
    }

    return {
      valid,
      revoked: false, // Off-chain attestations can't be revoked on-chain
      schemaMode,
      ...(decodeError ? { decodeError: true } : {}),
      ...(options?.chain ? { domainValidated } : (!options?.skipDomainCheck ? { domainValidated: false } : {})),
      attestation: {
        uid,
        schema: message.schema,
        attester: signer,
        recipient: message.recipient,
        time: Number(message.time ?? 0),
        revocationTime: 0,
        data: decoded,
      },
    };
  } catch {
    return {
      valid: false,
      revoked: false,
      attestation: {
        uid: attestation.uid ?? '',
        schema: '',
        attester: '',
        recipient: '',
        time: 0,
        revocationTime: 0,
        data: {} as DecodedExitData,
      },
    };
  }
}
