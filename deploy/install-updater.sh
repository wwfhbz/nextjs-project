#!/usr/bin/env bash
# Installs commands only. Does not deploy, restart services, or edit Nginx.
set -euo pipefail
exec python3 "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/updater.py" install "$@"
