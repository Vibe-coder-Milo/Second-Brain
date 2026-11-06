"""In-memory stand-in for the parts of the GitHub Git Data API the app uses."""
import base64, hashlib, json, re, time
from urllib.parse import urlparse, parse_qs

TOKEN = 'test-token'


class MockRepo:
    def __init__(self, owner='Vibe-coder-Milo', repo='second-brain-data', empty=False):
        self.owner, self.repo = owner, repo
        self.blobs, self.trees, self.commits = {}, {}, {}
        self.head = None
        self.calls = []
        self.fail_next_ref_update = False
        if not empty:
            readme = self._blob(b'# second-brain-data\n')
            tree = self._tree({'README.md': readme})
            self.head = self._commit(tree, [], 'Initial commit')

    def _blob(self, data: bytes):
        sha = hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest()
        self.blobs[sha] = data
        return sha

    def _tree(self, entries: dict):
        body = json.dumps(sorted(entries.items())).encode()
        sha = hashlib.sha1(b'tree' + body).hexdigest()
        self.trees[sha] = dict(entries)
        return sha

    def _commit(self, tree, parents, message):
        body = json.dumps([tree, parents, message, len(self.commits)]).encode()
        sha = hashlib.sha1(b'commit' + body).hexdigest()
        self.commits[sha] = {'tree': tree, 'parents': parents, 'message': message, 'date': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
        return sha

    def files(self):
        if not self.head:
            return {}
        t = self.trees[self.commits[self.head]['tree']]
        return {p: self.blobs[s] for p, s in t.items()}

    # ---- routing --------------------------------------------------------
    def handle(self, method, url, headers, body):
        cors = {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': 'authorization, content-type, x-github-api-version, accept',
            'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
            'content-type': 'application/json',
        }
        if method == 'OPTIONS':
            return 204, cors, ''
        auth = headers.get('authorization', '')
        if auth != f'Bearer {TOKEN}':
            return 401, cors, json.dumps({'message': 'Bad credentials'})
        m = re.match(r'https://api\.github\.com/repos/([^/]+)/([^/?]+)(.*)$', url)
        if not m or m.group(1) != self.owner or m.group(2) != self.repo:
            return 404, cors, json.dumps({'message': 'Not Found'})
        path = m.group(3).split('?')[0]
        self.query = {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}
        self.calls.append((method, path))
        data = json.loads(body) if body else None
        try:
            status, out = self.route(method, path, data)
        except KeyError:
            status, out = 404, {'message': 'Not Found'}
        return status, cors, json.dumps(out)

    def route(self, method, path, data):
        if method == 'GET' and path == '':
            return 200, {'full_name': f'{self.owner}/{self.repo}', 'private': True}
        if method == 'GET' and path == '/git/ref/heads/main':
            if not self.head:
                return 409, {'message': 'Git Repository is empty.'}
            return 200, {'ref': 'refs/heads/main', 'object': {'sha': self.head, 'type': 'commit'}}
        if method == 'GET' and path.startswith('/git/commits/'):
            sha = path.rsplit('/', 1)[1]
            c = self.commits[sha]
            return 200, {'sha': sha, 'tree': {'sha': c['tree']}, 'parents': [{'sha': p} for p in c['parents']]}
        if method == 'GET' and path.startswith('/git/trees/'):
            sha = path.rsplit('/', 1)[1]
            t = self.trees[sha]
            return 200, {'sha': sha, 'truncated': False, 'tree': [{'path': p, 'mode': '100644', 'type': 'blob', 'sha': s} for p, s in t.items()]}
        if method == 'GET' and path.startswith('/git/blobs/'):
            sha = path.rsplit('/', 1)[1]
            b64 = base64.b64encode(self.blobs[sha]).decode()
            b64 = '\n'.join(b64[i:i + 60] for i in range(0, len(b64), 60))
            return 200, {'sha': sha, 'content': b64, 'encoding': 'base64', 'size': len(self.blobs[sha])}
        if method == 'POST' and path == '/git/blobs':
            raw = base64.b64decode(data['content']) if data.get('encoding') == 'base64' else data['content'].encode()
            return 201, {'sha': self._blob(raw)}
        if method == 'POST' and path == '/git/trees':
            entries = dict(self.trees[data['base_tree']]) if data.get('base_tree') else {}
            for e in data['tree']:
                if e.get('sha') is None:
                    if e['path'] not in entries:
                        return 422, {'message': 'path not in base tree'}
                    entries.pop(e['path'])
                else:
                    if e['sha'] not in self.blobs:
                        return 422, {'message': 'bad blob'}
                    entries[e['path']] = e['sha']
            return 201, {'sha': self._tree(entries)}
        if method == 'POST' and path == '/git/commits':
            return 201, {'sha': self._commit(data['tree'], data['parents'], data['message'])}
        if method == 'PATCH' and path == '/git/refs/heads/main':
            if self.fail_next_ref_update:
                self.fail_next_ref_update = False
                return 422, {'message': 'Update is not a fast forward'}
            new = data['sha']
            if self.head and self.head not in self.commits[new]['parents'] and not data.get('force'):
                return 422, {'message': 'Update is not a fast forward'}
            self.head = new
            return 200, {'object': {'sha': new}}
        if method == 'PUT' and path.startswith('/contents/'):
            p = path[len('/contents/'):]
            blob = self._blob(base64.b64decode(data['content']))
            base = dict(self.trees[self.commits[self.head]['tree']]) if self.head else {}
            base[p] = blob
            tree = self._tree(base)
            self.head = self._commit(tree, [self.head] if self.head else [], data['message'])
            return 201, {'content': {'sha': blob, 'path': p}, 'commit': {'sha': self.head}}
        if method == 'GET' and path == '/commits':
            want = self.query.get('path'); out = []; c = self.head
            while c:
                cm = self.commits[c]; par = cm['parents'][0] if cm['parents'] else None
                mine = self.trees[cm['tree']].get(want); theirs = self.trees[self.commits[par]['tree']].get(want) if par else None
                if mine != theirs and mine is not None:
                    out.append({'sha': c, 'commit': {'message': cm['message'], 'committer': {'date': cm['date']}, 'author': {'date': cm['date']}}})
                c = par
            return 200, out[: int(self.query.get('per_page', 30))]
        if method == 'GET' and path.startswith('/contents/'):
            p = path[len('/contents/'):]; ref = self.query.get('ref', self.head)
            b = self.trees[self.commits[ref]['tree']].get(p)
            if not b: return 404, {'message': 'Not Found'}
            return 200, {'sha': b, 'path': p, 'size': len(self.blobs[b]), 'encoding': 'base64', 'content': base64.b64encode(self.blobs[b]).decode()}
        return 404, {'message': f'unhandled {method} {path}'}


def install(context_or_page, repo: MockRepo):
    def handler(route, request):
        status, headers, body = repo.handle(request.method, request.url, {k.lower(): v for k, v in request.headers.items()}, request.post_data)
        route.fulfill(status=status, headers=headers, body=body)
    context_or_page.route('https://api.github.com/**', handler)
