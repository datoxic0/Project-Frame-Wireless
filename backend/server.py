import os
import sys
import json
import socket
import string
import io
import urllib.parse
import subprocess
import ctypes
import mimetypes
from http.server import HTTPServer, BaseHTTPRequestHandler

# ──────────────────────────────────────────────────────────────────────────────
#  Windows API helpers
# ──────────────────────────────────────────────────────────────────────────────
FILE_ATTRIBUTE_HIDDEN = 0x02
FILE_ATTRIBUTE_SYSTEM = 0x04

def is_hidden_or_system(filepath):
    try:
        attrs = ctypes.windll.kernel32.GetFileAttributesW(str(filepath))
        return attrs != -1 and bool(attrs & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM))
    except Exception:
        return False

def get_drives():
    """
    Use Windows GetLogicalDrives() bitmask — INSTANT, zero I/O.
    Never hangs, even with disconnected network/USB drives.
    """
    drives = []
    bitmask = ctypes.windll.kernel32.GetLogicalDrives()
    for i, letter in enumerate(string.ascii_uppercase):
        if bitmask & (1 << i):
            root = f'{letter}:\\'
            drives.append({
                "name":        f"Local Disk ({letter}:)",
                "isDirectory": True,
                "path":        f"{letter}:/",
                "isDrive":     True,
                "size":        None
            })
    return drives

# ──────────────────────────────────────────────────────────────────────────────
#  Screen capture
# ──────────────────────────────────────────────────────────────────────────────
try:
    from PIL import ImageGrab
    SCREEN_OK = True
except ImportError:
    SCREEN_OK = False

import time

def capture_jpeg(quality=55, max_w=1280):
    if not SCREEN_OK:
        return None
    img = ImageGrab.grab()
    if img.width > max_w:
        img = img.resize((max_w, int(img.height * max_w / img.width)))
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=quality, optimize=True)
    return buf.getvalue()

# ──────────────────────────────────────────────────────────────────────────────
#  Request handler
# ──────────────────────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    shared_dir = '.'

    def log_message(self, fmt, *args):
        pass  # silence all request logs — they were flooding stderr

    def cors(self):
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-File-Name, X-Target-Path')

    def do_OPTIONS(self):
        self.send_response(200); self.cors(); self.end_headers()

    # ── GET ──────────────────────────────────────────────────────────────────
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        p      = parsed.path
        q      = urllib.parse.parse_qs(parsed.query)

        # Mobile UI assets
        mobile = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'mobile')
        if p in ('/', '/index.html'):   return self._file(os.path.join(mobile, 'index.html'), 'text/html')
        if p == '/style.css':           return self._file(os.path.join(mobile, 'style.css'),  'text/css')

        # API routes
        if p == '/api/files':   return self._files(q.get('path', [''])[0])
        if p == '/api/apps':    return self._apps()
        if p == '/api/screen':  return self._screen()

        # HLS broadcast segments (written by broadcaster.py)
        if p.startswith('/broadcast/'):
            seg_name    = os.path.basename(urllib.parse.unquote(p[11:]))
            broadcast_d = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'broadcast')
            return self._serve_ranged(os.path.join(broadcast_d, seg_name))

        # File serving with Range support
        if p.startswith('/shared/'):
            raw = urllib.parse.unquote(p[8:])
            # Reconstruct Windows absolute path (e.g. C:/Users/... → C:\Users\...)
            file_path = os.path.abspath(raw.replace('/', os.sep))
            return self._serve_ranged(file_path)

        self._json(404, {"error": "Not found"})

    # ── POST ─────────────────────────────────────────────────────────────────
    def do_POST(self):
        p = urllib.parse.urlparse(self.path).path
        if p == '/api/launch': return self._launch()
        if p == '/api/upload': return self._upload()
        self._json(404, {"error": "Not found"})

    # ── API: files ────────────────────────────────────────────────────────────
    def _files(self, req_path):
        try:
            files = []
            if not req_path or req_path == 'THIS_PC':
                # Root: add Shared Folder shortcut first, then all drives
                if self.shared_dir and os.path.isdir(self.shared_dir):
                    files.append({
                        "name":        f"📁 Shared: {os.path.basename(self.shared_dir)}",
                        "isDirectory": True,
                        "path":        self.shared_dir.replace('\\', '/'),
                        "isShortcut":  True,
                        "size":        None
                    })
                files += get_drives()
                current = 'THIS_PC'
            else:
                full = os.path.abspath(req_path.replace('/', os.sep))
                if not os.path.isdir(full):
                    return self._json(404, {"error": "Path not found"})
                for item in os.listdir(full):
                    fp = os.path.join(full, item)
                    if is_hidden_or_system(fp):
                        continue
                    try:    sz = os.path.getsize(fp) if os.path.isfile(fp) else None
                    except: sz = None
                    files.append({
                        "name":        item,
                        "isDirectory": os.path.isdir(fp),
                        "path":        fp.replace('\\', '/'),
                        "size":        sz
                    })
                current = full.replace('\\', '/')

            self._json(200, {"files": files, "currentPath": current})
        except PermissionError:
            self._json(403, {"error": "Permission denied — folder is restricted."})
        except Exception as e:
            self._json(500, {"error": str(e)})

    # ── API: apps ─────────────────────────────────────────────────────────────
    def _apps(self):
        try:
            af   = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'apps.json')
            apps = json.load(open(af, encoding='utf-8')) if os.path.exists(af) else []
            self._json(200, {"apps": apps})
        except Exception as e:
            self._json(500, {"error": str(e)})

    # ── API: MJPEG screen share ───────────────────────────────────────────────
    def _screen(self):
        if not SCREEN_OK:
            return self._json(503, {"error": "Run: pip install Pillow"})
        self.send_response(200)
        self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=--FW')
        self.send_header('Cache-Control', 'no-cache')
        self.cors()
        self.end_headers()
        try:
            while True:
                frame = capture_jpeg()
                if not frame:
                    break
                self.wfile.write(
                    b'--FW\r\nContent-Type: image/jpeg\r\nContent-Length: '
                    + str(len(frame)).encode()
                    + b'\r\n\r\n'
                    + frame + b'\r\n'
                )
                self.wfile.flush()
                time.sleep(0.1)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    # ── API: launch ───────────────────────────────────────────────────────────
    def _launch(self):
        try:
            data = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            exe  = data.get('executablePath', '')
            if not exe or not os.path.exists(exe):
                return self._json(400, {"error": "Invalid path"})
            subprocess.Popen(exe, shell=True,
                             creationflags=subprocess.CREATE_NEW_CONSOLE | subprocess.DETACHED_PROCESS)
            self._json(200, {"success": True})
        except Exception as e:
            self._json(500, {"error": str(e)})

    # ── API: upload (1 MB chunk streaming) ───────────────────────────────────
    def _upload(self):
        try:
            target   = urllib.parse.unquote(self.headers.get('X-Target-Path', ''))
            filename = os.path.basename(urllib.parse.unquote(self.headers.get('X-File-Name', '')))
            length   = int(self.headers.get('Content-Length', 0))

            if not target or not filename:
                return self._json(400, {"error": "Missing headers"})
            target = target.replace('/', os.sep)
            if not os.path.isdir(target):
                return self._json(400, {"error": "Target dir not found"})

            with open(os.path.join(target, filename), 'wb') as f:
                remaining = length
                while remaining > 0:
                    chunk = self.rfile.read(min(1024 * 1024, remaining))
                    if not chunk:
                        break
                    f.write(chunk)
                    remaining -= len(chunk)

            self._json(200, {"success": True})
        except Exception as e:
            self._json(500, {"error": str(e)})

    # ── File serving with HTTP 206 Range ─────────────────────────────────────
    def _serve_ranged(self, path):
        if not os.path.isfile(path):
            return self._json(404, {"error": f"File not found"})
        if is_hidden_or_system(path):
            return self._json(403, {"error": "Access denied"})

        fsize = os.path.getsize(path)
        mime, _ = mimetypes.guess_type(path)
        mime = mime or 'application/octet-stream'
        rng  = self.headers.get('Range')

        if rng:
            try:
                parts = rng.replace('bytes=', '').split('-')
                start = int(parts[0]) if parts[0] else 0
                end   = int(parts[1]) if parts[1] else fsize - 1
                end   = min(end, fsize - 1)
                length = end - start + 1

                self.send_response(206)
                self.send_header('Content-Type',   mime)
                self.send_header('Content-Range',  f'bytes {start}-{end}/{fsize}')
                self.send_header('Content-Length', str(length))
                self.send_header('Accept-Ranges',  'bytes')
                self.cors()
                self.end_headers()

                with open(path, 'rb') as f:
                    f.seek(start)
                    remaining = length
                    while remaining > 0:
                        chunk = f.read(min(512 * 1024, remaining))
                        if not chunk: break
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
            except Exception as e:
                self._json(416, {"error": str(e)})
        else:
            self.send_response(200)
            self.send_header('Content-Type',   mime)
            self.send_header('Content-Length', str(fsize))
            self.send_header('Accept-Ranges',  'bytes')
            self.cors()
            self.end_headers()
            with open(path, 'rb') as f:
                while True:
                    chunk = f.read(512 * 1024)
                    if not chunk: break
                    self.wfile.write(chunk)

    # ── Helpers ───────────────────────────────────────────────────────────────
    def _file(self, local_path, ct):
        if not os.path.exists(local_path):
            return self._json(404, {"error": f"Not found: {local_path}"})
        data = open(local_path, 'rb').read()
        self.send_response(200)
        self.send_header('Content-Type',   ct)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.cors()
        self.end_headers()
        self.wfile.write(body)


# ──────────────────────────────────────────────────────────────────────────────
#  Entry point
# ──────────────────────────────────────────────────────────────────────────────
def get_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:    s.connect(('10.255.255.255', 1)); return s.getsockname()[0]
    except: return '127.0.0.1'
    finally: s.close()

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(json.dumps({"error": "Usage: python server.py <port> <shared_dir>"}), flush=True)
        sys.exit(1)

    port, shared_dir = int(sys.argv[1]), sys.argv[2]

    class Cfg(Handler):
        pass
    Cfg.shared_dir = shared_dir

    HTTPServer.allow_reuse_address = True
    httpd = HTTPServer(('0.0.0.0', port), Cfg)
    print(json.dumps({"status": "started", "port": port, "ip": get_ip()}), flush=True)
    httpd.serve_forever()
