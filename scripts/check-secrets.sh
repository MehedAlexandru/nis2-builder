#!/usr/bin/env sh
# Pre-commit secret scanning. CI enforces gitleaks; locally we degrade gracefully.
set -eu

if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --redact --no-banner
  exit 0
fi

if [ "${CI:-}" = "true" ]; then
  echo "error: gitleaks is required in CI but was not found on PATH" >&2
  exit 1
fi

echo "warning: gitleaks not installed; skipping local secret scan (CI enforces it)." >&2
echo "         install: https://github.com/gitleaks/gitleaks#installing" >&2
exit 0
