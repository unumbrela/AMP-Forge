#!/usr/bin/env bash
set -euo pipefail

THRESHOLD_MB="${1:-50}"
THRESHOLD_BYTES=$((THRESHOLD_MB * 1024 * 1024))

echo "Checking tracked files larger than ${THRESHOLD_MB} MB..."
found=0

while IFS= read -r -d '' file; do
  if [[ -f "$file" ]]; then
    size=$(wc -c < "$file")
    if (( size > THRESHOLD_BYTES )); then
      found=1
      echo "LARGE: ${size} bytes - $file"
    fi
  fi
done < <(git ls-files -z)

if (( found == 1 )); then
  echo "Large tracked files detected. Please remove or externalize them before push."
  exit 1
fi

echo "No tracked files exceed ${THRESHOLD_MB} MB."
