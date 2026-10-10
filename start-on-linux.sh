#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install it with your package manager, then run this again."
  exit 1
fi
node server.js
