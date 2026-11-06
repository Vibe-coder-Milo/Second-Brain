import http.server, socketserver, sys, functools

class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript', '.mjs': 'text/javascript', '.webmanifest': 'application/manifest+json',
        '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.json': 'application/json', '.gz': 'application/gzip',
    }
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a):
        pass

root = sys.argv[1]
port = int(sys.argv[2])
socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('127.0.0.1', port), functools.partial(H, directory=root)) as s:
    s.serve_forever()
