/**
 * 스모크 테스트 — 리팩토링 후에도 백엔드가 제 역할을 하는지 최소 검증.
 *
 * 실행:
 *   npm start            # 터미널 1
 *   npm run smoke        # 터미널 2
 *
 * 동작:
 *   1) GET /api/env                 → 200 + { env: 'sandbox' | 'live' }
 *   2) GET /api/credits/balance     → 200 + balance 필드 숫자 반환
 */

const BASE = process.env.SMOKE_BASE || 'http://localhost:8091';

async function call(method, path, body) {
    const init = { method, headers: body ? { 'Content-Type': 'application/json' } : {} };
    if (body) init.body = JSON.stringify(body);
    const res = await fetch(BASE + path, init);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) {}
    return { status: res.status, data, text };
}

async function run() {
    let failed = 0;
    const log = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++; };

    const envRes = await call('GET', '/api/env');
    log(envRes.status === 200, `GET /api/env → ${envRes.status}`);
    if (envRes.status !== 200) throw new Error('서버 미기동?');
    if (envRes.data.env !== 'sandbox') {
        console.log(`  ! 현재 env=${envRes.data.env}. 스모크는 sandbox에서만 실행합니다.`);
        process.exit(2);
    }
    log(true, `env=${envRes.data.env}`);

    const bal = await call('GET', '/api/credits/balance');
    log(bal.status === 200, `GET /api/credits/balance → ${bal.status}`);
    log(typeof bal.data?.balance === 'number', `balance=${bal.data?.balance}`);

    if (failed === 0) { console.log('\n스모크 통과.'); process.exit(0); }
    console.log(`\n스모크 실패: ${failed}건`);
    process.exit(1);
}

run().catch((err) => { console.error('스모크 오류:', err.message); process.exit(1); });
