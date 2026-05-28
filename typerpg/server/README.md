# TypeRPG Co-op Relay Server

호스트 권위(host-authoritative) 멀티플레이를 위한 WebSocket 릴레이 서버.
서버는 메시지만 전달하고, 게임 로직은 호스트 브라우저가 담당.

## 로컬 실행

```bash
cd server
npm install
npm start
```

기본 포트: `3001`

접속 확인:
- `http://localhost:3001/health` → `{ ok: true, rooms: 0 }`
- WebSocket: `ws://localhost:3001`

## Railway 배포

1. Railway에서 새 프로젝트 생성 → "Empty Project"
2. GitHub 레포 연결 (이 `server/` 디렉토리)
3. Root Directory: `server`
4. Build: `npm install`
5. Start: `npm start`
6. `PORT` 환경 변수는 Railway가 자동 주입
7. 배포 후 받은 URL (예: `typerpg-server-production.up.railway.app`)을 클라이언트의 `NET_CONFIG.serverUrl`에 설정

## 프로토콜

### Client → Server
```json
{ "type": "create_room" }
{ "type": "join_room", "roomCode": "ABC123" }
{ "type": "relay", "roomCode": "ABC123", "payload": { ... } }
{ "type": "leave_room" }
```

### Server → Client
```json
{ "type": "room_created", "roomCode": "ABC123" }
{ "type": "room_joined",  "roomCode": "ABC123", "role": "guest" }
{ "type": "peer_joined",  "roomCode": "ABC123" }
{ "type": "peer_left",    "roomCode": "ABC123", "reason": "disconnect" }
{ "type": "relay",        "payload": { ... }, "from": "host" }
{ "type": "error",        "reason": "..." }
```

## 운영 메모

- 룸은 30분 TTL (둘 다 끊기면 즉시 청소)
- 같은 룸에 호스트 1 + 게스트 1 (3번째 입장 거부)
- 코드는 6자리, 헷갈리는 문자(0/O/1/I/L) 제외
