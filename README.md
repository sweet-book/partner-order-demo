# 파트너 주문 demo

Sweetbook API 기반 파트너 주문 demo 웹앱.

![screenshot](screenshot.png)

> **참고**: 이 demo는 **3-tier 구조**로 동작합니다. 브라우저는 Sweetbook API를 직접 부르지 않으며,
> Sweetbook SDK와 API Key는 이 demo의 백엔드(`server.js`) 프로세스 안에만 존재합니다.

## 구조

```
 브라우저 (index.html, app.js)
        │
        │  fetch('/api/...')
        ▼
 이 demo 서버 (server.js, bookprintapi SDK 소유)
        │
        │  Sweetbook API Key (서버 env)
        ▼
 Sweetbook API
```

| 파일 | 역할 |
|---|---|
| `index.html`, `app.js`, `style.css` | 프론트엔드. SDK 미포함. `fetch('/api/...')`로만 백엔드와 통신 |
| `server.js` | 백엔드. Node SDK(`bookprintapi`)로 Sweetbook API 호출. 좁은 REST 엔드포인트 노출 |
| `.env` | 서버 전용 설정. API Key와 환경(sandbox/live). **브라우저에 절대 내려가지 않음** |

## 실행

### 0. 클론

```bash
git clone https://github.com/sweet-book/partner-order-demo.git
cd partner-order-demo
```

특정 릴리스를 받으려면: `git clone -b v0.2.0 ...` 또는 [Releases](https://github.com/sweet-book/partner-order-demo/releases)에서 tarball 다운로드.

### 1. 설정

```bash
cp .env.example .env
```

`.env`를 열어 값을 채우세요:

```ini
SWEETBOOK_ENV=sandbox
SWEETBOOK_API_KEY=sk_test_xxxxx
PORT=8090
```

> 하나의 프로세스는 하나의 환경만 담당합니다. sandbox와 live를 모두 쓰려면 **.env 파일을 두 개** 두고 각각 다른 포트로 띄우세요.

### 2. 의존성 설치

```bash
npm install
```

### 3. 실행

```bash
npm start
# 또는
node server.js
```

브라우저에서 `http://localhost:8090` 접속.

## 백엔드가 노출하는 REST 엔드포인트

프론트가 호출하는 좁은 API입니다. 확장하려면 `server.js`의 `routes` 배열에 추가하세요.

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/env` | 서버의 환경(sandbox/live)만 반환. API Key는 내려주지 않음 |
| GET | `/api/credits/balance` | 충전금 잔액 |
| GET | `/api/credits/transactions` | 거래 내역 |
| POST | `/api/credits/sandbox-charge` | Sandbox 충전 (sandbox 환경 전용) |
| GET | `/api/books?status=finalized` | 책 목록 |
| POST | `/api/orders/estimate` | 견적 조회 |
| POST | `/api/orders` | 주문 생성 |
| GET | `/api/orders` | 주문 목록 |
| GET | `/api/orders/:uid` | 주문 상세 |
| POST | `/api/orders/:uid/cancel` | 주문 취소 |
| PATCH | `/api/orders/:uid/shipping` | 배송지 변경 |

## 왜 3-tier인가

이전 버전에서는 `sweetbook-sdk-*.js`를 브라우저에서 직접 로드하여 API Key를 `config.js`에 두었습니다.
이 구조는 **API Key가 클라이언트에 노출**되므로 실제 서비스에 그대로 쓸 수 없고,
개발자가 demo를 보고 SDK를 프론트엔드에 번들하는 오해를 불러왔습니다.

3-tier 구조로 바꾸면서:
- SDK는 백엔드 전용 (파트너 실서비스에 그대로 이식 가능)
- API Key는 프로세스 환경변수로만 관리
- 프론트는 좁은 백엔드 API만 바라보므로 추후 다른 언어(Python/Java 등) 백엔드로 쉽게 교체 가능

## 이 demo가 사용하는 SDK

- 레포: [sweet-book/bookprintapi-nodejs-sdk](https://github.com/sweet-book/bookprintapi-nodejs-sdk) (Node.js SDK, public)
- 의존성 선언: `package.json` → `"bookprintapi": "github:sweet-book/bookprintapi-nodejs-sdk#v0.1.1"`
- 사용 위치: `server.js` → `const { SweetbookClient } = require('bookprintapi')`

> **배포 방식**: npm 레지스트리가 아니라 **GitHub 태그**에서 바로 설치됩니다.
> 파트너는 별도 npm 계정/사내 레지스트리 없이 `npm install`만으로 SDK를 받을 수 있습니다.

### 버전 올리기
신규 버전 태그가 찍히면 `package.json`의 `#v0.1.1` 부분을 해당 태그로 바꾸고 `npm install` 재실행.

### SDK를 로컬에서 수정하며 개발할 때
demo와 SDK 레포가 같은 부모 디렉토리에 함께 clone되어 있다면:

```bash
# demo 디렉토리에서
npm install ../bookprintapi-nodejs-sdk
```

이 명령은 로컬 경로로 임시 오버라이드만 하고, `package.json`은 **수정하지 마세요**.
개발 끝나면 `npm install`로 원래 git 태그 참조로 되돌아갑니다.

### SDK 자체를 바로 학습하려면

- [`bookprintapi-nodejs-sdk/README.md`](../bookprintapi-nodejs-sdk/README.md) — SDK API 개요
- [`bookprintapi-nodejs-sdk/examples/`](../bookprintapi-nodejs-sdk/examples/) — 실행 가능한 예제
  - `server_pipeline.js` — 책 생성 → 표지 → 내지 → 발행면 → finalize → 주문 E2E
  - `01_create_book.js` — 책 생성 최소 흐름
  - `02_order.js` — 충전금 → 견적 → 주문
  - `03_webhook_server.js` — 웹훅 수신 + 서명 검증

이 demo의 `server.js`는 위 예제들의 엔드포인트를 **좁은 REST**로 감싼 형태입니다.
