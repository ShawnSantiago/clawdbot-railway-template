#!/usr/bin/env bash
set -euo pipefail

# Railway skill dependency bootstrap template.
# Copy this file to /data/workspace/bootstrap.sh to run it automatically at startup.
# It installs Linux-compatible CLIs into persistent /data paths using pinned versions.

BIN_DIR="${BIN_DIR:-/data/bin}"
NPM_PREFIX="${NPM_CONFIG_PREFIX:-/data/npm}"

OP_VERSION="${OP_VERSION:-2.31.0}"
GEMINI_CLI_VERSION="${GEMINI_CLI_VERSION:-0.29.5}"
CLAWHUB_VERSION="${CLAWHUB_VERSION:-0.7.0}"
MCPORTER_VERSION="${MCPORTER_VERSION:-0.7.3}"
ORACLE_VERSION="${ORACLE_VERSION:-0.8.6}"

log() {
  printf '[bootstrap] %s\n' "$*"
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "amd64" ;;
    aarch64|arm64) echo "arm64" ;;
    *)
      log "unsupported architecture: $(uname -m)"
      return 1
      ;;
  esac
}

ensure_dirs() {
  mkdir -p "${BIN_DIR}" "${NPM_PREFIX}" "${NPM_PREFIX}/bin" /data/npm-cache /data/pnpm /data/pnpm-store
  export NPM_CONFIG_PREFIX="${NPM_PREFIX}"
  export NPM_CONFIG_CACHE="/data/npm-cache"
  export PNPM_HOME="/data/pnpm"
  export PNPM_STORE_DIR="/data/pnpm-store"
  export PATH="${BIN_DIR}:${NPM_PREFIX}/bin:/data/pnpm:${PATH}"
}

install_op() {
  if command -v op >/dev/null 2>&1 && op --version 2>/dev/null | grep -q "${OP_VERSION}"; then
    log "op ${OP_VERSION} already installed"
    return 0
  fi

  local arch
  arch="$(detect_arch)"
  local tmpdir
  tmpdir="$(mktemp -d)"
  local url="https://cache.agilebits.com/dist/1P/op2/pkg/v${OP_VERSION}/op_linux_${arch}_v${OP_VERSION}.zip"

  log "installing op ${OP_VERSION} (${arch})"
  curl -fsSL "${url}" -o "${tmpdir}/op.zip"
  unzip -q "${tmpdir}/op.zip" -d "${tmpdir}"
  install -m 0755 "${tmpdir}/op" "${BIN_DIR}/op"
  rm -rf "${tmpdir}"
}

npm_has_version() {
  local pkg="$1"
  local version="$2"
  npm list -g --depth=0 "${pkg}" 2>/dev/null | grep -q "${pkg}@${version}"
}

install_npm_pkg() {
  local pkg="$1"
  local version="$2"
  local bin_name="$3"

  if npm_has_version "${pkg}" "${version}"; then
    log "${pkg}@${version} already installed"
  else
    log "installing ${pkg}@${version}"
    npm install -g "${pkg}@${version}"
  fi

  local npm_bin="${NPM_PREFIX}/bin/${bin_name}"
  if [[ -x "${npm_bin}" ]]; then
    ln -sf "${npm_bin}" "${BIN_DIR}/${bin_name}"
  fi
}

main() {
  ensure_dirs
  install_op

  # bun-hinted skills installed with npm globals in persistent /data/npm.
  install_npm_pkg "@google/gemini-cli" "${GEMINI_CLI_VERSION}" "gemini"
  install_npm_pkg "clawhub" "${CLAWHUB_VERSION}" "clawhub"
  install_npm_pkg "mcporter" "${MCPORTER_VERSION}" "mcporter"
  install_npm_pkg "@steipete/oracle" "${ORACLE_VERSION}" "oracle"

  log "done"
}

main "$@"
