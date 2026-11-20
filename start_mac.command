#!/bin/bash
# Starts a local web server and opens the game in the default browser.
cd "$(dirname "$0")"
PORT=8000
while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT+1)); done
echo "Game is running at http://localhost:$PORT/"
echo "Close this window to stop."
(sleep 1; open "http://localhost:$PORT/") &
python3 -m http.server $PORT
