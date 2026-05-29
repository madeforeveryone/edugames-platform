# madeforanyone 이전 가이드 (GitHub Organization 기준)

`unluckyidiot16` 개인 계정에서 분리해, 브랜드 소유의 **조직(Organization)** + **커스텀 도메인**으로 옮기는 절차입니다.
핵심 원리: **도메인 1개 = Pages 레포 1개**, 그리고 **커스텀 도메인을 앞세우면 그 뒤의 GitHub 계정은 사용자에게 안 보입니다.**

---

## 0) 이 zip에 들어있는 것

```
index.html                 ← 허브 (BASE_URL='' 적용, TypeRPG 카드 추가됨)
CNAME                      ← madeforanyone.com  (Pages 커스텀 도메인 설정 파일)
.gitignore
typerpg/
  index.html               ← TypeRPG 랜딩 페이지 (허브 카드가 여기로 연결)
  play/                    ← 영어판 게임 (전체화면, 실제 플레이)
    index.html app.js learning.js net.js style.css assets/
  server/                  ← 코업 웹소켓 서버 "소스" (Pages가 아닌 Railway에 배포)
  TYPERPG_README.md / TYPERPG_HANDOFF.md  ← 개발 문서
```

> ⚠️ **기존 게임들(ABCP, ASR, AOM …)은 이 zip에 없습니다.** 허브가 `BASE_URL=''`(루트 상대경로)로 바뀌었기 때문에, 새 레포 루트에 **기존 게임 폴더들을 그대로 복사해 넣어야** 카드 링크가 작동합니다. (WebGames 레포에서 폴더째로 가져오면 됩니다.)

---

## 1) 조직 + 레포 만들기

1. GitHub에서 **New organization** → 이름 `madeforanyone` (무료 플랜으로 충분).
2. 조직 안에 새 레포 생성, 이름은 **`madeforanyone.github.io`** 로.
   - 이 이름(=조직 사이트 레포)은 **루트(`/`)에서 서빙**돼서, `BASE_URL=''`의 루트 상대경로가 임시 URL에서도 그대로 작동합니다. (일반 프로젝트 레포는 `/레포명/` 하위경로라 루트 상대경로가 깨져요.)
3. 이 zip 내용 + 기존 게임 폴더들을 레포 루트에 올립니다(웹 업로드 또는 git push).

```
git init
git remote add origin https://github.com/madeforanyone/madeforanyone.github.io.git
git add . && git commit -m "init: hub + typerpg + games"
git branch -M main && git push -u origin main
```

---

## 2) Pages 켜고 임시 URL로 검증

1. 레포 **Settings → Pages** → Source: `main` 브랜치 `/ (root)`.
2. 1~2분 후 `https://madeforanyone.github.io/` 접속 → 허브가 뜨고, TypeRPG 카드 클릭 → `/typerpg/` 랜딩 → **PLAY → `/typerpg/play/`** 게임 실행까지 확인.
3. 다른 게임 카드들도 클릭해 폴더 복사가 제대로 됐는지 확인.

> 이 단계까지는 커스텀 도메인 없이도 동작합니다. 여기서 다 확인한 뒤 도메인을 붙이세요(다운타임 0).

---

## 3) 커스텀 도메인(madeforanyone.com) 연결

`CNAME` 파일은 이미 들어있습니다(내용: `madeforanyone.com`). 그래서 push하면 Settings → Pages의 커스텀 도메인이 자동으로 잡힙니다. 남은 건 **DNS**입니다.

도메인 등록업체(가비아/Cloudflare 등)의 DNS에 추가:

- **apex(`madeforanyone.com`)** → A 레코드 4개를 GitHub Pages IP로:
  ```
  185.199.108.153
  185.199.109.153
  185.199.110.153
  185.199.111.153
  ```
  (선택) IPv6 AAAA: `2606:50c0:8000::153`, `…8001::153`, `…8002::153`, `…8003::153`
- **`www`** → CNAME → `madeforanyone.github.io`

그다음 Settings → Pages에서 도메인 옆 체크가 초록색이 되면 **Enforce HTTPS** 체크.
DNS 전파는 보통 몇 분~몇 시간. `https://madeforanyone.com/`이 새 사이트를 서빙하면 성공.

---

## 4) 코업 서버(Railway) 따로 배포

`typerpg/server/`는 Node 웹소켓 서버라 **GitHub Pages가 못 돌립니다.** 기존처럼 Railway에 배포하세요. `net.js`가 운영 환경에선 Railway URL을 자동으로 잡습니다(코업만 서버 필요, 솔로 캠페인·던전은 정적 호스팅만으로 완전 작동).

---

## 5) 컷오버 & 정리

1. `https://madeforanyone.com`이 정상 서빙되는 것 확인.
2. 그제서야 구 `unluckyidiot16.github.io/WebGames` 배포를 내리거나 보관 처리.
3. 앞으로 **모든 공유·쇼츠·SNS 링크는 `madeforanyone.com` 기준**으로만 통일.
   - `…github.io` 절대링크는 레포를 옮기면 리다이렉트가 안 됩니다. 도메인만 쓰면, 나중에 계정/조직을 또 바꿔도 링크가 안 깨져요.

---

## 새 게임 추가하는 법 (앞으로)

1. 레포 루트에 `새게임폴더/` 추가 (게임 파일).
2. `index.html`의 `GAMES` 배열에 한 항목 추가:
   ```js
   { id:'NEWID', subject:'english', icon:'아이콘', color:'from-x-400 to-y-500',
     url: `${BASE_URL}/새게임폴더/`, status:'live',
     name:{ko:'',en:'',ja:'',zh:''}, desc:{ko:'',en:'',ja:'',zh:''} },
   ```
   - `url`은 루트 상대경로(`/폴더/`). 폴더 끝에 `index.html`이 자동으로 잡힙니다.
   - 폴더명과 `url`의 대소문자를 **정확히 일치**시키세요(GitHub Pages는 대소문자 구분).

---

## 메모

- 지금 허브의 `<title>`·헤더 문구는 기존("Learning Game Platform") 그대로 뒀습니다. 브랜드를 "Made for Anyone"으로 바꾸고 싶으면 말씀해주세요.
- TypeRPG는 타이핑 게임이라 데스크톱이 최적입니다. 랜딩·게임 모두 모바일 가상 키보드를 지원하지만, 모바일 쇼츠 유입을 고려해 카드 설명에 ⌨️ 표시를 넣어뒀습니다.
- 에셋 용량(TypeRPG ~14MB)은 지금은 문제없지만, 게임이 많이 쌓이면 PNG 최적화를 한 번 고려할 만합니다.


---

## 5) 새 게임 / 학습 자료 추가하는 법

이 통합 사이트는 **두 섹션**으로 나뉘어 있어요:
- 🎮 **Games** — 정적 HTML 게임 (`/games/<id>/`)
- 📚 **Learning Materials** — 인터랙티브 자료 (`/materials/<id>/`)

### A. 정적 게임 (TypeRPG 같은 패턴)
1. 레포 루트에 `games/새게임/` 추가.
2. `index.html`의 `GAMES` 배열에 한 항목 추가 (`type:'game'`).

### B. 빌드 필요 학습 자료 (Voyage 같은 React/Vite 패턴)
빌드 산출물만 커밋하는 단순 방식:
1. 자료 소스 레포에서 로컬 빌드 (`npm run build`).
2. **반드시 `vite.config.ts`에 `base: '/materials/새자료/'`** 설정 (안 하면 자산 경로가 깨짐).
3. 생성된 `dist/*`를 `materials/새자료/`로 복사·커밋.
4. `GAMES` 배열에 `type:'material'` 항목 추가.

자료가 늘어 자동화하고 싶어지면, 그때 Cloudflare Pages의 빌드 설정에 `npm` 오케스트레이션을 깔거나 GitHub Actions로 옮기는 식으로 승격하면 됩니다.

### URL 규약
- `url: \`${BASE_URL}/games/<id>/\`` 또는 `${BASE_URL}/materials/<id>/`
- 폴더 끝에 `index.html`이 있어야 폴더 URL로 잡힙니다.
- 폴더명·URL은 **정확히 일치**(대소문자 포함).
