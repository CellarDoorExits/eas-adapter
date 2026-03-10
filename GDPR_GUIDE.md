# GDPR Deployment Guide

## TL;DR

**For EU deployments, use `commitment` mode.** It is the only mode that avoids putting personal data on-chain.

## The Problem

Blockchain data is immutable. GDPR requires the ability to erase personal data. These are fundamentally in tension.

Even pseudonymous Ethereum addresses derived from DIDs constitute **personal data** under GDPR (EDPB Guidelines 2025, recital 26 GDPR — data that can be linked back to a natural person through additional information).

## Schema Modes and GDPR

| Mode | On-chain Personal Data | GDPR Compatible? |
|------|----------------------|-------------------|
| `full` | subjectDid, recipient address, origin, exitId | ❌ Requires explicit consent + DPIA |
| `minimal` | subjectDid, recipient address | ❌ Requires explicit consent + DPIA |
| **`commitment`** | **None** (hash + vcUri only) | ✅ **Recommended for EU** |

### Why Commitment Mode Works

- Uses `bytes32 exitHash` (irreversible hash — not personal data alone)
- Uses zero address (`0x000...`) as recipient — no DID-derived address on-chain
- `vcUri` points to off-chain storage you control
- All personal data lives off-chain where it can be deleted

## Required Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  EAS Chain  │     │  Your Storage    │     │  Key Mgmt   │
│             │     │  (deletable!)    │     │  Service    │
│ exitHash    │────▶│  Encrypted VC    │◀────│  Per-subject│
│ vcUri ──────│     │  at vcUri        │     │  AES keys   │
│             │     │                  │     │             │
└─────────────┘     └──────────────────┘     └─────────────┘
```

### Storage Requirements

- **DO use:** Your own API, S3, PostgreSQL, or any mutable storage
- **DO NOT use:** Arweave, IPFS (without pinning control), or any immutable storage
- The `vcUri` endpoint **MUST** support deletion (HTTP DELETE or equivalent)

## Crypto-Shredding Pattern

Encrypt the VC at `vcUri` with a per-subject key. To "erase" data, destroy the key.

```typescript
import { anchorExit } from '@cellar-door/eas';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

// 1. Generate a per-subject encryption key (store in your key management service)
const subjectKey = randomBytes(32);
const iv = randomBytes(16);

// 2. Encrypt the VC before storing at vcUri
const vcJson = JSON.stringify(verifiableCredential);
const cipher = createCipheriv('aes-256-gcm', subjectKey, iv);
const encrypted = Buffer.concat([cipher.update(vcJson, 'utf8'), cipher.final()]);
const authTag = cipher.getAuthTag();

// 3. Store encrypted VC at a deletable endpoint
const vcUri = await myStorage.put({
  data: Buffer.concat([iv, authTag, encrypted]),
  contentType: 'application/octet-stream',
});

// 4. Anchor with commitment mode — no personal data on-chain
const result = await anchorExit(marker, {
  chain: 'base',
  signer,
  schemaMode: 'commitment',
  vcUri,
});

// 5. GDPR erasure request → destroy the key
async function handleErasureRequest(subjectId: string) {
  // Delete the encryption key — the VC at vcUri becomes unreadable
  await keyManagementService.deleteKey(subjectId);

  // Optionally also delete the encrypted blob
  await myStorage.delete(vcUri);

  // The on-chain attestation remains but contains only:
  // - exitHash (irreversible hash, not personal data without the VC)
  // - vcUri (now points to deleted/unreadable data)
}
```

## DPIA Requirement

A **Data Protection Impact Assessment** is mandatory when processing personal data on blockchain (EDPB Guidelines 2025). Even with commitment mode, you should document:

1. **Purpose:** Why are EXIT markers being anchored on-chain?
2. **Necessity:** Why is blockchain anchoring required vs. a traditional database?
3. **Data minimization:** Commitment mode stores only hashes (document this choice)
4. **Risks:** Immutability of hash, correlation attacks, key management failures
5. **Mitigations:** Crypto-shredding, deletable off-chain storage, access controls

## Data Controller

The entity operating the attestation service (calling `anchorExit()`) is likely the **GDPR data controller**. This entity is responsible for:

- Obtaining lawful basis for processing (consent, legitimate interest, etc.)
- Responding to data subject access/erasure requests
- Conducting the DPIA
- Maintaining records of processing activities

## Summary Checklist

- [ ] Use `schemaMode: 'commitment'` for all EU-related attestations
- [ ] Store VCs at deletable endpoints (not Arweave/immutable IPFS)
- [ ] Implement crypto-shredding with per-subject keys
- [ ] Complete a DPIA before going to production
- [ ] Document your lawful basis for processing
- [ ] Implement data subject access request (DSAR) handling
- [ ] Designate a data controller
