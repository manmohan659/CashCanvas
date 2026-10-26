# Credential handling

Run `python3 -I -S security/test_security_scan.py` and `python3 -I -S security/security_scan.py .`. This heuristic tracked-source scanner prints paths/rules/lines only. It omits binary/dependency/build contents; oversized tracked files fail incomplete. It is not exhaustive.

Historical exposed credentials require provider-side replacement and revocation after all consumers are identified. Removing current source does not revoke history. No alerts are dismissed without evidence. Do not commit real environment files or copy production credentials into development.
