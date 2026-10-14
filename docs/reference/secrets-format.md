# RADSEC v1: the Secrets vault format

The File Manager's **Secrets** tool keeps passwords, secure notes, cards, small attachments and its own settings in ONE encrypted file, `file_manager_secrets.radsec`, in the app's data folder. This page describes the format byte by byte. It uses only standard parts: **Argon2id** (RFC 9106), **HKDF-SHA-256** (RFC 5869), **HMAC-SHA-256** and **AES-256-GCM** (NIST SP 800-38D). A tested, independent reference decryptor written with `node:crypto` only is in `tests/file_manager_secrets_format.test.ts`; it is written from this page, and a hard-coded known-answer file in the same test stops the format from drifting.

**This format has not been independently audited.** See [Security](../security.md#secrets-vault-radsec) for what it protects and what it does not.

## Contents

- [Overview](#overview)
- [The key hierarchy](#the-key-hierarchy)
- [The header](#the-header)
- [Deriving the keys](#deriving-the-keys)
- [The three wrappings of the data key](#the-three-wrappings-of-the-data-key)
- [The database blob](#the-database-blob)
- [What a reader must refuse](#what-a-reader-must-refuse)
- [What a writer does](#what-a-writer-does)
- [The database inside](#the-database-inside)
- [Backups, throttling and rollback](#backups-throttling-and-rollback)
- [Limits](#limits)
- [Choosing the cost](#choosing-the-cost)
- [See also](#see-also)

## Overview

```text
file   = header | ciphertext | tag(16)
header = fixed(64) | database nonce(12) | password wrap(60) | [recovery wrap(92)] | [device wrap(60)] | header MAC(32)
```

All integers are **big endian**. The whole database (every item, name, tag, folder, setting, the history, the attachments and the activity log) is ONE AES-256-GCM message. There is no plain index. The size of the file is visible, but the plaintext is padded to a multiple of 4096 bytes first, so the size says little about how many items there are.

## The key hierarchy

```text
master password (NFKC, UTF-8) ──Argon2id(salt, m, t, p)──▶ master(32) ─┐
key file (optional) ─HKDF("radsec v1 key file")──────────────▶ kf(32) ─┼─HKDF(salt, "radsec v1 password wrap key")─▶ password KEK ─┐
                                                                                                                                       │ AES-256-GCM wrap
recovery key (160 random bits) ─HKDF(recSalt, "radsec v1 recovery wrap key")──────────────────────────────────────▶ recovery KEK ──────┤   (3 independent copies)
device key (256 random bits, in the OS credential store) ─HKDF(vaultId, "radsec v1 device wrap key")───────────────▶ device KEK ───────┤
                                                                                                                                       ▼
                                                                                                         data key (256 random bits, stays the same)
                                                                         ┌───────────────────────────────────────────┴─────────────────────┐
                                                           HKDF(salt, "radsec v1 database key")                              HKDF(salt, "radsec v1 header mac key")
                                                                         ▼                                                                   ▼
                                                      AES-256-GCM key of the database blob                                    HMAC-SHA-256 key of the header
```

Changing the master password re-wraps the data key under a new password KEK; the database is not touched (the file is rewritten with a new nonce, as for any save). The recovery key and device wrappings do not depend on the Argon2 salt or settings, so they survive a password change and a re-key.

## The header

| Offset | Size | Field | Value |
|---:|---:|---|---|
| 0 | 8 | magic and version | ASCII `RADSEC01` (`52 41 44 53 45 43 30 31`) |
| 8 | 1 | KDF id | `1` = Argon2id (version 0x13) |
| 9 | 4 | memory | Argon2 memory in **KiB**, u32 |
| 13 | 1 | passes | Argon2 time cost *t* |
| 14 | 1 | parallelism | Argon2 lanes *p* |
| 15 | 1 | flags | bit 0 (`1`): a key file is needed. bit 1 (`2`): a recovery wrap is present. bit 2 (`4`): a device wrap is present. Other bits must be 0 |
| 16 | 32 | salt | random; Argon2 nonce **and** HKDF salt |
| 48 | 16 | vault id | random, public, fixed for the life of the vault; names the credential-store entry of the device key |
| 64 | 12 | database nonce | fresh random bytes at every save |
| 76 | 60 | password wrap | `nonce(12) | AES-256-GCM(data key)(32) | tag(16)` |
| 136 | 92 | recovery wrap | only when flag 2 is set: `recSalt(32) | nonce(12) | ciphertext(32) | tag(16)` |
| next | 60 | device wrap | only when flag 4 is set: `nonce(12) | ciphertext(32) | tag(16)` |
| last 32 | 32 | header MAC | HMAC-SHA-256 over every header byte before it, keyed with the header MAC key |

So the header is 168 bytes with no optional wrap, 260 with a recovery wrap only, 228 with a device wrap only, and 320 with both. The first 64 bytes ("fixed") are the same for the life of a vault, except that a re-key replaces the salt and settings.

## Deriving the keys

1. **Password bytes:** the typed password, Unicode **NFKC**, then UTF-8.
2. **Master:** `Argon2id(message = password bytes, nonce = salt, memory, passes, parallelism, tagLength = 32)`.
3. **Key file (optional):** `kf = HKDF-SHA-256(ikm = key file bytes, salt = salt, info = "radsec v1 key file", L = 32)`. The key file can be any file of 1 byte to 1 MiB; the program makes 64 random bytes.
4. **Password KEK:** `HKDF-SHA-256(ikm = master [| kf], salt = salt, info = "radsec v1 password wrap key", L = 32)`. The ikm is `master` alone when flag 0 is clear, and `master | kf` (64 bytes) when it is set.
5. **Recovery KEK:** `HKDF-SHA-256(ikm = recovery key (20 bytes), salt = recSalt, info = "radsec v1 recovery wrap key", L = 32)`. The recovery key is 160 random bits, written for people as 32 characters of Crockford base32 (no I, L, O or U) in 8 groups of 4.
6. **Device KEK:** `HKDF-SHA-256(ikm = device key (32 bytes), salt = vault id, info = "radsec v1 device wrap key", L = 32)`.
7. **Database key** and **header MAC key:** `HKDF-SHA-256(ikm = data key, salt = salt, info = "radsec v1 database key" | "radsec v1 header mac key", L = 32)`.

## The three wrappings of the data key

Each wrap is `AES-256-GCM(KEK, nonce, aad, data key)` with a fresh random 96-bit nonce, giving 32 bytes of ciphertext and a 16-byte tag. The additional authenticated data differs per wrap, so one wrap cannot be moved into another's place:

| Wrap | AAD |
|---|---|
| password | the 64 fixed bytes (with the flags byte masked to bit 0 only, so adding or removing the recovery or device wrap does not invalidate it) `|` ASCII `pw` |
| recovery | `RADSEC01` `|` ASCII `rec` `|` `recSalt` |
| device | `RADSEC01` `|` ASCII `dev` `|` vault id |

## The database blob

- **Plaintext framing:** `length(4, u32) | database JSON (UTF-8) | zeros`, padded to a multiple of **4096** bytes (at least 4096).
- **Encryption:** `AES-256-GCM(database key, nonce = database nonce, aad = the entire header including the MAC, plaintext = framed)`. The result is `ciphertext | tag(16)`, which follows the header directly. The ciphertext length is therefore a multiple of 4096.

The header is authenticated twice: as the AAD of the database blob, and by the header MAC. The MAC is keyed from the data key, so a file whose wraps were altered to decrypt to some *other* data key is also refused (a form of key commitment that plain GCM does not give).

## What a reader must refuse

A reader decides these **before** deriving any key, so a hostile file cannot make the program allocate memory or spend time:

- A file that does not start with `RADSE`: answer "this isn't a RADSEC vault file" (the only case that says what a file is). A different seventh and eighth byte: "made by a newer version".
- A KDF id other than `1`; reserved flag bits that are not 0; a lane count outside 1–16, passes outside 1–10, memory below 8 KiB per lane or above 2 GiB (the program also refuses what it estimates it cannot allocate); a file shorter than the header plus one block, longer than 65 MiB, or whose ciphertext is not a multiple of 4096 bytes plus 16.

After that, **every** failure (a wrong password, a wrong or missing key file, a wrong recovery or device key, a changed, truncated, extended, reordered or damaged file) gives one message with the same timing class: *"Wrong password or key, or the vault file is damaged or has been changed."* The program also spends the cost of one derivation when it refuses a file for its header, so that refusing is not faster than guessing.

## What a writer does

1. Builds the database JSON, pads it, and picks a **fresh random nonce** (the session also remembers every nonce it used since unlocking, and never repeats one).
2. Writes the complete new file to a temporary name in the same folder (mode 0600), **flushes it to disk, reads it back and decrypts it in memory** with the data key. Only if that works does it continue.
3. Rotates the backups (see below), then **renames** the temporary file over the vault. At every moment the old vault or the complete new one is there, never a mixture. A save that fails, or would save an empty file, changes nothing.

## The database inside

JSON, version 1: `createdAt`, `modifiedAt`, `settings` (auto-lock minutes, clipboard seconds, lock on blur, device-shortcut days), `items` (by random id) and `audit` (the last 500 non-sensitive events, never a field value). An item has a type (`login`, `note`, `card`, `identity`, `api`, `wifi`, `ssh`, `custom`), title, favourite, tags, folder, notes, typed fields, custom fields (text, hidden, url, date, one-time code), the last 10 old passwords, attachments (base64, at most 1 MiB each and 10 MiB in all) and times.

## Backups, throttling and rollback

- **Backups.** Before replacing the vault, the program keeps the old file as `file_manager_secrets.radsec.1` (shifting `.1`→`.2`→`.3`). They are ordinary RADSEC files, written only after the new file was verified, at most once per 10 minutes and always for the first save after unlocking. **Backups open with the keys they were made with**: after changing the master password, adding or removing the recovery key, or turning off "Unlock with this computer", the old backups are deleted, because they would still open with the old secret.
- **Throttle.** Wrong passwords are counted in `file_manager_secrets.radsec.attempts`, a tiny JSON file with a count and a time and no secret. After two free attempts each wrong one doubles the wait (1 s, 2 s, 4 s … up to 15 minutes). It slows guessing through this program; it cannot stop someone who copies the file and runs their own program.
- **Rollback.** A reader cannot tell a newer file from an older one that was swapped in, because nothing outside the file records the version: an attacker who can replace the file with an older copy of it (and knows nothing else) can serve you old data. This is not preventable by an offline file.

## Limits

At most 5,000 items; titles 200 characters, notes 100,000, other fields 4,096 (private keys and addresses 20,000), 50 custom fields per item; the decrypted database at most 64 MiB; attachments at most 1 MiB each, 10 per item, 10 MiB in all.

## Choosing the cost

| Level | Memory | Passes | Lanes | Time to open on an Apple M4 Pro |
|---|---:|---:|---:|---:|
| Standard | 256 MiB | 3 | 4 | about 0.4 s |
| Strong | 512 MiB | 4 | 4 | about 1.1 s |
| Maximum | 1 GiB | 5 | 4 | about 2.8 s |

A reader accepts any settings inside the limits above, so vaults made with other settings still open. Slower computers take longer. The page's *Measure on this computer* button times all three.

## See also

- [Security: the Secrets vault (RADSEC)](../security.md#secrets-vault-radsec)
- [File Manager guide: Secrets](../userguides/43_file_manager.md#secrets-password-manager-and-notes)
- [RADENC, the file encryption format](vault-format.md)
