# Security Policy

## Supported code

Security fixes target the current `main` branch unless a release explicitly states otherwise.

## Reporting a vulnerability

Please do **not** open a public issue for vulnerabilities, exposed credentials, private user data, or supply-chain concerns.

Use GitHub's private vulnerability-reporting / Security Advisory flow for this repository when available. If that control is not available, contact the repository owner privately through their GitHub profile and include only enough detail to establish contact before sending sensitive material.

Include:

- affected commit/version;
- reproduction steps;
- impact;
- suggested mitigation if known.

Do not include real credentials in reproduction material. Rotate any credential that may have been exposed; deleting it from the latest commit is not sufficient because Git history can retain old values.

## Scope

Relevant reports include credential exposure, unsafe GitHub Actions behavior, dependency/supply-chain issues, unintended data disclosure, and vulnerabilities in the deployed web game.
