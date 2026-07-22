#!/usr/bin/env bash
set -euo pipefail

readonly REPO_URL="${YELLOW_PRO_MCP_REPO_URL:-https://github.com/layer-3/yellow-pro-mcp.git}"
readonly TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/yellow-pro-mcp-install.XXXXXX")"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

for command in git node npm; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'yellow-pro-mcp installer: required command not found: %s\n' "$command" >&2
    exit 1
  fi
done

node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
if ((node_major < 18)); then
  printf 'yellow-pro-mcp requires Node.js 18 or newer (found %s).\n' "$(node --version)" >&2
  exit 1
fi

printf 'Cloning yellow-pro-mcp...\n'
git clone --depth 1 --quiet "$REPO_URL" "$TEMP_DIR/repo"

printf 'Installing build dependencies...\n'
(cd "$TEMP_DIR/repo" && npm ci --no-audit --no-fund)

printf 'Building yellow-pro-mcp...\n'
(cd "$TEMP_DIR/repo" && npm run build)

printf 'Packing yellow-pro-mcp...\n'
tarball="$(cd "$TEMP_DIR/repo" && npm pack --silent --pack-destination "$TEMP_DIR")"

install_prefix="${YELLOW_PRO_MCP_PREFIX:-$(npm config get prefix)}"
if [[ -e "$install_prefix" && ! -w "$install_prefix" ]]; then
  install_prefix="$HOME/.local"
fi

printf 'Installing yellow-pro-mcp to %s...\n' "$install_prefix"
mkdir -p "$install_prefix"
npm install --global --prefix "$install_prefix" --no-audit --no-fund "$TEMP_DIR/$tarball"

printf 'Installed yellow-pro-mcp. Binary directory: %s/bin\n' "$install_prefix"
if [[ ":$PATH:" != *":$install_prefix/bin:"* ]]; then
  printf 'Add it to PATH: export PATH="%s/bin:$PATH"\n' "$install_prefix"
fi
printf 'Run: yellow-pro --help\n'
