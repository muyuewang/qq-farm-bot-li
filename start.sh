#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$SCRIPT_DIR"

command -v node >/dev/null 2>&1 || {
    echo "start.sh: node is required." >&2
    exit 1
}

# 兼容旧参数：--prebuilt 等价于 service-control 的 --skip-build（直接用已入库产物）。
args=()
for arg in "$@"; do
    case "$arg" in
        --prebuilt) args+=("--skip-build") ;;
        *) args+=("$arg") ;;
    esac
done

exec node "$SCRIPT_DIR/tools/service-control.mjs" start "${args[@]}"
