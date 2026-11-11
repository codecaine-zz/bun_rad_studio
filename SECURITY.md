# Security policy

## Supported versions

Security fixes target the latest **`v1.5.x` release (`v1.5.4`)** and the latest commit on `main`; older tags are not patched separately. Interactive day-to-day testing has primarily been carried out on **macOS**, while automated test suites and packaging/sandbox verification also cover Linux and Windows (see [Testing](docs/testing/index.md#other-platforms)).

## Reporting a vulnerability

**Do not report undisclosed security vulnerabilities in public GitHub issues, pull requests, or discussions.**

1. Open a private advisory via GitHub's **Security -> Advisories -> Report a vulnerability** tab (`/security/advisories/new`) on this repository, or contact the repository maintainer privately if private vulnerability reporting is unavailable on your mirror/fork.
2. Include the affected studio, CLI tool, or module (`file:line` if known), prerequisites, reproduction steps, and impact assessment. **Never include real secrets or personal data.**
3. Only if no private channel is reachable at all, open a minimal issue titled `Security: contact request` asking how to share a report privately—**do not name the affected component or describe exploit details in the public issue.**

There is no bounty and no formal response-time SLA, though reports are reviewed on a best-effort basis.

## What is in scope

Read [Security](docs/security.md) first. It lists, with how each item was checked, what the project protects (loopback-only local servers, the cross-origin guard, escaped generated code, and so on) and what it does **not** protect.

Things that behave as designed and are documented as such, so they are not vulnerabilities by themselves:

- **A layout is code.** Event handlers in a designer layout run as script in **Run** and in exported projects, and control text is inserted as HTML. Import a layout only from a source you trust ([D-024](docs/documentation-maintenance/discrepancies.md#d-024)).
- **Studios are powerful.** Code Studio runs commands you type, Task Manager can signal processes, Rip Studio moves files. Anything running as your user can use them.
- **Plain-text database passwords in `.env`** for the older MySQL and PostgreSQL studios ([D-009](docs/documentation-maintenance/discrepancies.md#d-009)).

Reports that a studio is reachable from another machine, that a web page can drive a local studio, that a generated project runs code the layout did not contain, or that a secret is written somewhere it should not be, are welcome.

This is a review of this repository's own code, not a security audit or a guarantee.
