/**
 * 파트너 주문 프로그램 — 메인 앱 로직
 */

// ============================================================
// 전역 상태
// ============================================================

let client = null;                // OrderClient 인스턴스
let selectedBooks = new Map();    // bookUid → { bookUid, title, pageCount, specName, quantity }
let ordersOffset = 0;
const ORDERS_LIMIT = 20;

// ── 환경별 API Key 저장 ──
const _envKeys = { live: '', sandbox: '' };

function getSelectedEnv() {
    return document.querySelector('input[name="apiEnv"]:checked')?.value || 'sandbox';
}

function onEnvChange() {
    const keyInput = document.getElementById('apiKeyInput');
    const prev = document.querySelector('input[name="apiEnv"]:not(:checked)')?.value;
    if (prev && keyInput) _envKeys[prev] = keyInput.value;
    const env = getSelectedEnv();
    if (keyInput) keyInput.value = _envKeys[env] || '';
    const warn = document.getElementById('envWarning');
    if (warn) {
        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        warn.style.display = (env === 'live' && isLocal) ? '' : 'none';
    }
    updateChargeSectionVisibility();
    if (keyInput.value.trim()) initClient();
}

// ============================================================
// 설정 & 초기화
// ============================================================

function applyConfig() {
    if (typeof APP_CONFIG === 'undefined') return;
    const keyInput = document.getElementById('apiKeyInput');

    if (APP_CONFIG.environments) {
        const envs = APP_CONFIG.environments;
        if (envs.live?.apiKey) _envKeys.live = envs.live.apiKey;
        if (envs.sandbox?.apiKey) _envKeys.sandbox = envs.sandbox.apiKey;
    } else if (APP_CONFIG.userApiKey) {
        _envKeys.live = APP_CONFIG.userApiKey;
        _envKeys.sandbox = APP_CONFIG.userApiKey;
    }
    const defaultEnv = APP_CONFIG.defaultEnv || 'sandbox';
    const radio = document.querySelector(`input[name="apiEnv"][value="${defaultEnv}"]`);
    if (radio) radio.checked = true;
    keyInput.value = _envKeys[getSelectedEnv()] || '';

    document.querySelectorAll('input[name="apiEnv"]').forEach(r => {
        r.addEventListener('change', onEnvChange);
    });

    // API Key가 있으면 자동 연결
    if (document.getElementById('apiKeyInput').value.trim()) {
        initClient();
    }
}

function getBaseUrl() {
    const env = getSelectedEnv();
    let resolved;
    if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.environments?.[env]?.url) {
        resolved = APP_CONFIG.environments[env].url;
    } else {
        const url = APP_CONFIG?.apiServers?.[0]?.url || 'https://api.sweetbook.com/v1';
        resolved = env === 'sandbox'
            ? url.replace('://dev-api.', '://dev-api-sandbox.').replace('://api.', '://api-sandbox.')
            : url;
    }
    // localhost에서는 CORS 우회를 위해 로컬 프록시 경유
    if (window.location.hostname === 'localhost') {
        return `/proxy/api/${resolved}`;
    }
    return resolved;
}

function initClient() {
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    const baseUrl = getBaseUrl();
    const useCookie = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.useCookie) || false;
    _envKeys[getSelectedEnv()] = apiKey;

    if (!apiKey && !useCookie) { log('API Key를 입력하세요.', 'error'); return; }

    try {
        client = new OrderClient({ apiKey: apiKey || undefined, baseUrl, useCookie });
        const connStatus = document.getElementById('connStatus');
        connStatus.textContent = '확인 중...';
        connStatus.style.color = '';
        updateChargeSectionVisibility();
        // API Key 유효성 확인 (충전금 조회로 검증)
        refreshCredit().then(() => {
            document.getElementById('connStatus').textContent = '연결됨';
            log(`API 연결: ${getBaseUrl()}`, 'success');
        }).catch(() => {});
    } catch (e) {
        log(`연결 실패: ${e.message}`, 'error');
    }
}

function ensureClient() {
    if (!client) {
        log('먼저 API Key를 입력하고 연결하세요.', 'error');
        return false;
    }
    return true;
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

// 환경 변경은 onEnvChange에서 처리

// ============================================================
// 충전금
// ============================================================

function isTestMode() {
    return getSelectedEnv() === 'sandbox';
}

function updateChargeSectionVisibility() {
    const sandboxSection = document.getElementById('sandboxChargeSection');
    const liveNotice = document.getElementById('liveChargeNotice');
    if (isTestMode()) {
        sandboxSection.classList.remove('hidden');
        liveNotice.classList.add('hidden');
    } else {
        sandboxSection.classList.add('hidden');
        liveNotice.classList.remove('hidden');
    }
}

async function doSandboxCharge() {
    if (!ensureClient()) return;
    const amount = parseInt(document.getElementById('chargeAmount').value) || 0;
    if (amount <= 0) { log('충전 금액을 입력하세요.', 'error'); return; }

    try {
        log(`Sandbox 충전 중... ${Number(amount).toLocaleString()}원`, 'info');
        const data = await client.credits.sandboxCharge(amount, '파트너 주문 프로그램 sandbox 충전');
        const balance = data.balance ?? data.Balance ?? 0;
        const badge = document.getElementById('creditBadge');
        badge.textContent = `잔액: ${Number(balance).toLocaleString()}원`;
        badge.classList.remove('hidden');
        document.getElementById('chargeBalanceResult').textContent = `→ 잔액: ${Number(balance).toLocaleString()}원`;
        log(`Sandbox 충전 완료! 잔액: ${Number(balance).toLocaleString()}원`, 'success');
    } catch (e) {
        log(`충전 실패: ${e.message}`, 'error');
    }
}

async function refreshCredit() {
    if (!ensureClient()) return;
    try {
        const data = await client.credits.getBalance();
        const balance = data.balance ?? data.Balance ?? 0;
        const balanceStr = `잔액: ${Number(balance).toLocaleString()}원`;
        const badge = document.getElementById('creditBadge');
        badge.textContent = balanceStr;
        badge.classList.remove('hidden');
        document.getElementById('chargeBalanceResult').textContent = balanceStr;
        log(`충전금 잔액: ${Number(balance).toLocaleString()}원`, 'info');
    } catch (e) {
        if (e.statusCode === 401) {
            client = null;
            const connStatus = document.getElementById('connStatus');
            connStatus.textContent = '연결 실패';
            connStatus.style.color = 'var(--danger)';
            document.getElementById('creditBadge').classList.add('hidden');
            document.getElementById('chargeBalanceResult').textContent = '';
            log('API Key가 유효하지 않습니다. 키를 확인하세요.', 'error');
        } else {
            log(`충전금 조회 실패: ${e.message}`, 'error');
        }
        throw e;
    }
}

async function loadCreditTx() {
    if (!ensureClient()) return;
    try {
        await refreshCredit();
        const data = await client.credits.transactions({ limit: 50 });
        const txList = data?.transactions ?? data?.Transactions ?? [];
        const pagination = data?.pagination ?? {};

        if (!txList.length) {
            document.getElementById('creditTxTable').innerHTML = '<div class="empty-state">거래 내역이 없습니다.</div>';
            return;
        }

        let html = `<table>
            <thead><tr><th>일시</th><th>사유</th><th>금액</th><th>잔액</th><th>메모</th></tr></thead>
            <tbody>`;
        txList.forEach(tx => {
            const amt = tx.amount ?? tx.Amount ?? 0;
            const bal = tx.balanceAfter ?? tx.BalanceAfter ?? 0;
            const reason = tx.reasonDisplay ?? tx.reason ?? tx.ReasonDisplay ?? '';
            const memo = tx.memo ?? tx.Memo ?? '';
            const dt = formatDate(tx.createdAt ?? tx.CreatedAt);
            const amtClass = amt >= 0 ? 'log-success' : 'log-error';
            html += `<tr>
                <td class="nowrap">${dt}</td>
                <td>${reason}</td>
                <td class="text-right ${amtClass}">${Number(amt).toLocaleString()}</td>
                <td class="text-right">${Number(bal).toLocaleString()}</td>
                <td class="text-muted">${escHtml(memo)}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        document.getElementById('creditTxTable').innerHTML = html;
        log(`충전금 거래 ${txList.length}건 조회 완료`, 'success');
    } catch (e) {
        log(`충전금 거래 조회 실패: ${e.message}`, 'error');
    }
}

// ============================================================
// 책 목록 (FINALIZED)
// ============================================================

async function loadBooks() {
    if (!ensureClient()) return;
    try {
        log('FINALIZED 책 목록 조회 중...', 'info');
        const data = await client.books.list({ status: 'finalized', limit: 100 });
        const books = data?.books ?? data?.Books ?? (Array.isArray(data) ? data : []);

        if (!books.length) {
            document.getElementById('bookList').innerHTML = '<div class="empty-state">FINALIZED 상태의 책이 없습니다.</div>';
            log('FINALIZED 책 없음', 'warn');
            return;
        }

        // 전체 선택
        books.forEach(b => {
            const uid = b.bookUid ?? b.BookUid;
            const title = b.title ?? b.Title ?? '(제목 없음)';
            const pages = b.pageCount ?? b.PageCount ?? 0;
            const spec = b.bookSpecName ?? b.specName ?? b.BookSpecName ?? '';
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
        const uid = b.bookUid ?? b.BookUid;
        const title = b.title ?? b.Title ?? '(제목 없음)';
        const pages = b.pageCount ?? b.PageCount ?? 0;
        const spec = b.bookSpecName ?? b.specName ?? b.BookSpecName ?? '';
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
    if (selectedBooks.has(uid)) {
        selectedBooks.get(uid).quantity = qty;
    }
}

function addBookDirect() {
    const input = document.getElementById('bookUidDirect');
    const uid = input.value.trim();
    if (!uid) return;

    if (selectedBooks.has(uid)) {
        log(`이미 추가된 책: ${uid}`, 'warn');
        return;
    }

    selectedBooks.set(uid, { bookUid: uid, title: uid, pageCount: 0, specName: '', quantity: 1 });
    input.value = '';

    // 목록에 추가 렌더
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
    selectedBooks.forEach(b => {
        items.push({ bookUid: b.bookUid, quantity: b.quantity });
    });
    return items;
}

function getShipping() {
    return {
        recipientName: document.getElementById('shipName').value.trim(),
        recipientPhone: document.getElementById('shipPhone').value.trim(),
        postalCode: document.getElementById('shipPostal').value.trim(),
        address1: document.getElementById('shipAddr1').value.trim(),
        address2: document.getElementById('shipAddr2').value.trim() || undefined,
        memo: document.getElementById('shipMemo').value.trim() || undefined,
    };
}

function validateOrder() {
    const items = getSelectedItems();
    if (!items.length) { log('주문할 책을 선택하세요.', 'error'); return false; }

    const ship = getShipping();
    if (!ship.recipientName) { log('수령인을 입력하세요.', 'error'); return false; }
    if (!ship.recipientPhone) { log('전화번호를 입력하세요.', 'error'); return false; }
    if (!ship.postalCode) { log('우편번호를 입력하세요.', 'error'); return false; }
    if (!ship.address1) { log('주소를 입력하세요.', 'error'); return false; }
    return true;
}

// ============================================================
// 견적 조회
// ============================================================

async function doEstimate() {
    if (!ensureClient()) return;
    const items = getSelectedItems();
    if (!items.length) { log('견적할 책을 선택하세요.', 'error'); return; }

    try {
        log(`견적 조회 중... (${items.length}권)`, 'info');
        const data = await client.orders.estimate({ items });

        const el = document.getElementById('estimateResult');
        el.classList.remove('hidden');

        let itemsHtml = '';
        (data.items || []).forEach(it => {
            const uid = it.bookUid ?? it.BookUid ?? '';
            const pages = it.pageCount ?? it.PageCount ?? 0;
            const qty = it.quantity ?? it.Quantity ?? 1;
            const unit = it.unitPrice ?? it.UnitPrice ?? 0;
            const amt = it.itemAmount ?? it.ItemAmount ?? 0;
            const title = selectedBooks.get(uid)?.title || uid;
            itemsHtml += `<div class="estimate-row">
                <span>${escHtml(title)} (${pages}p x ${qty})</span>
                <span>${Number(unit).toLocaleString()} x ${qty} = ${Number(amt).toLocaleString()}원</span>
            </div>`;
        });

        const productAmt = data.productAmount ?? data.ProductAmount ?? 0;
        const shipFee = data.shippingFee ?? data.ShippingFee ?? 0;
        const packFee = data.packagingFee ?? data.PackagingFee ?? 0;
        const totalAmt = data.totalAmount ?? data.TotalAmount ?? 0;
        const paidCredit = data.paidCreditAmount ?? data.PaidCreditAmount ?? 0;
        const creditBal = data.creditBalance ?? data.CreditBalance ?? 0;
        const sufficient = data.creditSufficient ?? data.CreditSufficient ?? false;

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
    if (!ensureClient()) return;
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

        const data = await client.orders.create(payload);

        const orderUid = data.orderUid ?? data.OrderUid ?? '';
        const totalAmt = data.totalAmount ?? data.TotalAmount ?? 0;
        const paidCredit = data.paidCreditAmount ?? data.PaidCreditAmount ?? 0;
        const balAfter = data.creditBalanceAfter ?? data.CreditBalanceAfter;

        log(`주문 생성 완료! orderUid=${orderUid}, 결제=${Number(paidCredit).toLocaleString()}원`, 'success');

        if (balAfter !== undefined && balAfter !== null) {
            const badge = document.getElementById('creditBadge');
            badge.textContent = `잔액: ${Number(balAfter).toLocaleString()}원`;
            badge.classList.remove('hidden');
        }

        // 선택 초기화
        selectedBooks.clear();
        document.getElementById('bookList').innerHTML = '<div class="empty-state">주문이 완료되었습니다. 주문 내역 탭에서 확인하세요.</div>';
        document.getElementById('estimateResult').classList.add('hidden');

        // 주문 내역 탭으로 이동
        document.querySelector('[data-tab="tab-orders"]').click();
        loadOrders();

    } catch (e) {
        if (e.statusCode === 402) {
            log(`잔액 부족! ${e.message}`, 'error');
        } else {
            log(`주문 실패: ${e.message}`, 'error');
        }
    } finally {
        btn.disabled = false;
        btn.textContent = '주문하기';
    }
}

// ============================================================
// 주문 목록
// ============================================================

async function loadOrders(offset = 0) {
    if (!ensureClient()) return;
    ordersOffset = offset;

    const statusFilter = document.getElementById('orderStatusFilter').value;
    const params = { limit: ORDERS_LIMIT, offset };
    if (statusFilter) params.status = parseInt(statusFilter);

    try {
        log('주문 목록 조회 중...', 'info');
        const data = await client.orders.list(params);
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
            const uid = o.orderUid ?? o.OrderUid;
            const st = o.orderStatus ?? o.OrderStatus;
            const stDisplay = o.orderStatusDisplay ?? o.OrderStatusDisplay ?? '';
            const itemCnt = o.itemCount ?? o.ItemCount ?? 0;
            const total = o.totalAmount ?? o.TotalAmount ?? 0;
            const paid = o.paidCreditAmount ?? o.PaidCreditAmount ?? 0;
            const recipient = o.recipientName ?? o.RecipientName ?? '';
            const dt = formatDate(o.orderedAt ?? o.OrderedAt);
            const extRef = o.externalRef ?? o.ExternalRef ?? '';

            html += `<tr style="cursor:pointer" onclick="showOrderDetail('${uid}')">
                <td>
                    <div style="font-weight:600">${uid}</div>
                    ${extRef ? `<div class="text-muted">${escHtml(extRef)}</div>` : ''}
                </td>
                <td><span class="status-badge status-${st}">${stDisplay || st}</span></td>
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

        // 페이지네이션
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
    if (!ensureClient()) return;

    try {
        log(`주문 상세 조회: ${orderUid}`, 'info');
        const data = await client.orders.get(orderUid);

        const st = data.orderStatus ?? data.OrderStatus;
        const stDisplay = data.orderStatusDisplay ?? data.OrderStatusDisplay ?? '';

        let html = '';

        // 주문 기본정보
        html += `<div class="detail-section">
            <h3>주문 정보</h3>
            <div class="detail-grid">
                <span class="detail-label">주문번호</span><span>${data.orderUid ?? data.OrderUid}</span>
                <span class="detail-label">상태</span><span><span class="status-badge status-${st}">${stDisplay || st}</span></span>
                <span class="detail-label">유형</span><span>${data.orderType ?? data.OrderType ?? ''}</span>
                <span class="detail-label">외부참조</span><span>${data.externalRef ?? data.ExternalRef ?? '-'}</span>
                <span class="detail-label">주문일시</span><span>${formatDate(data.orderedAt ?? data.OrderedAt)}</span>
            </div>
        </div>`;

        // 금액
        const totalAmt = data.totalAmount ?? data.TotalAmount ?? 0;
        const prodAmt = data.totalProductAmount ?? data.TotalProductAmount ?? 0;
        const shipFee = data.totalShippingFee ?? data.TotalShippingFee ?? 0;
        const packFee = data.totalPackagingFee ?? data.TotalPackagingFee ?? 0;
        const paidCredit = data.paidCreditAmount ?? data.PaidCreditAmount ?? 0;

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

        // 배송지
        html += `<div class="detail-section">
            <h3>배송지</h3>
            <div class="detail-grid">
                <span class="detail-label">수령인</span><span>${escHtml(data.recipientName ?? data.RecipientName ?? '')}</span>
                <span class="detail-label">전화번호</span><span>${escHtml(data.recipientPhone ?? data.RecipientPhone ?? '')}</span>
                <span class="detail-label">주소</span><span>[${data.postalCode ?? data.PostalCode ?? ''}] ${escHtml(data.address1 ?? data.Address1 ?? '')} ${escHtml(data.address2 ?? data.Address2 ?? '')}</span>
                <span class="detail-label">배송메모</span><span>${escHtml(data.shippingMemo ?? data.ShippingMemo ?? '-')}</span>
                ${(data.trackingNumber ?? data.TrackingNumber) ? `<span class="detail-label">송장번호</span><span>${data.trackingCarrier ?? data.TrackingCarrier ?? ''} ${data.trackingNumber ?? data.TrackingNumber ?? ''}</span>` : ''}
            </div>
        </div>`;

        // 취소 정보
        if (st === 80 || st === 81) {
            html += `<div class="detail-section">
                <h3>취소 정보</h3>
                <div class="detail-grid">
                    <span class="detail-label">취소 사유</span><span>${escHtml(data.cancelReason ?? data.CancelReason ?? '')}</span>
                    <span class="detail-label">환불 금액</span><span>${Number(data.refundAmount ?? data.RefundAmount ?? 0).toLocaleString()}원</span>
                    <span class="detail-label">취소 일시</span><span>${formatDate(data.cancelledAt ?? data.CancelledAt)}</span>
                </div>
            </div>`;
        }

        // 항목
        const items = data.items ?? data.Items ?? [];
        if (items.length) {
            html += `<div class="detail-section">
                <h3>주문 항목 (${items.length}건)</h3>
                <table><thead><tr><th>책</th><th>규격</th><th>페이지</th><th>수량</th><th>단가</th><th>금액</th><th>상태</th></tr></thead><tbody>`;
            items.forEach(it => {
                const itSt = it.itemStatus ?? it.ItemStatus;
                const itStDisplay = it.itemStatusDisplay ?? it.ItemStatusDisplay ?? '';
                html += `<tr>
                    <td>
                        <div style="font-weight:500">${escHtml(it.bookTitle ?? it.BookTitle ?? '')}</div>
                        <div class="text-muted">${it.bookUid ?? it.BookUid ?? ''}</div>
                    </td>
                    <td class="text-muted">${escHtml(it.bookSpecName ?? it.BookSpecName ?? '')}</td>
                    <td>${it.pageCount ?? it.PageCount ?? 0}p</td>
                    <td>${it.quantity ?? it.Quantity ?? 1}</td>
                    <td class="text-right nowrap">${Number(it.unitPrice ?? it.UnitPrice ?? 0).toLocaleString()}</td>
                    <td class="text-right nowrap">${Number(it.itemAmount ?? it.ItemAmount ?? 0).toLocaleString()}</td>
                    <td><span class="status-badge status-${itSt}">${itStDisplay || itSt}</span></td>
                </tr>`;
            });
            html += '</tbody></table></div>';
        }

        document.getElementById('orderDetailContent').innerHTML = html;

        // 액션 버튼
        let actionsHtml = '';
        if (st === 20 || st === 25) {
            actionsHtml += `<button class="btn btn-danger btn-sm" onclick="cancelOrder('${data.orderUid ?? data.OrderUid}')">주문 취소</button>`;
        }
        if (st < 60 && st !== 80 && st !== 81) {
            actionsHtml += `<button class="btn btn-outline btn-sm" onclick="editShipping('${data.orderUid ?? data.OrderUid}')">배송지 변경</button>`;
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
        await client.orders.cancel(orderUid, reason);
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

async function editShipping(orderUid) {
    const name = prompt('수령인 (변경 없으면 비워두세요):');
    const phone = prompt('전화번호 (변경 없으면 비워두세요):');
    const postal = prompt('우편번호 (변경 없으면 비워두세요):');
    const addr1 = prompt('주소1 (변경 없으면 비워두세요):');
    const addr2 = prompt('주소2 (변경 없으면 비워두세요):');

    const update = {};
    if (name) update.recipientName = name;
    if (phone) update.recipientPhone = phone;
    if (postal) update.postalCode = postal;
    if (addr1) update.address1 = addr1;
    if (addr2) update.address2 = addr2;

    if (!Object.keys(update).length) {
        log('변경할 내용이 없습니다.', 'warn');
        return;
    }

    try {
        log(`배송지 변경 중: ${orderUid}`, 'info');
        await client.orders.updateShipping(orderUid, update);
        log(`배송지 변경 완료: ${orderUid}`, 'success');
        closeModal();
        showOrderDetail(orderUid);
    } catch (e) {
        log(`배송지 변경 실패: ${e.message}`, 'error');
    }
}

// ============================================================
// 로그
// ============================================================

function log(msg, level = 'info') {
    const area = document.getElementById('logArea');
    const ts = new Date().toLocaleTimeString('ko-KR');
    const cls = `log-${level}`;
    area.innerHTML += `<div class="${cls}">[${ts}] ${escHtml(msg)}</div>`;
    area.scrollTop = area.scrollHeight;
}

function clearLog() {
    document.getElementById('logArea').innerHTML = '<div class="log-info">[로그 초기화됨]</div>';
}

// ============================================================
// 유틸
// ============================================================

function escHtml(str) {
    if (!str) return '';
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
// 키보드 단축키
// ============================================================

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});
