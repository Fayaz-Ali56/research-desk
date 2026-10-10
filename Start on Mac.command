#!/bin/bash
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js is not installed yet."
  echo "  Get it from https://nodejs.org - pick the LTS button, install, then"
  echo "  double-click this file again."
  echo ""
  open https://nodejs.org
  read -n 1 -s -r -p "  Press any key to close."
  exit 1
fi

echo ""
echo "  Starting the research desk. Your browser will open in a moment."
echo "  Keep this window open while you work. Close it to stop."
echo ""
node server.js
