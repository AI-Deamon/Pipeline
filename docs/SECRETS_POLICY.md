# Secrets Handling and Security Boundaries Policy

- Secret Storage & Reference Model:
  Raw secrets must be stored exclusively in a dedicated, hardened Backend Vault (e.g., HashiCorp Vault or AWS Secrets Manager). The UI and Backend database only store and transmit **Secret References** (UUIDs). Jenkins never stores persistent secrets; it retrieves them just-in-time via an authenticated integration with the Backend Vault using a short-lived AppRole or Token.

- Secret Lifecycle:
  1. **Provisioning**: User enters secret reference (ID) in the UI.
  2. **Injection**: At scan start, Jenkins fetches the raw secret and injects it into the Kali Linux agent as an ephemeral environment variable or a temp-file in a memory-backed (`tmpfs`) volume.
  3. **Usage**: Security tools (Sonar, Git, Trivy) consume the secret from the environment.
  4. **Disposal**: Upon stage completion or failure, the memory-backed volume is unmounted, and the process environment is purged. The Kali agent workspace is wiped before the next scan.

- Forbidden Secret Exposure Areas:
  - **Raw Logs**: Tools must be wrapped in masking filters (e.g., `jenkins-mask-passwords`) to redact secrets from STDOUT/STDERR.
  - **UI Payloads**: API responses must only contain reference IDs and masked previews (e.g., `****1234`).
  - **Build Artifacts**: Manifests, `package-lock.json`, or Docker image layers must be scanned for accidentally committed secrets before storage.
  - **Environment Snapshots**: System-level core dumps or process snapshots must exclude the `env` space of scanning tools.

- Secret Scoping Rules:
  - **Per-Project**: Git credentials and Sonar keys are scoped to the project and used across all its scans.
  - **Per-Scan**: Temporary tokens generated for specific scanning sessions (e.g., ephemeral registry tokens).
  - **System-Level**: Global scanner keys (used for system reporting) are managed by the platform admins and never exposed to project-level users.

- Leakage Detection & Prevention:
  - **Log Scrubbing**: Mandatory regex-based scanning of all tool output before it is written to the central log store.
  - **Honey-Secrets**: Insertion of inactive "canary" secrets into the environment; if detected in logs or external traffic, it triggers an immediate security alert.
  - **Agent Isolation**: Kali Linux agents run in a network-isolated environment where only whitelisted targets (Git, Sonar, Registry) are reachable, preventing exfiltration to unauthorized endpoints.

- Rotation & Update Strategy:
  - **Decoupled Updates**: Secrets can be rotated in the Backend Vault without modifying project configurations.
  - **Triggered Invalidation**: Upon a rotation event, any active scans using the old secret are allowed to finish, but subsequent scans are forced to pull the updated version.
  - **Automated Rotation**: Integration with cloud provider IAM roles allows for automatic, zero-downtime rotation of infrastructure-level secrets (e.g., Docker Push credentials).

- Secrets Handling Pitfalls:
  - **The "Pass-Through" Error**: Passing raw secrets as command-line arguments (visible in `ps -ef`). Always use environment variables or file-based injection.
  - **Persistence in Jenkins**: Leaving credentials cached in the Jenkins master’s `credentials.xml` or local disk.
  - **Insecure Default Permissions**: Creating temporary secret files with `0644` permissions instead of `0600`.
  - **Leaky Error Messages**: Security tools failing and printing the connection string (including password) in the error trace.
