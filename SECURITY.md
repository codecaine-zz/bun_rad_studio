# Security policy

## Supported versions

Only the latest commit on `main` is maintained. The project has no versioned releases. It has been used by hand on **macOS only**. The automated tests also run in CI on Linux (all pass) and Windows (31 of 1,400 fail), but nothing was opened by hand on either, and the security review covered macOS behaviour (see [Testing](docs/testing/index.md#other-platforms)).

## Reporting a vulnerability

GitHub's private vulnerability reporting is **not enabled** on this repository at the moment, so there is no private channel yet.

1. Open an issue titled `Security: <one-line summary>`.
2. Say which studio or tool is affected and what you think the impact is. **Do not put exploit details, secrets or personal data in the issue.**
3. The maintainer will reply on the issue and arrange how to receive the details.

(If the repository owner enables private vulnerability reporting, this file should be updated to point to the **Security** tab instead.)

There is no bounty and no response-time guarantee.

## What is in scope

Read [Security](docs/security.md) first. It lists, with how each item was checked, what the project protects (loopback-only local servers, the cross-origin guard, escaped generated code, and so on) and what it does **not** protect.

Things that behave as designed and are documented as such, so they are not vulnerabilities by themselves:

- **A layout is code.** Event handlers in a designer layout run as script in **Run** and in exported projects, and control text is inserted as HTML. Import a layout only from a source you trust ([D-024](docs/documentation-maintenance/discrepancies.md#d-024)).
- **Studios are powerful.** Code Studio runs commands you type, Task Manager can signal processes, Rip Studio moves files. Anything running as your user can use them.
- **Plain-text database passwords in `.env`** for the older MySQL and PostgreSQL studios ([D-009](docs/documentation-maintenance/discrepancies.md#d-009)).

Reports that a studio is reachable from another machine, that a web page can drive a local studio, that a generated project runs code the layout did not contain, or that a secret is written somewhere it should not be, are welcome.

This is a review of this repository's own code, not a security audit or a guarantee.
