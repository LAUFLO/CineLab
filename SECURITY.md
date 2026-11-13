# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |
| < 0.1 | No |

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository:

https://github.com/LAUFLO/CineLab/security/advisories/new

Do not open a public issue for a security problem. Please include:

- affected version and operating system
- steps to reproduce
- impact and any known workaround
- whether the issue involves local files, IPC, API keys, the update channel, or a third-party provider

Do not attach real API keys, project files, `.opencode` state, or private media. Use redacted examples.

## Scope

In scope:

- Electron main/preload/renderer boundaries and IPC validation
- arbitrary file access, path traversal, symlink escapes, and unsafe archive extraction
- API key storage and accidental key exfiltration
- update-channel integrity and release asset handling
- Markdown/HTML injection that can execute in the renderer
- project import/export privacy, including agent sessions and local paths

Out of scope:

- compromise of the user's operating system or browser profile
- malicious or compromised model providers
- prompt injection that only produces incorrect content without a security boundary crossing
- issues that require the attacker to already have local code execution

## Handling

Reports are handled on a best-effort basis. There is no paid support SLA. We will confirm receipt, investigate, and coordinate disclosure when a fix is ready. Please give us a reasonable window before publishing details.

## Local data

CineLab runs locally. Projects, assets, logs, `.opencode` handover files, and model configuration stay on the user's machine. API keys are stored through Electron `safeStorage` where available. Repository contributions must not include real keys, local absolute paths, or private project data.
