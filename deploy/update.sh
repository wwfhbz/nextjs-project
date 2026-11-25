#!/usr/bin/env bash
# Run on the Ubuntu server; installation is separate from deployment.
set -euo pipefail
exec python3 "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/updater.py" update "$@"
