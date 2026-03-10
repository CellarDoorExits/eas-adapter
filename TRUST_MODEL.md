# Trust Model

## Permissionless Attestations

EAS attestations are **permissionless by design** — anyone can create an attestation against any schema, including EXIT schemas. This is not a bug; it mirrors the W3C Verifiable Credentials trust model where anyone can issue a credential and verifiers decide whom to trust.

## What This Means

- **Any Ethereum address** can call `EAS.attest()` with an EXIT schema UID
- The `attester` field records who created the attestation
- There is **no on-chain restriction** on who can attest (no resolver contract in v1)
- Consumers **MUST** verify the `attester` address against their own trusted set

## Why This Is Fine

This is consistent with established trust models:

- **W3C VCs:** Anyone can issue a Verifiable Credential. The verifier decides which issuers to trust.
- **PGP/GPG:** Anyone can sign a key. The web of trust determines which signatures matter.
- **DNS/TLS:** Anyone can request a certificate. Browsers maintain trusted CA lists.

The attestation itself is cryptographically sound. Trust is a layer above.

## Attester Verification (Required)

Consumers MUST check the `attester` address before trusting an attestation:

```typescript
import { verifyAnchor } from '@cellar-door/eas';

const TRUSTED_ATTESTERS = new Set([
  '0xYourTrustedAttester1...',
  '0xYourTrustedAttester2...',
]);

const result = await verifyAnchor(uid, { chain: 'base', provider });

if (!result.valid || result.revoked) {
  throw new Error('Invalid or revoked attestation');
}

if (!TRUSTED_ATTESTERS.has(result.attestation.attester)) {
  throw new Error(
    `Untrusted attester: ${result.attestation.attester}. ` +
    `Only attestations from known operators should be accepted.`
  );
}

// Safe to use attestation data
console.log('Trusted attestation:', result.attestation.data);
```

## Resolver Contract (Planned for v2)

A resolver contract that restricts which addresses can create EXIT attestations is planned for v2. This will provide an on-chain allowlist, but the off-chain trust verification pattern above will remain the recommended approach for most consumers.

## Off-chain Attestations

For off-chain attestations, the `signer` field serves the same role as `attester`. Verify it against your trusted set identically.
