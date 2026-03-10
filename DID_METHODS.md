# DID Methods & Address Mapping

## Overview

EXIT attestations use DID-derived Ethereum addresses as the EAS `recipient` field. This document explains how each supported DID method maps to an address and the implications for key management.

## did:key — Synthetic Addresses

`did:key` identifiers (typically Ed25519 keys) have no native Ethereum address. The adapter derives a **synthetic address** via `keccak256(did_string)`, taking the last 20 bytes.

**Important:**
- These addresses are **not real EOAs** — no private key controls them
- They **cannot send transactions** or hold funds
- They exist solely as deterministic identifiers for the EAS recipient field
- The same `did:key` always produces the same address

```
did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
  → keccak256("did:key:z6Mk...") → 0x<last 40 hex chars>
```

## did:ethr — Key Rotation

`did:ethr` maps directly to an Ethereum address (`did:ethr:0x1234...` → `0x1234...`).

**Key rotation behavior:**
- Attestations bind to the address **at anchor time**
- If `changeOwner` is called on the DID registry, the old address no longer controls the DID
- However, **old attestations remain valid** — they record a historical fact
- This is forward-only rotation, consistent with W3C DID Core and KERI principles
- New attestations should use the new owner address

**Recommendation:** Consumers should verify the current DID Document (via a DID resolver) before trusting attestations from a `did:ethr` subject. If `changeOwner` has been called, the consumer may want to treat pre-rotation attestations differently depending on their trust policy.

```typescript
// Example: resolve did:ethr before trusting
import { Resolver } from 'did-resolver';
import { getResolver } from 'ethr-did-resolver';

const resolver = new Resolver(getResolver({ infuraProjectId: '...' }));
const doc = await resolver.resolve('did:ethr:0x1234...');

// Check if the DID document's controller matches the attester
const controller = doc.didDocument?.controller;
```

## did:pkh — Chain ID Discarded

`did:pkh:eip155:<chainId>:0x...` extracts the address directly. The chain ID is **intentionally discarded**.

**Rationale:**
- The EAS recipient is an Ethereum address, valid across all EVM chains
- `did:pkh:eip155:1:0x1234...` and `did:pkh:eip155:137:0x1234...` produce the **same recipient**
- The attestation's target chain is determined by which EAS contract it's submitted to, not the DID's chain ID
- This is correct: the attestation is *about* the address, not *from* it

## Summary

| DID Method | Address Source | Real EOA? | Key Rotation |
|-----------|---------------|-----------|--------------|
| `did:ethr` | Direct extraction | Yes | `changeOwner` — forward-only |
| `did:pkh` | Direct extraction (chain ID dropped) | Yes | N/A (address-based) |
| `did:key` | `keccak256(did)` last 20 bytes | **No** (synthetic) | N/A (immutable) |
