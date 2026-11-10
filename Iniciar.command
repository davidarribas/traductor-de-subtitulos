#!/bin/bash
# Abre el Traductor de subtítulos en http://localhost:8765
cd "$(dirname "$0")" || exit 1
PORT=8765
if ! lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
  SERVER=$!
  sleep 1
fi
open "http://localhost:$PORT/"
echo "Traductor de subtítulos abierto en http://localhost:$PORT"
echo "Deja esta ventana abierta mientras lo uses. Para cerrarlo, pulsa Ctrl+C o cierra la ventana."
[ -n "$SERVER" ] && wait $SERVER
