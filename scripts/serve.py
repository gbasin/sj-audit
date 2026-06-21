#!/usr/bin/env python3
"""Static file server for an sj-audit report + a tiny POST /feedback sink.

Serves a run directory and accepts POSTed direction picks, writing them to
<root>/feedback/picks-<ts>.{json,md} so they land directly on this machine — no
copy-paste needed. Designed to be bound to a Tailscale IP for private hosting.

Usage:
  python3 serve.py --root <run-dir> [--port 8088] [--bind 127.0.0.1]

  # Private over a tailnet (bind to your Tailscale IP, tailnet-only, not your LAN):
  python3 serve.py --root <run-dir> --port 8088 --bind "$(tailscale ip -4 | head -1)"
"""
import argparse
import http.server
import json
import os
import socketserver
import time


def make_handler(root, feedback_dir):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=root, **k)

        def do_POST(self):
            if self.path.rstrip("/") != "/feedback":
                self.send_response(404)
                self.end_headers()
                return
            length = int(self.headers.get("content-length", 0) or 0)
            body = self.rfile.read(length) if length else b""
            ts = time.strftime("%Y%m%d-%H%M%S")
            base = os.path.join(feedback_dir, "picks-%s" % ts)
            try:
                data = json.loads(body.decode("utf-8") or "{}")
            except Exception:
                data = {"raw": body.decode("utf-8", "replace")}
            with open(base + ".json", "w") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            if isinstance(data, dict) and data.get("markdown"):
                with open(base + ".md", "w") as f:
                    f.write(data["markdown"])
            payload = json.dumps({"ok": True, "saved": os.path.basename(base)}).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            print("[feedback] wrote %s" % (base + ".json"))

        def end_headers(self):
            # don't cache html/json while iterating so reloads pick up rebuilds
            if self.path == "/" or self.path.endswith(".html") or self.path.endswith(".json"):
                self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def log_message(self, fmt, *args):
            print("%s - %s" % (self.address_string(), fmt % args))

    return Handler


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True, help="directory to serve (the run dir with index.html)")
    ap.add_argument("--port", type=int, default=8088)
    ap.add_argument("--bind", default="127.0.0.1", help="bind address (use the Tailscale IP for tailnet-only)")
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    feedback = os.path.join(root, "feedback")
    os.makedirs(feedback, exist_ok=True)
    handler = make_handler(root, feedback)
    print("serving %s on http://%s:%d  (POST /feedback -> %s)" % (root, args.bind, args.port, feedback))
    Server((args.bind, args.port), handler).serve_forever()


if __name__ == "__main__":
    main()
