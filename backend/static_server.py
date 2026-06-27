"""
Frame Wireless - SPA-capable Static Server
No directory listings. No zip downloads.
Serves index.html for any unknown path (SPA routing support).
"""
import sys
import os
import json
import socket
import mimetypes
from http.server import HTTPServer, BaseHTTPRequestHandler


class SPAHandler(BaseHTTPRequestHandler):
    root = '.'

    def log_message(self, *args):
        pass

    def do_GET(self):
        import urllib.parse
        path = urllib.parse.unquote(self.path.split('?')[0])
        full = os.path.abspath(os.path.join(self.root, path.lstrip('/')))

        # Safety: never escape the root
        if not full.startswith(os.path.abspath(self.root)):
            self.send_error(403); return

        # Serve the file if it exists
        if os.path.isfile(full):
            return self._send(full)

        # SPA fallback → index.html
        index = os.path.join(self.root, 'index.html')
        if os.path.isfile(index):
            return self._send(index)

        self.send_error(404, 'index.html not found in project root')

    def _send(self, filepath):
        mime, _ = mimetypes.guess_type(filepath)
        mime = mime or 'application/octet-stream'
        with open(filepath, 'rb') as f:
            data = f.read()
        self.send_response(200)
        self.send_header('Content-Type',   mime)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(data)


def get_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:    s.connect(('10.255.255.255', 1)); return s.getsockname()[0]
    except: return '127.0.0.1'
    finally: s.close()


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python static_server.py <port> <dir>"}), flush=True)
        sys.exit(1)

    port, directory = int(sys.argv[1]), sys.argv[2]

    class Srv(SPAHandler):
        pass
    Srv.root = directory

    HTTPServer.allow_reuse_address = True
    httpd = HTTPServer(('0.0.0.0', port), Srv)

    ip = get_ip()
    print(json.dumps({"status": "started", "port": port, "ip": ip, "url": f"http://{ip}:{port}"}), flush=True)
    httpd.serve_forever()
