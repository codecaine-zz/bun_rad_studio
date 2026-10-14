# RADENC v1: the encrypted file format

Files made by the File Manager's **Encrypt…** (and by `bun run cli:vault`) have the extension **`.radenc`**. This page describes the format byte by byte, so that anyone can write a program that opens them. The format uses only standard, widely available parts: **Argon2id** (RFC 9106), **HKDF-SHA-256** (RFC 5869) and **AES-256-GCM** (NIST SP 800-38D), arranged as a **STREAM** construction like the ones in Tink and age.

A tested, independent reference decryptor (about 60 lines, `node:crypto` only) lives in `tests/file_manager_vault.test.ts`; it is written from this page alone and the test suite proves it opens files made by the program.

## Contents

- [Overview](#overview)
- [The header](#the-header-64-bytes)
- [From password to key](#from-password-to-key)
- [The body: sealed chunks](#the-body-sealed-chunks)
- [The payload (container)](#the-payload-container)
- [What a reader must refuse](#what-a-reader-must-refuse)
- [What a writer does](#what-a-writer-does)
- [A decryptor in outline](#a-decryptor-in-outline)
- [Limits](#limits)
- [See also](#see-also)

## Overview

```text
file   = header (64 bytes) | chunk 0 | chunk 1 | ... | chunk N-1
chunk  = AES-256-GCM ciphertext of up to 2^chunkLog2 bytes | 16-byte tag
payload (what the chunks hold, in order) = container, optionally wrapped in gzip
```

All integers are **big endian**. Nothing in the file reveals the original name, the number of files or their sizes (apart from the total length of the file, which is visible).

## The header (64 bytes)

| Offset | Size | Field | Value |
|---:|---:|---|---|
| 0 | 8 | magic | ASCII `RADENC01` (`52 41 44 45 4E 43 30 31`) |
| 8 | 1 | KDF id | `1` = Argon2id |
| 9 | 4 | memory | Argon2 memory in **KiB**, u32 |
| 13 | 1 | passes | Argon2 time cost *t* |
| 14 | 1 | parallelism | Argon2 lanes *p* |
| 15 | 32 | salt | random; Argon2 nonce **and** HKDF salt |
| 47 | 1 | cipher id | `1` = AES-256-GCM, STREAM |
| 48 | 1 | chunk size log2 | chunks hold `1 << value` bytes; the program writes `20` (1 MiB) |
| 49 | 1 | flags | bit 0 (`0x01`) = the payload is gzip-compressed; other bits must be `0` |
| 50 | 7 | nonce prefix | random |
| 57 | 7 | reserved | must be zero |

The **whole 64 bytes are the AAD (additional authenticated data) of every chunk**. Changing any header byte therefore makes every chunk fail to authenticate.

The two levels the program offers:

| Level | memory | passes | parallelism |
|---|---:|---:|---:|
| Standard | 262144 KiB (256 MiB) | 3 | 4 |
| Maximum | 1048576 KiB (1 GiB) | 4 | 4 |

## From password to key

1. Normalise the password to Unicode **NFKC**, encode as **UTF-8**.
2. `master = Argon2id(password, nonce = salt, memory, passes, parallelism, tagLength = 32)` (version 0x13, no secret, no associated data).
3. `key = HKDF-SHA-256(IKM = master, salt = salt, info = "radenc v1 file key" (ASCII, no terminator), L = 32)`.

`key` is the AES-256 key for every chunk of the file.

## The body: sealed chunks

The plaintext payload is cut into pieces of exactly `S = 1 << chunkLog2` bytes (the last piece may be shorter, and is never empty unless the whole payload is empty). Piece number *i* (starting at 0) is sealed with AES-256-GCM:

```text
nonce      = noncePrefix (7 bytes) | i as u32 (4 bytes) | lastFlag (1 byte)
lastFlag   = 0x01 for the final piece, 0x00 for every other piece
AAD        = the 64-byte header
sealed     = ciphertext | 16-byte tag        (S + 16 bytes, or less for the last piece)
```

* An **empty payload** is one final, empty piece (a 16-byte sealed block).
* A payload whose length is an exact multiple of `S` ends with a full-size final piece (there is no extra empty piece).
* A reader takes the bytes after the header, splits them into blocks of `S + 16` bytes, and the block that **ends exactly at the end of the file** is opened as the last piece (`lastFlag = 1`); all others with `lastFlag = 0`. That last block must be at least 16 bytes. Truncation, reordering, duplication and appended data all fail to authenticate.
* The counter is 32 bits; a file may hold at most 2^32 pieces.

## The payload (container)

After removing the optional gzip layer (flag bit 0), the plaintext is:

```text
'M'  u32 length  JSON manifest (UTF-8)
entries...
'E'
```

**Manifest**: `{"v":1,"kind":"file"|"folder","name":"…","created":"<ISO time>","count":<entries>,"bytes":<total file bytes>}`. `name` is the original file or folder name. `count` is the number of `F` and `D` entries; `bytes` the sum of all file sizes.

**Entries** (paths are relative to the encrypted folder, UTF-8, with `/` separators; a single encrypted file is one `F` entry whose path is its name):

```text
'F'  u16 pathLength  path  u16 mode  f64 mtimeMs  u64 size  data[size]     a file
'D'  u16 pathLength  path  u16 mode  f64 mtimeMs                           a folder (empty ones too)
```

`mode` holds the permission bits only (`& 0o777`). `mtimeMs` is a big-endian IEEE-754 double of milliseconds since 1970. A folder entry always comes before anything inside it. Symbolic links and special files (devices, sockets, pipes) are **not stored**; the program reports each one as a warning when it encrypts.

## What a reader must refuse

A reader checks all of this, so a hostile file can't harm the computer that opens it:

* **Before running the KDF**: magic, ids, flags and reserved bytes as above; `chunkLog2` between 12 and 24; memory ≤ 2 GiB (2097152 KiB) and ≥ 8 × parallelism; passes 1 to 10; parallelism 1 to 16. (This stops a file from demanding gigabytes of memory or hours of work.) The program also refuses when the memory needed exceeds 80% of the computer's memory.
* **Authentication**: every chunk must authenticate, and nothing is published until the last chunk has. A wrong password is detected on chunk 0. The program gives one message for every such failure, *"Wrong password, or the file is damaged or has been changed."*, so it can't be used to learn which it was.
* **Container paths**: no empty parts, no `.` or `..`, no leading `/`, no drive letters, no backslashes, NUL or control characters, depth ≤ 64, path ≤ 1024 bytes, name part ≤ 255 bytes, no Windows reserved names or trailing dots or spaces **on Windows**, and no two entries with the same name (compared ignoring case and accent composition on macOS and Windows), including a file and a folder with the same path. Entries ≤ 2,000,000. File sizes may not exceed the manifest's `bytes`, and the entries and bytes must add up to the manifest exactly. No data may follow `E`.
* **Extraction** happens in a fresh hidden temporary folder next to the destination, never overwrites or follows a link, and the finished result is moved into place under a free name (`name (2)` …). On any failure the temporary folder is deleted.

## What a writer does

* Chooses a fresh random salt and nonce prefix for every file.
* Streams: it never holds a whole file in memory (one 1 MiB block at a time).
* Writes to a hidden temporary file (`.radenc-….tmp`, mode 0600) in the destination folder, flushes it, **re-reads it and authenticates every chunk with the same key**, and only then gives it its final name, by a hard link followed by removal (which fails rather than replace an existing file), or a rename after an existence check on disks without hard links.
* Never deletes or changes the original. (The page's optional "move the original to the Recycle Bin" happens only after the checked copy is in place, and uses the Recycle Bin, not deletion.)

## A decryptor in outline

```text
read 64 bytes → check header → key = HKDF(Argon2id(NFKC(password)))
for i, block in blocks(file after header, S + 16):
    last = (block ends at EOF)
    plain_i = AES-256-GCM-open(key, nonce(prefix, i, last), AAD = header, block)   -- fail ⇒ stop, output nothing
payload = concat(plain_i); if flags & 1: payload = gunzip(payload)
parse container: 'M' … entries … 'E'
```

## Limits

* Names: the original name lives **inside** the encrypted data; the `.radenc` file name is chosen by the person (or hidden as `Encrypted file 1.radenc`).
* Not stored: symbolic links, special files, extended attributes, access-control lists, resource forks, owners.
* Permissions: only the permission bits are kept; on extraction the owner always keeps read and write (and, for folders, search) so the result can be managed. Windows keeps no Unix permission bits.
* File times: modification time only, to the millisecond.

## See also

- [File Manager guide: Encrypt and decrypt](../userguides/43_file_manager.md#encrypt-and-decrypt-files-and-folders)
- [Security: what encryption protects and what it doesn't](../security.md#file-encryption-radenc)
- Source: `src/features/filemanager/fmVault*.ts`, `cli_apps/vault_cli.ts`
