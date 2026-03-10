# @cellar-door/eas 𓉸

> Anchor EXIT departure markers as on-chain attestations via [EAS](https://attest.org) (Ethereum Attestation Service).

> **[𓉸 Passage Protocol](https://cellar-door.dev)** · [exit-door](https://github.com/CellarDoorExits/exit-door) · [entry-door](https://github.com/CellarDoorExits/entry-door) · [mcp](https://github.com/CellarDoorExits/mcp-server) · [langchain](https://github.com/CellarDoorExits/langchain) · [vercel](https://github.com/CellarDoorExits/vercel-ai-sdk) · [eliza](https://github.com/CellarDoorExits/eliza-exit) · [eas](https://github.com/CellarDoorExits/eas-adapter) · [erc-8004](https://github.com/CellarDoorExits/erc-8004-adapter) · [sign](https://github.com/CellarDoorExits/sign-protocol-adapter) · [python](https://github.com/CellarDoorExits/exit-python)

⚠️ **Pre-release software.** No formal security audit has been performed. Use at your own risk. Report vulnerabilities to hawthornhollows@gmail.com.

## What This Does

EXIT markers are verifiable departure records for AI agents. This package anchors them on-chain as EAS attestations — non-transferable, permanent, queryable records on Base L2 (or any EVM chain where EAS is deployed).

EAS attestations are **inherently soul-bound** — they cannot be transferred, sold, or traded. No SBT wrapper needed.

## Install

```bash
npm install @cellar-door/eas
```

## Quick Start

```typescript
import { anchorExit, verifyAnchor, registerExitSchema, setExitSchemaUid } from '@cellar-door/eas';
import { Wallet, JsonRpcProvider } from 'ethers';

const provider = new JsonRpcProvider('https://mainnet.base.org');
const signer = new Wallet(process.env.PRIVATE_KEY!, provider);

// One-time: register the EXIT schema on Base
const { schemaUid } = await registerExitSchema({ chain: 'base', signer });

// Or configure a known schema UID
setExitSchemaUid('base', '0x...');

// Anchor an EXIT marker on-chain
const result = await anchorExit(marker, {
  chain: 'base',
  signer,
  vcUri: 'ipfs://bafybeig...',
});
console.log(`Anchored: ${result.uid}`);

// Verify an anchored attestation
const verification = await verifyAnchor(result.uid, { chain: 'base', provider });
if (verification.valid && !verification.revoked) {
  console.log(`Valid EXIT by ${verification.attestation.attester}`);
}
```

## Three-Tier Schema System

Choose the right level of on-chain data exposure for your use case:

| Mode | Schema | On-chain Data | Use Case |
|------|--------|---------------|----------|
| **`full`** | All fields | exitId, subjectDid, recipient, origin, timestamp, exitType, status, selfAttested, lineageHash, vcUri | Maximum queryability, public attestations |
| **`minimal`** | Hash + DID + URI | exitHash, subjectDid, vcUri | Reduced data, keeps DID for lookups |
| **`commitment`** (default) | Hash + URI only | exitHash, vcUri | **True GDPR-safe** — no personal data on-chain |

### Usage

```typescript
// Commitment mode (default) — GDPR-safe, no personal data on-chain
await anchorExit(marker, { chain: 'base', signer });

// Minimal mode — commitment hash + DID + VC URI
await anchorExit(marker, { chain: 'base', signer, schemaMode: 'minimal' });

// Full mode — all fields on-chain for maximum queryability
await anchorExit(marker, { chain: 'base', signer, schemaMode: 'full' });

// Backwards compat: minimal: true still works
await anchorExit(marker, { chain: 'base', signer, minimal: true }); // → schemaMode: 'minimal'
```

### Schema Registration

Each mode has its own schema UID (content-addressed). Register once per chain per mode:

```typescript
await registerExitSchema({ chain: 'base', signer });                          // full
await registerExitSchema({ chain: 'base', signer, mode: 'minimal' });         // minimal
await registerExitSchema({ chain: 'base', signer, mode: 'commitment' });      // commitment
```

## Off-chain Attestations

Off-chain attestations are signed EIP-712 data that can be stored anywhere.

```typescript
// Create off-chain attestation
const result = await anchorExit(marker, {
  chain: 'base',
  signer,
  mode: 'offchain',
  schemaMode: 'commitment',
});

// Verify off-chain attestation
import { verifyOffchainAnchor } from '@cellar-door/eas';
const verification = verifyOffchainAnchor(result.offchainAttestation);
```

**Deduplication:** Off-chain attestations include a deterministic nonce in the `refUID` field (derived from `keccak256(markerId + chain + timestamp)`). Consumers should check `refUID` uniqueness to detect duplicates.

## API

### `anchorExit(marker, options)` → `AnchorResult`
Anchor an EXIT marker as an EAS attestation (on-chain or off-chain).

### `verifyAnchor(uid, options)` → `VerifyResult`
Verify an on-chain EXIT attestation by UID. Auto-detects schema mode (full/minimal/commitment).

### `verifyOffchainAnchor(attestation)` → `VerifyResult`
Verify an off-chain EXIT attestation. Checks EIP-712 signature and decodes schema data.

### `revokeAnchor(uid, options)` → `RevokeResult`
Revoke an on-chain EXIT attestation.

### `registerExitSchema(options)` → `RegisterSchemaResult`
Register the EXIT schema on a chain (one-time per mode).

### `setExitSchemaUid(chain, uid, mode?)`
Configure a known schema UID without re-registering.

### `didToAddress(did)` → `string`
Convert a DID to an Ethereum address. Supports `did:ethr`, `did:pkh`, and `did:key`.

## Supported Chains

| Chain | Cost/attestation | EAS Version |
|-------|-----------------|-------------|
| **Base** (default) | ~$0.002 | v1.0.1 (native) |
| Optimism | ~$0.002 | v1.0.1 (native) |
| Arbitrum | ~$0.01 | v0.26 |
| Ethereum | ~$5-30 | v0.26 |
| Sepolia (testnet) | Free | v0.26 |

## DID Support

| DID Method | Example | Mapping |
|-----------|---------|---------|
| `did:ethr` | `did:ethr:0x1234...` | Direct address extraction |
| `did:ethr` (network) | `did:ethr:base:0x1234...` | Direct address extraction |
| `did:pkh` | `did:pkh:eip155:8453:0x1234...` | Direct address extraction |
| `did:key` | `did:key:z6Mk...` | keccak256-derived address |

## Security Considerations

**Attestations are permissionless.** Anyone can create an attestation against EXIT schemas. Consumers MUST verify the `attester` address against a trusted set before accepting attestation data. See **[TRUST_MODEL.md](./TRUST_MODEL.md)** for details and code examples.

## GDPR Compliance

For EU deployments, use `schemaMode: 'commitment'` to avoid storing personal data on-chain. See **[GDPR_GUIDE.md](./GDPR_GUIDE.md)** for the full deployment guide, crypto-shredding pattern, and DPIA requirements.

## Additional Documentation

| Document | Description |
|----------|-------------|
| [TRUST_MODEL.md](./TRUST_MODEL.md) | Permissionless attestation model & attester verification |
| [DID_METHODS.md](./DID_METHODS.md) | DID method address mapping, synthetic addresses, key rotation |
| [GDPR_GUIDE.md](./GDPR_GUIDE.md) | EU deployment guide, commitment mode, crypto-shredding |

## Ecosystem

| Package | Language | Description |
|---------|----------|-------------|
| [cellar-door-exit](https://github.com/CellarDoorExits/exit-door) | TypeScript | Core protocol (reference impl) |
| [cellar-door-exit](https://github.com/CellarDoorExits/exit-python) | Python | Core protocol |
| [cellar-door-entry](https://github.com/CellarDoorExits/entry-door) | TypeScript | Arrival/entry markers |
| [@cellar-door/langchain](https://github.com/CellarDoorExits/langchain) | TypeScript | LangChain integration |
| [cellar-door-langchain](https://github.com/CellarDoorExits/cellar-door-langchain-python) | Python | LangChain integration |
| [@cellar-door/vercel-ai-sdk](https://github.com/CellarDoorExits/vercel-ai-sdk) | TypeScript | Vercel AI SDK |
| [@cellar-door/mcp-server](https://github.com/CellarDoorExits/mcp-server) | TypeScript | MCP server |
| [@cellar-door/eliza](https://github.com/CellarDoorExits/eliza-exit) | TypeScript | ElizaOS plugin |
| **[@cellar-door/eas](https://github.com/CellarDoorExits/eas-adapter)** | **TypeScript** | **EAS attestation anchoring ← you are here** |
| [@cellar-door/erc-8004](https://github.com/CellarDoorExits/erc-8004-adapter) | TypeScript | ERC-8004 identity/reputation |
| [@cellar-door/sign-protocol](https://github.com/CellarDoorExits/sign-protocol-adapter) | TypeScript | Sign Protocol attestation |

**[Paper](https://cellar-door.dev/paper/) · [Website](https://cellar-door.dev)**

## License

Apache-2.0
