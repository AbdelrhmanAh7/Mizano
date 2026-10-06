## AI Questions for Issue #97

1. **No ETA Integration Found:**
   During the implementation of Slice 1, I noticed that there is currently no ETA/VAT notification client integration in `apps/api/src`. As instructed by the brief, I stopped the implementation of the `credential-age` pure function since there is no existing env/config loader or client for ETA. I only updated the deployment checklist and drafted this questions file.

2. **Slice 2: Vault Choice and Metadata Location:**
   - **Vault Choice:** Which vault backend should be used for storing integration credentials?
     _Default:_ HashiCorp Vault (or a simple encrypted backend if HashiCorp is too heavy).
   - **Metadata Location:** Where should the rotation metadata (e.g., `ETA_CREDENTIAL_ROTATED_AT`) be stored? Should it live in `.env.prod`, or in the vault itself alongside the secrets?
     _Default:_ Store it in `.env.prod` for easy access without calling the vault, while storing the actual secret in the vault.

3. **Slice 3: Anomaly Alert Thresholds:**
   - **Thresholds:** What should be the thresholds for anomaly alerts on outbound invoice-notify volume? For example, how many requests per hour/day constitute an anomaly?
     _Default:_ Alert if the daily volume exceeds 2x the 30-day moving average.
