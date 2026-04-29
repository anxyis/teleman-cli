# Teleman CLI — Security & Encryption Guide

This document covers Teleman's encryption architecture, key management, password handling, and security best practices.

## Encryption Architecture

Teleman encrypts at the **chunk level** using **AES-256-GCM** (Galois/Counter Mode). Each chunk is individually encrypted before leaving your machine — Telegram never sees plaintext data.

### Pipeline Order

```
Upload:   Read → Chunk → Encrypt → Hash → Upload to Telegram
Download: Download → Hash Verify → Decrypt → Write to Disk
```

The hash is computed on the **encrypted** bytes. This means:
- Hash verification works without knowing the password
- Any tampering of encrypted chunks is detected before decryption
- The download pipeline can fail fast on corruption without attempting decryption

## Key Derivation

Teleman uses **scrypt** (N=32768, r=8, p=1) to derive a 32-byte AES-256 key from your passphrase. This provides:

- **Brute-force resistance**: scrypt is memory-hard, making GPU attacks expensive
- **Unique Per-Chunk Salts**: New files use a cryptographically secure random 16-byte salt for every chunk. This prevents AES-GCM key-reuse and nonce-exhaustion vulnerabilities.
- **Magic Header (TLM1)**: Encrypted files now include a `TLM1` magic header, salt, and nonce prepended to the ciphertext.
- **Backward Compatibility**: Teleman automatically detects legacy files (using deterministic salts) and handles them seamlessly.
- **No external key storage**: You don't need to manage key files — your passphrase _is_ the key.

> ⚠️ **Important:** If you lose your passphrase, your data is unrecoverable. There is no master key or recovery mechanism.

## Password Sources (Priority Order)

When Teleman needs a password (for `--encrypt` on upload or `--password` on download), it checks these sources in order:

| Priority | Source | How to Use | Visibility |
|----------|--------|-----------|------------|
| 1 | `TELEMAN_PASSWORD` env var | `export TELEMAN_PASSWORD=mysecret` | Hidden from process list |
| 2 | Interactive terminal prompt | Automatic if stdin is a TTY | Hidden (masked input) |
| 3 | `--password` CLI flag | `--password mysecret` | ⚠️ Visible in `ps aux` |

### Recommended: Environment Variable

```bash
# Linux/macOS
export TELEMAN_PASSWORD="my-strong-passphrase"
teleman copy ./secrets/ vault:backup/ --encrypt

# Windows (PowerShell)
$env:TELEMAN_PASSWORD = "my-strong-passphrase"
.\teleman.exe copy .\secrets\ vault:backup/ --encrypt

# Windows (CMD)
set TELEMAN_PASSWORD=my-strong-passphrase
teleman copy .\secrets\ vault:backup/ --encrypt
```

### Interactive Prompt

If no env var or flag is set and stdin is a terminal, Teleman will prompt:

```
? Enter encryption/decryption password: ********
```

### CLI Flag (Not Recommended)

```bash
# Works but password is visible in process listings
teleman download vault:secrets/ ./decrypted/ --password "my-passphrase"
```

## Upload with Encryption

```bash
# Encrypt a single file
teleman copy ./passwords.kdbx vault: --encrypt

# Encrypt an entire directory
teleman copy ./ConfidentialDocs/ vault:docs/ --encrypt -t 8

# Encrypt with streaming archive
teleman copy ./Project/ vault:snapshots/ --encrypt --zip
```

## Download with Decryption

```bash
# Using environment variable (recommended)
TELEMAN_PASSWORD=mysecret teleman download vault:docs/ ./restored/

# Using interactive prompt (just run it, you'll be asked)
teleman download vault:docs/ ./restored/

# Using CLI flag (last resort)
teleman download vault:docs/ ./restored/ --password mysecret
```

## Security Properties

| Property | Status | Notes |
|----------|--------|-------|
| Encryption algorithm | AES-256-GCM | Authenticated encryption with associated data |
| Key derivation | scrypt (N=32768, r=8, p=1) | Memory-hard, GPU-resistant |
| Per-chunk encryption | ✅ | Each chunk independently encrypted |
| Hash verification on download | ✅ | SHA-256 on encrypted bytes, verified before decryption |
| Atomic writes | ✅ | `.partial` temp file renamed on success |
| Password in process list | Mitigated | Env var and prompt alternatives provided |
| Bot token storage | Config file (0600 perms) | `~/.config/teleman/config.json` |
| Index channel isolation | ✅ | Private channel, separate from file targets |

## Best Practices

1. **Always use `TELEMAN_PASSWORD` env var** for automated/scripted operations
2. **Use a strong passphrase** — scrypt helps, but weak passwords are still weak
3. **Keep your bot token secure** — anyone with the token can access your files
4. **Back up your passphrase** — lost passphrase = unrecoverable data
5. **Use `--dry-run`** before large encrypted uploads to verify file selection
6. **Test decryption** after your first encrypted upload to confirm the password works

---

> 📖 For command usage, see [command-guide.md](./command-guide.md).  
> 📖 For architecture details, see [architecture.md](./architecture.md).
