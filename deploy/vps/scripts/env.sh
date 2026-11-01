#!/usr/bin/env bash
# Sourced by the VPS scripts: points the shared deploy/pi helpers at this server's files.
# shellcheck shell=bash
VPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export VPS_DIR
export ENV_FILE="${ENV_FILE:-/etc/jarda/jarda.env}"
export COMPOSE_FILE="${COMPOSE_FILE:-$VPS_DIR/docker-compose.vps.yml}"
export PI_DIR="$VPS_DIR/../pi"
# shellcheck source=deploy/pi/scripts/lib.sh
. "$PI_DIR/scripts/lib.sh"
