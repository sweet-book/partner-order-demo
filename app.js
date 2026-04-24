/**
 * 파트너 주문 demo — 프론트엔드
 *
 * 이 파일은 브라우저에서 실행됩니다.
 * Sweetbook SDK와 API Key는 백엔드(server.js)에만 존재하며,
 * 여기서는 백엔드가 노출한 좁은 REST 엔드포인트(/api/*)만 호출합니다.
 */

// ============================================================
// 전역 상태
// ============================================================

let currentEnv = 'sandbox';           // 서버에서 주입받음
let selectedBooks = new Map();        // bookUid → { bookUid, title, pageCount, specName, quantity }
let ordersOffset = 0;
const ORDERS_LIMIT = 20;

// ============================================================
// API 클라이언트 — 백엔드 /api/* 호출
// ============================================================

async function apiFetch(method, path, { query, body } = {}) {
    let url = path;
    if (query) {
        const qs = new URLSearchParams(Object.entries(query).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
        const s = qs.toString();
        if (s) url += '?' + s;
    }
    const init = {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    const res = await fetch(url, init);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }

    if (!res.ok) {
        const err = new Error((data && data.error) || `HTTP ${res.status}`);
        err.statusCode = res.status;
        err.details = data && data.details;
        throw err;
    }
    return data;
}

const api = {
    env: {
        get: () => apiFetch('GET', '/api/env'),
    },
    credits: {
        balance: () => apiFetch('GET', '/api/credits/balance'),
        transactions: ({ limit } = {}) => apiFetch('GET', '/api/credits/transactions', { query: { limit } }),
        sandboxCharge: (amount, memo) => apiFetch('POST', '/api/credits/sandbox-charge', { body: { amount, memo } }),
    },
    books: {
        list: ({ status, limit, offset } = {}) => apiFetch('GET', '/api/books', { query: { status, limit, offset } }),
    },
    orders: {
        estimate: (items) => apiFetch('POST', '/api/orders/estimate', { body: { items } }),
        create: (payload) => apiFetch('POST', '/api/orders', { body: payload }),
        list: ({ limit, offset, status } = {}) => apiFetch('GET', '/api/orders', { query: { limit, offset, status } }),
        get: (uid) => apiFetch('GET', `/api/orders/${encodeURIComponent(uid)}`),
        cancel: (uid, reason) => apiFetch('POST', `/api/orders/${encodeURIComponent(uid)}/cancel`, { body: { reason } }),
        updateShipping: (uid, update) => apiFetch('PATCH', `/api/orders/${encodeURIComponent(uid)}/shipping`, { body: update }),
    },
};

// ============================================================
// 초기화 — 서버의 env 정보를 받아 UI 조정
// ============================================================

async function boot() {
    try {
        const info = await api.env.get();
        currentEnv = info.env;
        renderEnvBanner();
        updateChargeSectionVisibility();
        await refreshCredit();
        log(`백엔드 연결됨 (env=${currentEnv})`, 'success');
    } catch (e) {
        log(`백엔드 연결 실패: ${e.message}`, 'error');
    }
}

function renderEnvBanner() {
    const el = document.getElementById('envBanner');
    if (!el) return;
    if (currentEnv === 'live') {
        el.textContent = '운영 환경 — 실제 충전금이 차감되고 실제 주문이 생성됩니다.';
        el.className = 'env-banner env-banner-live';
    } else {
        el.textContent = '샌드박스 환경 — 테스트 주문만 생성됩니다.';
        el.className = 'env-banner env-banner-sandbox';
    }
}

// ============================================================
// 탭 전환
// ============================================================

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// ============================================================
// 충전금
// ============================================================

function isSandbox() { return currentEnv === 'sandbox'; }

function updateChargeSectionVisibility() {
    const sandboxSection = document.getElementById('sandboxChargeSection');
    const liveNotice = document.getElementById('liveChargeNotice');
    if (isSandbox()) {
        sandboxSection.classList.remove('hidden');
        liveNotice.classList.add('hidden');
    } else {
        sandboxSection.classList.add('hidden');
        liveNotice.classList.remove('hidden');
    }
}

async function doSandboxCharge() {
    const amount = parseInt(document.getElementById('chargeAmount').value) || 0;
    if (amount <= 0) { log('충전 금액을 입력하세요.', 'error'); return; }
    try {
        log(`Sandbox 충전 중... ${amount.toLocaleString()}원`, 'info');
        const data = await api.credits.sandboxCharge(amount);
        const balance = data.balance ?? 0;
        setCreditBadge(balance);
        document.getElementById('chargeBalanceResult').textContent = `→ 잔액: ${balance.toLocaleString()}원`;
        log(`Sandbox 충전 완료! 잔액: ${balance.toLocaleString()}원`, 'success');
    } catch (e) {
        log(`충전 실패: ${e.message}`, 'error');
    }
}

function setCreditBadge(balance) {
    const badge = document.getElementById('creditBadge');
    badge.textContent = `잔액: ${Number(balance || 0).toLocaleString()}원`;
    badge.classList.remove('hidden');
}

async function refreshCredit() {
    try {
        const data = await api.credits.balance();
        const balance = data.balance ?? 0;
        setCreditBadge(balance);
        document.getElementById('chargeBalanceResult').textContent = `잔액: ${balance.toLocaleString()}원`;
        log(`충전금 잔액: ${balance.toLocaleString()}원`, 'info');
    } catch (e) {
        log(`충전금 조회 실패: ${e.message}`, 'error');
    }
}

async function loadCreditTx() {
    try {
        await refreshCredit();
        const data = await api.credits.transactions({ limit: 50 });
        const txList = data?.transactions ?? [];
        const pagination = data?.pagination ?? {};

        if (!txList.length) {
            document.getElementById('creditTxTable').innerHTML = '<div class="empty-state">거래 내역이 없습니다.</div>';
            return;
        }

        let html = `<table>
            <thead><tr><th>일시</th><th>사유</th><th>금액</th><th>잔액</th><th>메모</th></tr></thead>
            <tbody>`;
        txList.forEach(tx => {
            const amt = tx.amount ?? 0;
            const bal = tx.balanceAfter ?? 0;
            const reason = tx.reasonDisplay ?? tx.reason ?? '';
            const memo = tx.memo ?? '';
            const dt = formatDate(tx.createdAt);
            const amtClass = amt >= 0 ? 'log-success' : 'log-error';
            html += `<tr>
                <td class="nowrap">${dt}</td>
                <td>${escHtml(reason)}</td>
                <td class="text-right ${amtClass}">${Number(amt).toLocaleString()}</td>
                <td class="text-right">${Number(bal).toLocaleString()}</td>
                <td class="text-muted">${escHtml(memo)}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        document.getElementById('creditTxTable').innerHTML = html;
        const total = pagination.total ?? txList.length;
        log(`충전금 거래 ${txList.length}건 조회 (총 ${total}건)`, 'success');
    } catch (e) {
        log(`충전금 거래 조회 실패: ${e.message}`, 'error');
    }
}

// ============================================================
// 책 목록 (FINALIZED)
// ============================================================

async function loadBooks() {
    try {
        log('FINALIZED 책 목록 조회 중...', 'info');
        const data = await api.books.list({ status: 'finalized', limit: 100 });
        const books = data?.books ?? (Array.isArray(data) ? data : []);
        if (!books.length) {
            document.getElementById('bookList').innerHTML = '<div class="empty-state">FINALIZED 상태의 책이 없습니다.</div>';
            log('FINALIZED 책 없음', 'warn');
            return;
        }

        books.forEach(b => {
            const uid = b.bookUid;
            const title = b.title ?? '(제목 없음)';
            const pages = b.pageCount ?? 0;
            const spec = b.bookSpecName ?? b.specName ?? '';
            selectedBooks.set(uid, { bookUid: uid, title, pageCount: pages, specName: spec, quantity: 1 });
        });
        renderBookList(books);
        log(`FINALIZED 책 ${books.length}권 조회 (전체 선택)`, 'success');
    } catch (e) {
        log(`책 목록 조회 실패: ${e.message}`, 'error');
    }
}

function renderBookList(books) {
    let html = '';
    books.forEach(b => {
        const uid = b.bookUid;
        const title = b.title ?? '(제목 없음)';
        const pages = b.pageCount ?? 0;
        const spec = b.bookSpecName ?? b.specName ?? '';
        const checked = selectedBooks.has(uid);
        const qty = checked ? selectedBooks.get(uid).quantity : 1;

        html += `<div class="book-row">
            <input type="checkbox" id="chk-${uid}" ${checked ? 'checked' : ''} onchange="toggleBook('${uid}', '${escAttr(title)}', ${pages}, '${escAttr(spec)}', this.checked)" />
            <div class="book-info">
                <div class="book-title">${escHtml(title)}</div>
                <div class="book-meta">${uid} | ${pages}p | ${escHtml(spec)}</div>
            </div>
            <input type="number" id="qty-${uid}" min="1" max="100" value="${qty}" onchange="updateQty('${uid}', this.value)" title="수량" />
        </div>`;
    });
    document.getElementById('bookList').innerHTML = html;
}

function toggleBook(uid, title, pages, spec, checked) {
    if (checked) {
        const qty = parseInt(document.getElementById(`qty-${uid}`)?.value) || 1;
        selectedBooks.set(uid, { bookUid: uid, title, pageCount: pages, specName: spec, quantity: qty });
    } else {
        selectedBooks.delete(uid);
    }
    log(`선택: ${selectedBooks.size}권`, 'info');
}

function updateQty(uid, val) {
    const qty = Math.max(1, parseInt(val) || 1);
    if (selectedBooks.has(uid)) selectedBooks.get(uid).quantity = qty;
}

function addBookDirect() {
    const input = document.getElementById('bookUidDirect');
    const uid = input.value.trim();
    if (!uid) return;
    if (selectedBooks.has(uid)) { log(`이미 추가된 책: ${uid}`, 'warn'); return; }

    selectedBooks.set(uid, { bookUid: uid, title: uid, pageCount: 0, specName: '', quantity: 1 });
    input.value = '';

    const container = document.getElementById('bookList');
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) container.innerHTML = '';

    const row = document.createElement('div');
    row.className = 'book-row';
    row.innerHTML = `
        <input type="checkbox" checked onchange="toggleBook('${uid}', '${uid}', 0, '', this.checked)" />
        <div class="book-info">
            <div class="book-title">${escHtml(uid)}</div>
            <div class="book-meta">직접 입력</div>
        </div>
        <input type="number" min="1" max="100" value="1" onchange="updateQty('${uid}', this.value)" />
    `;
    container.appendChild(row);
    log(`책 추가: ${uid}`, 'success');
}

// ============================================================
// 배송지 & 아이템 빌드
// ============================================================

function getSelectedItems() {
    const items = [];
    selectedBooks.forEach(b => items.push({ bookUid: b.bookUid, quantity: b.quantity }));
    return items;
}

function getShipping() {
    return {
        recipientName: document.getElementById('shipName').value.trim(),
        recipientPhone: document.getElementById('shipPhone').value.trim(),
        postalCode: document.getElementById('shipPostal').value.trim(),
        address1: document.getElementById('shipAddr1').value.trim(),
        address2: document.getElementById('shipAddr2').value.trim() || undefined,
        shippingMemo: document.getElementById('shipMemo').value.trim() || undefined,
    };
}

function validateOrder() {
    const items = getSelectedItems();
    if (!items.length) { alert('주문할 책을 선택하세요.'); return false; }
    const ship = getShipping();
    if (!ship.recipientName) { alert('수령인을 입력하세요.'); document.getElementById('shipName').focus(); return false; }
    if (!ship.recipientPhone) { alert('전화번호를 입력하세요.'); document.getElementById('shipPhone').focus(); return false; }
    if (!ship.postalCode) { alert('우편번호를 입력하세요.'); document.getElementById('shipPostal').focus(); return false; }
    if (!ship.address1) { alert('주소를 입력하세요.'); document.getElementById('shipAddr1').focus(); return false; }
    return true;
}

// ============================================================
// 견적 조회
// ============================================================

async function doEstimate() {
    const items = getSelectedItems();
    if (!items.length) { log('견적할 책을 선택하세요.', 'error'); return; }

    try {
        log(`견적 조회 중... (${items.length}권)`, 'info');
        const data = await api.orders.estimate(items);

        const el = document.getElementById('estimateResult');
        el.classList.remove('hidden');

        let itemsHtml = '';
        (data.items || []).forEach(it => {
            const uid = it.bookUid ?? '';
            const pages = it.pageCount ?? 0;
            const qty = it.quantity ?? 1;
            const unit = it.unitPrice ?? 0;
            const amt = it.itemAmount ?? 0;
            const title = selectedBooks.get(uid)?.title || uid;
            itemsHtml += `<div class="estimate-row">
                <span>${escHtml(title)} (${pages}p x ${qty})</span>
                <span>${Number(unit).toLocaleString()} x ${qty} = ${Number(amt).toLocaleString()}원</span>
            </div>`;
        });

        const productAmt = data.productAmount ?? 0;
        const shipFee = data.shippingFee ?? 0;
        const packFee = data.packagingFee ?? 0;
        const totalAmt = data.totalAmount ?? 0;
        const paidCredit = data.paidCreditAmount ?? 0;
        const creditBal = data.creditBalance ?? 0;
        const sufficient = data.creditSufficient ?? false;

        el.innerHTML = `<div class="estimate-result">
            <h3>견적 결과</h3>
            ${itemsHtml}
            <div class="estimate-row"><span>상품 금액</span><span>${Number(productAmt).toLocaleString()}원</span></div>
            <div class="estimate-row"><span>배송비</span><span>${Number(shipFee).toLocaleString()}원</span></div>
            ${packFee > 0 ? `<div class="estimate-row"><span>포장비</span><span>${Number(packFee).toLocaleString()}원</span></div>` : ''}
            <div class="estimate-row"><span>합계 (세전)</span><span>${Number(totalAmt).toLocaleString()}원</span></div>
            <div class="estimate-row vat"><span>결제 금액 (VAT 10% 포함)</span><span>${Number(paidCredit).toLocaleString()}원</span></div>
            <div class="estimate-row total"><span>현재 충전금</span><span>${Number(creditBal).toLocaleString()}원</span></div>
            <div class="estimate-row total"><span>결제 후 잔액</span>
                <span style="color:${sufficient ? 'var(--success)' : 'var(--danger)'}">${Number(creditBal - paidCredit).toLocaleString()}원 ${sufficient ? '' : '(잔액 부족)'}</span>
            </div>
        </div>`;

        log(`견적 완료: 결제금액 ${Number(paidCredit).toLocaleString()}원 (VAT 포함)`, 'success');
    } catch (e) {
        log(`견적 실패: ${e.message}`, 'error');
    }
}

// ============================================================
// 주문 생성
// ============================================================

async function doOrder() {
    if (!validateOrder()) return;
    const items = getSelectedItems();
    const shipping = getShipping();
    const externalRef = document.getElementById('externalRef').value.trim() || undefined;

    const itemSummary = items.map(i => `${selectedBooks.get(i.bookUid)?.title || i.bookUid}(x${i.quantity})`).join(', ');
    const confirmed = confirm(`주문을 생성하시겠습니까?\n\n항목: ${itemSummary}\n수령인: ${shipping.recipientName}\n\n* 충전금이 즉시 차감됩니다.`);
    if (!confirmed) return;

    const btn = document.getElementById('btnOrder');
    btn.disabled = true;
    btn.textContent = '주문 중...';

    try {
        log(`주문 생성 중... (${items.length}권, ${shipping.recipientName})`, 'info');
        const payload = { items, shipping };
        if (externalRef) payload.externalRef = externalRef;
        const data = await api.orders.create(payload);

        const orderUid = data.orderUid ?? '';
        const paidCredit = data.paidCreditAmount ?? 0;
        const balAfter = data.creditBalanceAfter;

        log(`주문 생성 완료! orderUid=${orderUid}, 결제=${Number(paidCredit).toLocaleString()}원`, 'success');
        if (balAfter != null) setCreditBadge(balAfter);

        selectedBooks.clear();
        document.getElementById('bookList').innerHTML = '<div class="empty-state">주문이 완료되었습니다. 주문 내역 탭에서 확인하세요.</div>';
        document.getElementById('estimateResult').classList.add('hidden');

        document.querySelector('[data-tab="tab-orders"]').click();
        loadOrders();
    } catch (e) {
        if (e.statusCode === 402) log(`잔액 부족! ${e.message}`, 'error');
        else log(`주문 실패: ${e.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '주문하기';
    }
}

// ============================================================
// 주문 목록
// ============================================================

async function loadOrders(offset = 0) {
    ordersOffset = offset;
    const statusFilter = document.getElementById('orderStatusFilter').value;
    const params = { limit: ORDERS_LIMIT, offset };
    if (statusFilter) params.status = parseInt(statusFilter);

    try {
        log('주문 목록 조회 중...', 'info');
        const data = await api.orders.list(params);
        const orders = data?.orders ?? [];
        const pagination = data?.pagination ?? {};

        if (!orders.length) {
            document.getElementById('orderTableWrap').innerHTML = '<div class="empty-state">주문 내역이 없습니다.</div>';
            document.getElementById('orderPagination').innerHTML = '';
            log('주문 없음', 'info');
            return;
        }

        let html = `<table>
            <thead><tr><th>주문번호</th><th>상태</th><th>항목수</th><th>총액</th><th>결제액</th><th>수령인</th><th>주문일</th><th></th></tr></thead>
            <tbody>`;
        orders.forEach(o => {
            const uid = o.orderUid;
            const st = o.orderStatus;
            const stDisplay = o.orderStatusDisplay ?? '';
            const itemCnt = o.itemCount ?? 0;
            const total = o.totalAmount ?? 0;
            const paid = o.paidCreditAmount ?? 0;
            const recipient = o.recipientName ?? '';
            const dt = formatDate(o.orderedAt);
            const extRef = o.externalRef ?? '';
            html += `<tr style="cursor:pointer" onclick="showOrderDetail('${uid}')">
                <td>
                    <div style="font-weight:600">${uid}</div>
                    ${extRef ? `<div class="text-muted">${escHtml(extRef)}</div>` : ''}
                </td>
                <td><span class="status-badge status-${st}">${escHtml(stDisplay) || st}</span></td>
                <td>${itemCnt}</td>
                <td class="text-right nowrap">${Number(total).toLocaleString()}</td>
                <td class="text-right nowrap">${Number(paid).toLocaleString()}</td>
                <td>${escHtml(recipient)}</td>
                <td class="nowrap">${dt}</td>
                <td><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();showOrderDetail('${uid}')">상세</button></td>
            </tr>`;
        });
        html += '</tbody></table>';
        document.getElementById('orderTableWrap').innerHTML = html;

        const total = pagination.total ?? 0;
        const hasNext = pagination.hasNext ?? false;
        let pgHtml = '';
        if (offset > 0) pgHtml += `<button class="btn btn-outline btn-sm" onclick="loadOrders(${offset - ORDERS_LIMIT})">이전</button>`;
        pgHtml += `<span class="text-muted">${offset + 1} - ${Math.min(offset + ORDERS_LIMIT, total)} / ${total}</span>`;
        if (hasNext) pgHtml += `<button class="btn btn-outline btn-sm" onclick="loadOrders(${offset + ORDERS_LIMIT})">다음</button>`;
        document.getElementById('orderPagination').innerHTML = pgHtml;

        log(`주문 ${orders.length}건 조회 (총 ${total}건)`, 'success');
    } catch (e) {
        log(`주문 목록 조회 실패: ${e.message}`, 'error');
    }
}

// ============================================================
// 주문 상세 모달
// ============================================================

async function showOrderDetail(orderUid) {
    try {
        log(`주문 상세 조회: ${orderUid}`, 'info');
        const data = await api.orders.get(orderUid);
        const st = data.orderStatus;
        const stDisplay = data.orderStatusDisplay ?? '';

        let html = '';
        html += `<div class="detail-section">
            <h3>주문 정보</h3>
            <div class="detail-grid">
                <span class="detail-label">주문번호</span><span>${data.orderUid}</span>
                <span class="detail-label">상태</span><span><span class="status-badge status-${st}">${escHtml(stDisplay) || st}</span></span>
                <span class="detail-label">유형</span><span>${escHtml(data.orderType ?? '')}</span>
                <span class="detail-label">외부참조</span><span>${escHtml(data.externalRef ?? '-')}</span>
                <span class="detail-label">주문일시</span><span>${formatDate(data.orderedAt)}</span>
            </div>
        </div>`;

        const totalAmt = data.totalAmount ?? 0;
        const prodAmt = data.totalProductAmount ?? 0;
        const shipFee = data.totalShippingFee ?? 0;
        const packFee = data.totalPackagingFee ?? 0;
        const paidCredit = data.paidCreditAmount ?? 0;
        html += `<div class="detail-section">
            <h3>금액</h3>
            <div class="detail-grid">
                <span class="detail-label">상품 금액</span><span>${Number(prodAmt).toLocaleString()}원</span>
                <span class="detail-label">배송비</span><span>${Number(shipFee).toLocaleString()}원</span>
                ${packFee > 0 ? `<span class="detail-label">포장비</span><span>${Number(packFee).toLocaleString()}원</span>` : ''}
                <span class="detail-label">합계</span><span>${Number(totalAmt).toLocaleString()}원</span>
                <span class="detail-label">결제 금액</span><span style="font-weight:700">${Number(paidCredit).toLocaleString()}원 (VAT 포함)</span>
            </div>
        </div>`;

        html += `<div class="detail-section">
            <h3>배송지</h3>
            <div class="detail-grid">
                <span class="detail-label">수령인</span><span>${escHtml(data.recipientName ?? '')}</span>
                <span class="detail-label">전화번호</span><span>${escHtml(data.recipientPhone ?? '')}</span>
                <span class="detail-label">주소</span><span>[${escHtml(data.postalCode ?? '')}] ${escHtml(data.address1 ?? '')} ${escHtml(data.address2 ?? '')}</span>
                <span class="detail-label">배송메모</span><span>${escHtml(data.shippingMemo ?? '-')}</span>
                ${data.trackingNumber ? `<span class="detail-label">송장번호</span><span>${escHtml(data.trackingCarrier ?? '')} ${escHtml(data.trackingNumber)}</span>` : ''}
            </div>
        </div>`;

        if (st === 80 || st === 81) {
            html += `<div class="detail-section">
                <h3>취소 정보</h3>
                <div class="detail-grid">
                    <span class="detail-label">취소 사유</span><span>${escHtml(data.cancelReason ?? '')}</span>
                    <span class="detail-label">환불 금액</span><span>${Number(data.refundAmount ?? 0).toLocaleString()}원</span>
                    <span class="detail-label">취소 일시</span><span>${formatDate(data.cancelledAt)}</span>
                </div>
            </div>`;
        }

        const items = data.items ?? [];
        if (items.length) {
            html += `<div class="detail-section">
                <h3>주문 항목 (${items.length}건)</h3>
                <table><thead><tr><th>책</th><th>규격</th><th>페이지</th><th>수량</th><th>단가</th><th>금액</th><th>상태</th></tr></thead><tbody>`;
            items.forEach(it => {
                const itSt = it.itemStatus;
                const itStDisplay = it.itemStatusDisplay ?? '';
                html += `<tr>
                    <td>
                        <div style="font-weight:500">${escHtml(it.bookTitle ?? '')}</div>
                        <div class="text-muted">${it.bookUid ?? ''}</div>
                    </td>
                    <td class="text-muted">${escHtml(it.bookSpecName ?? '')}</td>
                    <td>${it.pageCount ?? 0}p</td>
                    <td>${it.quantity ?? 1}</td>
                    <td class="text-right nowrap">${Number(it.unitPrice ?? 0).toLocaleString()}</td>
                    <td class="text-right nowrap">${Number(it.itemAmount ?? 0).toLocaleString()}</td>
                    <td><span class="status-badge status-${itSt}">${escHtml(itStDisplay) || itSt}</span></td>
                </tr>`;
            });
            html += '</tbody></table></div>';
        }

        document.getElementById('orderDetailContent').innerHTML = html;

        let actionsHtml = '';
        if (st === 20 || st === 25) {
            actionsHtml += `<button class="btn btn-danger btn-sm" onclick="cancelOrder('${data.orderUid}')">주문 취소</button>`;
        }
        if (st < 60 && st !== 80 && st !== 81) {
            actionsHtml += `<button class="btn btn-outline btn-sm" onclick="editShipping('${data.orderUid}')">배송지 변경</button>`;
        }
        document.getElementById('orderDetailActions').innerHTML = actionsHtml;

        document.getElementById('orderModal').classList.add('active');
    } catch (e) {
        log(`주문 상세 조회 실패: ${e.message}`, 'error');
    }
}

function closeModal() {
    document.getElementById('orderModal').classList.remove('active');
}

// ============================================================
// 주문 취소
// ============================================================

async function cancelOrder(orderUid) {
    const reason = prompt('취소 사유를 입력하세요:');
    if (!reason) return;
    try {
        log(`주문 취소 중: ${orderUid}`, 'info');
        await api.orders.cancel(orderUid, reason);
        log(`주문 취소 완료: ${orderUid}`, 'success');
        closeModal();
        loadOrders(ordersOffset);
        refreshCredit();
    } catch (e) {
        log(`주문 취소 실패: ${e.message}`, 'error');
    }
}

// ============================================================
// 배송지 변경
// ============================================================

let _shippingEditOrderUid = null;

async function editShipping(orderUid) {
    _shippingEditOrderUid = orderUid;
    try {
        const data = await api.orders.get(orderUid);
        const el = document.getElementById('orderDetailContent');
        el.innerHTML += `
            <div class="detail-section" id="shippingEditForm" style="margin-top:16px; padding:16px; border:2px solid #667eea; border-radius:8px; background:#f8f9ff;">
                <h3>배송지 변경</h3>
                <div class="form-grid">
                    <div class="form-group"><label>수령인</label><input type="text" id="editShipName" value="${escAttr(data.recipientName ?? '')}" /></div>
                    <div class="form-group"><label>전화번호</label><input type="text" id="editShipPhone" value="${escAttr(data.recipientPhone ?? '')}" /></div>
                    <div class="form-group"><label>우편번호</label><input type="text" id="editShipPostal" value="${escAttr(data.postalCode ?? '')}" /></div>
                    <div class="form-group"><label>주소1</label><input type="text" id="editShipAddr1" value="${escAttr(data.address1 ?? '')}" /></div>
                    <div class="form-group"><label>주소2</label><input type="text" id="editShipAddr2" value="${escAttr(data.address2 ?? '')}" /></div>
                    <div class="form-group"><label>배송메모</label><input type="text" id="editShipMemo" value="${escAttr(data.shippingMemo ?? '')}" /></div>
                </div>
                <div style="margin-top:12px; display:flex; gap:8px;">
                    <button class="btn btn-primary btn-sm" onclick="saveShippingEdit()">저장</button>
                    <button class="btn btn-outline btn-sm" onclick="document.getElementById('shippingEditForm').remove()">취소</button>
                </div>
            </div>`;
        document.getElementById('editShipName').focus();
    } catch (e) {
        log(`배송지 조회 실패: ${e.message}`, 'error');
    }
}

async function saveShippingEdit() {
    const orderUid = _shippingEditOrderUid;
    if (!orderUid) return;

    const update = {
        recipientName: document.getElementById('editShipName').value.trim(),
        recipientPhone: document.getElementById('editShipPhone').value.trim(),
        postalCode: document.getElementById('editShipPostal').value.trim(),
        address1: document.getElementById('editShipAddr1').value.trim(),
        address2: document.getElementById('editShipAddr2').value.trim(),
        shippingMemo: document.getElementById('editShipMemo').value.trim(),
    };
    Object.keys(update).forEach(k => { if (!update[k]) delete update[k]; });
    if (!Object.keys(update).length) { alert('변경할 내용이 없습니다.'); return; }

    try {
        log(`배송지 변경 중: ${orderUid}`, 'info');
        await api.orders.updateShipping(orderUid, update);
        log(`배송지 변경 완료: ${orderUid}`, 'success');
        alert('배송지가 변경되었습니다.');
        showOrderDetail(orderUid);
    } catch (e) {
        log(`배송지 변경 실패: ${e.message}`, 'error');
        alert(`배송지 변경 실패: ${e.message}`);
    }
}

// ============================================================
// 로그
// ============================================================

function log(msg, level = 'info') {
    const area = document.getElementById('logArea');
    const ts = new Date().toLocaleTimeString('ko-KR');
    area.innerHTML += `<div class="log-${level}">[${ts}] ${escHtml(msg)}</div>`;
    area.scrollTop = area.scrollHeight;
}

function clearLog() {
    document.getElementById('logArea').innerHTML = '<div class="log-info">[로그 초기화됨]</div>';
}

// ============================================================
// 유틸
// ============================================================

function escHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(str) {
    return escHtml(str).replace(/'/g, '&#39;');
}

function formatDate(dt) {
    if (!dt) return '-';
    try {
        const d = new Date(dt);
        return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return dt; }
}

// ============================================================
// 키보드 단축키 & 부팅
// ============================================================

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

boot();
