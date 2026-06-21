#!/bin/bash
# Convert diagram YAML to a viewer URL.
# Usage: yaml-to-url.sh [file.yaml]   (omit file to read from stdin)

set -euo pipefail

if [ -n "${1:-}" ]; then
    input=$(cat "$1")
else
    input=$(cat)
fi

encoded=$(printf '%s' "$input" | python3 -c "
import sys, gzip, base64
data = sys.stdin.buffer.read()
compressed = gzip.compress(data, mtime=0)
print(base64.b64encode(compressed).decode(), end='')
")

echo "https://handstand2002.github.io/index.html#${encoded}"
