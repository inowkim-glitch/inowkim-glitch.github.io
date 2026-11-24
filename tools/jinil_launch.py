#!/usr/bin/env python3
"""Launch the JINIL V80 development preview locally and open the default browser.

Development-only: binds to 127.0.0.1. Not a public production server.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import quote
import sys
import time
import webbrowser


def main():
    root = Path(__file__).resolve().parent.parent
    relative = Path("진일_통합관리") / "11_1_v80_진일_통합_실시간_관리_시스템_V72_블록완전복구.html"
    if not (root / relative).is_file():
        print("[ERROR] V80 HTML file was not found.", flush=True)
        print("Expected:", root / relative, flush=True)
        print("Keep all folders from the ZIP together.", flush=True)
        return 1

    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    server = None
    for port in (8004, 0):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), handler)
            break
        except OSError:
            if port == 0:
                raise

    actual_port = server.server_address[1]
    url = (
        f"http://127.0.0.1:{actual_port}/"
        + quote(relative.parts[0], safe="")
        + "/"
        + quote(relative.parts[1], safe="")
    )

    print("=" * 60, flush=True)
    print("JINIL V80 - LOCAL PREVIEW", flush=True)
    print("Folder:", root, flush=True)
    print("URL:", url, flush=True)
    print("Browser opens automatically. Keep this window open.", flush=True)
    print("Press Ctrl+C to stop the server.", flush=True)
    print("=" * 60, flush=True)

    def open_browser():
        time.sleep(0.6)
        if not webbrowser.open(url, new=2):
            print("If the browser did not open, copy the URL above.", flush=True)

    Thread(target=open_browser, daemon=True).start()
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        print("\nServer stopped.", flush=True)
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
