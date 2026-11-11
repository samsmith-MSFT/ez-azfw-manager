# EZ AzFW Manager

A cross-platform desktop app for managing Azure Firewalls, policies, rules and IP groups.

**Stage changes locally, review them, then commit to Azure.**

[![Latest release](https://img.shields.io/github/v/release/samsmith-MSFT/ez-azfw-manager?label=download&sort=semver)](https://github.com/samsmith-MSFT/ez-azfw-manager/releases/latest)
[![CI](https://github.com/samsmith-MSFT/ez-azfw-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/samsmith-MSFT/ez-azfw-manager/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**[Download the latest release](https://github.com/samsmith-MSFT/ez-azfw-manager/releases/latest)** for Windows, macOS or Linux.

![EZ AzFW Manager showing rule changes in a local draft](docs/images/rules.png)

## What you can do

- Browse firewalls, policies and IP groups across subscriptions with consistent filters.
- Create and edit network, application and DNAT rules, including bulk CSV import and export.
- Review duplicate rules, potential overlaps and risky changes before committing.
- Configure policy threat intelligence, DNS proxy, allowlists, SNAT auto-learning and Premium TLS inspection.
- Manage firewall scaling, Route Server association, maintenance assignments and start/stop.
- Save shared commit history and policy snapshots, and stage rollbacks.
- Test which rule would match a traffic flow, including inherited rules and your draft.
- Deploy new firewalls and create IP groups with validated input.

## Download and run

Choose the file for your operating system and processor on the [release page](https://github.com/samsmith-MSFT/ez-azfw-manager/releases/latest).

| Platform | Download                                       | Run                                          |
| -------- | ---------------------------------------------- | -------------------------------------------- |
| Windows  | Installer or portable executable, x64 or Arm64 | Run setup, or double-click the portable file |
| macOS    | ZIP for Apple silicon or Intel                 | Unzip and open **EZ AzFW Manager.app**       |
| Linux    | x64 AppImage                                   | Make the file executable, then run it        |

The Windows installer needs administrator rights and adds shortcuts and an uninstaller. New installations use **EZ AzFW Manager** as the folder name; upgrades may retain an existing installation path. Uninstalling keeps your saved data.

### First launch on each OS

Builds are currently unsigned, so Windows SmartScreen or macOS Gatekeeper may show a warning. Verify the download against the release's `SHA256SUMS.txt` before running it.

- **Windows:** use **More info → Run anyway** if you trust the verified download.
- **macOS:** right-click the app and choose **Open**, or use **Privacy & Security → Open Anyway**.
- **Linux:** AppImages need FUSE 2; newer Ubuntu versions may also require an AppArmor allowance.

## Basic workflow

1. Sign in with a Microsoft account or an existing Azure CLI session, then select your directory and firewalls.
2. Edit rules or configuration. **Save draft** keeps changes on your device; amber marks uncommitted changes.
3. Use **Review and commit** to inspect changes and warnings before applying them to Azure.
4. Check **Commit history** or **Snapshots** to review previous changes.

**IP group creation and new-resource deployment are separate operations that write directly to Azure.**

To find policy DNS proxy and other settings, open **Policies → ⋯ on the policy row → Edit policy settings**. For firewall settings, click its name on the **Firewalls** page.

### CSV import

In **Rules**, choose **Import rules from CSV → Download template**. Fill in the template, save as UTF-8 CSV, and review the preview before importing to your draft.

- IP groups require their **full Azure resource IDs**, not names.
- Flagged rules are skipped by default; explicitly choose replacements or imports where appropriate.
- Overlap warnings are advisory, not proof of which rule Azure will apply.

### Before changing live resources

- Stopping a firewall interrupts traffic. Restart can change its private IP or be delayed by capacity; public IP and other resource charges can continue while stopped.
- DNS proxy/custom DNS require Standard or Premium; TLS inspection requires Premium and existing certificate/identity access.
- Maintenance configurations, Route Servers, TLS certificates and identities must already exist. Commit a VNet Route Server association before enabling SNAT auto-learning.
- Avoid simultaneous edits from other tools while committing, and test changes in a non-production environment first.

## Azure permissions

The app uses your own Azure permissions.

| Task                                          | Typical permissions                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Browse resources                              | **Reader** on the relevant subscriptions or resource groups                                |
| Edit network resources and IP groups          | **Network Contributor**, including access to referenced IP groups and allocation resources |
| Deploy resources                              | **Contributor** on the target resource group; subscription access if creating groups       |
| Read/write shared snapshots and history       | **Storage Blob Data Contributor** on the chosen storage account                            |
| Create snapshot storage and grant blob access | **Contributor** plus **Owner** or **User Access Administrator** for role assignment        |

Maintenance assignments need the corresponding read/write/delete permissions. TLS setup also requires identity-assignment permission, and the selected identity must already have Key Vault secret access.

## Saved data and privacy

Drafts, preferences and restart references stay in your user profile under the legacy `ez-azfw-ruleman` folder, preserving data from older versions. Saved sign-in is encrypted with the OS key store; without a secure key store, it lasts for the session only.

Policy snapshots and shared history use an Azure Blob Storage account you choose. Configure this on the **Snapshots** page before committing; the account needs separate snapshot and history containers.

The app sends no telemetry or data to the maintainers. It connects to Microsoft Entra ID, Azure Resource Manager and your selected Azure Blob Storage using your sign-in.

## Screenshots

All screenshots use fictional Contoso demo data, not a real Azure environment.

<details>
<summary>Firewalls and policy settings</summary>

![Firewalls with State buttons and resource filters](docs/images/firewalls.png)
![Choosing firewalls to manage](docs/images/choose-firewalls.png)
![Firewall Route Server, learned prefixes, scaling and maintenance settings](docs/images/firewall-settings.png)
![Policy hierarchy and threat-intelligence controls](docs/images/policies.png)
![DNS proxy, allowlists, SNAT and Premium TLS inspection settings](docs/images/policy-settings.png)

</details>

<details>
<summary>IP groups and CSV import</summary>

![IP groups and their member addresses](docs/images/ip-groups.png)
![CSV import preview with per-rule conflict choices](docs/images/import-rules.png)

</details>

<details>
<summary>Rule editing and commit review</summary>

![Rule editor with IP group pickers](docs/images/rule-editor.png)
![Changes and risk warnings reviewed before commit](docs/images/commit-review.png)

</details>

<details>
<summary>Flow testing, snapshots and shared history</summary>

![A traffic flow denied by an inherited rule](docs/images/flow-tester.png)
![Policy snapshots with expandable groups](docs/images/snapshots.png)
![Shared commit history and change details](docs/images/commit-history.png)

</details>

## Code signing policy

Free code signing is provided by [SignPath.io](https://about.signpath.io), with a certificate from the [SignPath Foundation](https://signpath.org). **Signing is applied for but not yet active; current builds are unsigned.**

- **Scope:** Windows executables built by this repository's [Release workflow](.github/workflows/release.yml).
- **Authors, reviewers and approvers:** [samsmith-MSFT](https://github.com/samsmith-MSFT). Signing requires manual approval.
- **Privacy:** no data is sent to maintainers; network access is limited to the Azure services you use.
- **System changes:** portable builds need no installation; Windows setup adds the app, shortcuts and an uninstall entry.

## Development and contributions

Use a current Node.js LTS release and npm:

```sh
npm ci
npm start
npm run verify
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and release instructions, [CHANGELOG.md](CHANGELOG.md) for changes, and [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## License and disclaimer

[MIT](LICENSE) © 2026 samsmith-MSFT. This software is provided as-is and can affect network connectivity and security; review changes and keep backups.

This is not an official Microsoft product. Azure and Azure Firewall are Microsoft trademarks.
