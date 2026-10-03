#!/usr/bin/env bash
# Verifies the API and web images of ONE architecture. Both images must already be loaded into the
# local Docker daemon. CI runs this once per matrix leg of its Docker job (amd64 and arm64, each on
# a native runner) straight after the build. To run it yourself, build the images first:
#
#   TARGET_ARCH=amd64 API_IMAGE=mizano-api:amd64 WEB_IMAGE=mizano-web:amd64 \
#     bash deploy/ci/verify-docker-image.sh
#
# Containers run with --network none: nothing may need the network at run time, which is the
# situation of the Pi. Command output is captured before it is tested, because `grep -q` in a pipe
# exits early and, under pipefail, makes the producer fail with a broken pipe.
set -euo pipefail

arch="${TARGET_ARCH:?TARGET_ARCH (amd64 or arm64) is required}"
api="${API_IMAGE:?API_IMAGE is required}"
web="${WEB_IMAGE:?WEB_IMAGE is required}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
platform="linux/$arch"

# Strict upper bounds, in bytes, for the Pi's disk and memory budget. API: Chromium is required for
# PDF rendering (puppeteer ships no linux-arm64 Chrome, so the distro package is the only option)
# and with its hard dependencies it alone is ~575 MB, so 1 GB is unreachable.
api_limit=1200000000
web_limit=500000000

case "$arch" in
  amd64) node_arch=x64 ;;
  arm64) node_arch=arm64 ;;
  *)
    echo "Unsupported TARGET_ARCH: $arch" >&2
    exit 2
    ;;
esac

offline() { docker run --rm --network none --platform "$platform" "$@"; }
fail() {
  echo "FAIL: $1" >&2
  exit 1
}

echo "== both images run on $platform"
for image in "$api" "$web"; do
  actual=$(offline --entrypoint node "$image" -p process.arch)
  [ "$actual" = "$node_arch" ] || fail "$image reports process.arch=$actual, expected $node_arch"
done

echo "== native modules load offline"
offline --entrypoint node "$api" -e "require('bcrypt'); require('sharp'); require('@prisma/client')"
offline --entrypoint node "$web" -e "require('sharp')"

echo "== the worker's tools exist at the absolute paths its code uses"
for tool in /usr/bin/pdftoppm /usr/bin/pdftotext /usr/bin/pdfinfo; do
  version=$(offline --entrypoint "$tool" "$api" -v 2>&1)
  [ -n "$version" ] || fail "$tool printed no version"
done
prlimit_version=$(offline --entrypoint /usr/bin/prlimit "$api" --version 2>&1)
[ -n "$prlimit_version" ] || fail '/usr/bin/prlimit printed no version'

echo "== the extraction child's compiled import graph resolves in the image"
# The child starts as its own process, so a module missing from the production dependencies would
# fail every document on the Pi and nothing else here would notice. Only the entry point is loaded;
# it registers its message listener only when started as the main script.
offline --entrypoint node "$api" -e "require('/app/apps/api/dist/modules/ai/intake/intake-child.js')"

echo "== the Prisma CLI validates the schema offline"
offline -e DATABASE_URL=postgresql://validation:validation@127.0.0.1:5432/validation "$api" npx --no-install prisma validate

echo "== bundled OCR languages load from INTAKE_TESSDATA_DIR, not from the working directory"
offline -w / -e NODE_PATH=/app/node_modules --entrypoint node "$api" -e "
const dir = process.env.INTAKE_TESSDATA_DIR;
if (!dir) throw new Error('INTAKE_TESSDATA_DIR is unset');
require('tesseract.js')
  .createWorker('eng+ara', undefined, { langPath: dir, cachePath: dir, gzip: false })
  .then((worker) => worker.terminate())
  .catch((error) => { console.error('tesseract failed:', error.message); process.exit(1); });
"

echo "== the worker's real extraction reads an image, a text-layer PDF and a scanned PDF"
# The production child code (Poppler under prlimit, the pinned OCR assets, then the deterministic
# rules) inside this image on this architecture. The documents are synthetic: a wiring check, not
# an accuracy claim. The fixture image travels as an environment variable, not a bind mount, which
# a remote or Windows daemon would not resolve.
fixture="$repo/apps/api/src/modules/ai/intake/__fixtures__/invoice-en.png"
fixture_b64=$(base64 <"$fixture" | tr -d '\n')
offline -i -e "FIXTURE_PNG_BASE64=$fixture_b64" --entrypoint node "$api" - <"$here/worker-extraction-check.js"

echo "== an Arabic-capable font is installed for RTL PDFs"
arabic_fonts=$(offline --entrypoint fc-list "$api" :lang=ar)
[ -n "$arabic_fonts" ] || fail 'fc-list finds no Arabic font'

echo "== headless Chromium renders a PDF and a PNG offline, with Arabic falling back to Noto Naskh"
# As the image's non-root user, with the font stack the invoice templates use. On a native runner
# this runs on arm64 too; under QEMU emulation Chromium did not start within minutes.
offline -i -e NODE_PATH=/app/node_modules --entrypoint node "$api" - <"$here/chromium-render-check.js"

echo "== image sizes"
docker image ls
api_size=$(docker image inspect --format '{{.Size}}' "$api")
web_size=$(docker image inspect --format '{{.Size}}' "$web")
echo "$api = $api_size bytes (limit $api_limit)"
echo "$web = $web_size bytes (limit $web_limit)"
[ "$api_size" -lt "$api_limit" ] || fail "$api is not below $api_limit bytes"
[ "$web_size" -lt "$web_limit" ] || fail "$web is not below $web_limit bytes"

echo "OK: $arch images verified"
