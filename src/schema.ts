import { SchemaRegistry } from '@ethereum-attestation-service/eas-sdk';
import { getChainConfig } from './chains.js';
import { setSchemaUid, getSchemaUid, setArrivalSchemaUid, getArrivalSchemaUid } from './chains.js';
import { EXIT_SCHEMA, EXIT_SCHEMA_MINIMAL, EXIT_SCHEMA_COMMITMENT, ARRIVAL_SCHEMA } from './codec.js';
import type { ChainName, SchemaMode, RegisterSchemaOptions, RegisterSchemaResult } from './types.js';

/**
 * Register the canonical EXIT marker schema on a chain.
 *
 * This is a one-time operation per chain per mode. The schema UID is
 * deterministic (content-addressed), so re-registration returns the same UID.
 *
 * Cost: ~100-150K gas (one-time). On Base: ~$0.01.
 *
 * @param options.mode - Schema mode: 'full' | 'minimal' | 'commitment' (default: 'full')
 * @param options.minimal - @deprecated Use `mode` instead. If both are set, `mode` takes precedence.
 *
 * @example
 * ```typescript
 * import { registerExitSchema } from '@cellar-door/eas';
 *
 * // Register full schema
 * const { schemaUid } = await registerExitSchema({ chain: 'base', signer });
 *
 * // Register commitment (GDPR-safe) schema
 * const { schemaUid: commitUid } = await registerExitSchema({
 *   chain: 'base', signer, mode: 'commitment',
 * });
 * ```
 */
export async function registerExitSchema(
  options: RegisterSchemaOptions & { mode?: SchemaMode; minimal?: boolean },
): Promise<RegisterSchemaResult> {
  const chain = options.chain ?? 'base';
  // mode takes precedence over deprecated minimal flag
  const mode: SchemaMode = options.mode ?? (options.minimal ? 'minimal' : 'full');
  const config = getChainConfig(chain);

  const registry = new SchemaRegistry(config.schemaRegistryAddress);
  registry.connect(options.signer);

  const schema = mode === 'commitment' ? EXIT_SCHEMA_COMMITMENT
    : mode === 'minimal' ? EXIT_SCHEMA_MINIMAL
    : EXIT_SCHEMA;

  const tx = await registry.register({
    schema,
    resolverAddress: '0x0000000000000000000000000000000000000000',
    revocable: true,
  });

  const schemaUid = await tx.wait();

  // Store in registry
  setSchemaUid(chain, schemaUid, mode);

  return {
    schemaUid,
    txHash: tx.receipt?.hash ?? '',
  };
}

/**
 * Get the EXIT schema UID for a chain, if previously registered.
 */
export function getExitSchemaUid(chain: ChainName = 'base', mode: SchemaMode = 'full'): string | null {
  return getSchemaUid(chain, mode) ?? null;
}

/**
 * Set the EXIT schema UID for a chain.
 *
 * Use this to configure a known schema UID without re-registering.
 * Typically called at application startup with pre-registered UIDs.
 *
 * @example
 * ```typescript
 * import { setExitSchemaUid } from '@cellar-door/eas';
 *
 * setExitSchemaUid('base', '0xabc...');                    // full schema
 * setExitSchemaUid('base', '0xdef...', 'minimal');          // minimal schema
 * setExitSchemaUid('base', '0xghi...', 'commitment');       // commitment schema
 * ```
 */
export function setExitSchemaUid(chain: ChainName, uid: string, mode: SchemaMode = 'full'): void {
  setSchemaUid(chain, uid, mode);
}

// ═══════════════════════════════════════════
// ARRIVAL Schema Registration
// ═══════════════════════════════════════════

/**
 * Register the canonical ARRIVAL marker schema on a chain.
 *
 * One-time operation per chain. The schema UID is deterministic (content-addressed).
 *
 * @example
 * ```typescript
 * const { schemaUid } = await registerArrivalSchema({ chain: 'base', signer });
 * ```
 */
export async function registerArrivalSchema(
  options: RegisterSchemaOptions,
): Promise<RegisterSchemaResult> {
  const chain = options.chain ?? 'base';
  const config = getChainConfig(chain);

  const registry = new SchemaRegistry(config.schemaRegistryAddress);
  registry.connect(options.signer);

  const tx = await registry.register({
    schema: ARRIVAL_SCHEMA,
    resolverAddress: '0x0000000000000000000000000000000000000000',
    revocable: true,
  });

  const schemaUid = await tx.wait();
  setArrivalSchemaUid(chain, schemaUid);

  return {
    schemaUid,
    txHash: tx.receipt?.hash ?? '',
  };
}

/**
 * Get the ARRIVAL schema UID for a chain, if previously registered.
 */
export function getArrivalSchemaUidForChain(chain: ChainName = 'base'): string | null {
  return getArrivalSchemaUid(chain) ?? null;
}

/**
 * Set the ARRIVAL schema UID for a chain.
 */
export function setArrivalSchemaUidForChain(chain: ChainName, uid: string): void {
  setArrivalSchemaUid(chain, uid);
}
