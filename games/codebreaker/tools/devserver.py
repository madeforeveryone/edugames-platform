#!/usr/bin/env python3
# ============================================================
#  devserver.py — 캐시 없는 개발용 정적 서버
#
#  왜 필요한가:
#    기본 `python3 -m http.server`는 조건부 요청(If-Modified-Since)에 304를
#    돌려줘서, 브라우저가 옛 파일을 계속 캐싱한다. LDtk 변환/코드 수정 후에도
#    게임이 바뀌지 않는 주범. 이 서버는 모든 응답에 no-store를 붙여
#    브라우저가 항상 최신 파일을 받게 한다.
#
#  사용:
#    python3 tools/devserver.py        (기본 포트 8000)
#    python3 tools/devserver.py 8080   (포트 지정)
# ============================================================
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # 모든 응답에 강력한 no-cache. 304 캐시 재사용을 막는다.
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def send_header(self, key, value):
        # 기본 핸들러가 붙이는 Last-Modified는 두되, 조건부 304는 아래 send_head 우회로 차단.
        super().send_header(key, value)

    # 조건부 요청을 무시하고 항상 200으로 본문을 보낸다 (304 방지).
    def do_GET(self):
        # If-Modified-Since / If-None-Match 헤더를 제거해 부모가 304를 못 내게 함.
        self.headers.replace_header('If-Modified-Since', '') if 'If-Modified-Since' in self.headers else None
        if 'If-None-Match' in self.headers:
            del self.headers['If-None-Match']
        if 'If-Modified-Since' in self.headers:
            del self.headers['If-Modified-Since']
        super().do_GET()

def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    httpd = ThreadingHTTPServer(('', port), NoCacheHandler)
    print(f'No-cache dev server on http://localhost:{port}  (Ctrl+C to stop)')
    print('브라우저가 항상 최신 파일을 받습니다 (304 캐시 없음).')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nstopped.')

if __name__ == '__main__':
    main()
