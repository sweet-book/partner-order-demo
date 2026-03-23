/**
 * Sweetbook JavaScript SDK — Order
 * 파트너 주문용: Orders, Credits, Books(조회만)
 *
 * 의존: sweetbook-sdk-core.js (BaseClient, ResponseParser 등)
 *
 * Usage:
 *   const client = new OrderClient({ apiKey: 'your-api-key', baseUrl: 'https://api.sweetbook.com/v1' });
 *   const estimate = await client.orders.estimate({ items: [{ bookUid: '...', quantity: 1 }] });
 */

// ============================================================
// Books Client (조회 전용)
// ============================================================

class BooksClient extends BaseClient {
  /**
   * FINALIZED 상태 책 목록 조회
   * @param {Object} params - { status, limit, offset }
   */
  async list(params = {}) {
    const { status = 'finalized', limit = 100, offset = 0 } = params;
    const body = await this._get('/Books', { status, limit, offset });
    return new ResponseParser(body).getDict();
  }

  /**
   * 책 상세 조회
   * @param {string} bookUid
   */
  async get(bookUid) {
    const body = await this._get(`/Books/${bookUid}`);
    return new ResponseParser(body).getDict();
  }
}

// ============================================================
// Orders Client
// ============================================================

class OrdersClient extends BaseClient {
  /**
   * 가격 견적
   * @param {Object} data - { items: [{ bookUid, quantity }] }
   */
  async estimate(data) {
    this._requireParam(data?.items?.length, 'items');
    const body = await this._post('/orders/estimate', data);
    return new ResponseParser(body).getDict();
  }

  /**
   * 주문 생성
   * @param {Object} data - { items: [{ bookUid, quantity }], shipping: {...}, externalRef? }
   */
  async create(data) {
    this._requireParam(data?.items?.length, 'items');
    this._requireParam(data?.shipping?.recipientName, 'shipping.recipientName');
    const body = await this._post('/orders', data);
    return new ResponseParser(body).getDict();
  }

  /**
   * 주문 목록
   * @param {Object} params - { limit, offset, status, from, to }
   */
  async list(params = {}) {
    const { limit = 20, offset = 0, status, from, to } = params;
    const body = await this._get('/orders', { limit, offset, status, from, to });
    return new ResponseParser(body).getDict();
  }

  /**
   * 주문 상세
   * @param {string} orderUid
   */
  async get(orderUid) {
    this._requireParam(orderUid, 'orderUid');
    const body = await this._get(`/orders/${orderUid}`);
    return new ResponseParser(body).getDict();
  }

  /**
   * 주문 취소
   * @param {string} orderUid
   * @param {string} cancelReason
   */
  async cancel(orderUid, cancelReason) {
    this._requireParam(orderUid, 'orderUid');
    this._requireParam(cancelReason, 'cancelReason');
    const body = await this._post(`/orders/${orderUid}/cancel`, { cancelReason });
    return new ResponseParser(body).getDict();
  }

  /**
   * 배송지 변경
   * @param {string} orderUid
   * @param {Object} shippingData - { recipientName?, recipientPhone?, postalCode?, address1?, address2?, shippingMemo? }
   */
  async updateShipping(orderUid, shippingData) {
    const body = await this._patch(`/orders/${orderUid}/shipping`, shippingData);
    return new ResponseParser(body).getDict();
  }
}

// ============================================================
// Credits Client
// ============================================================

class CreditsClient extends BaseClient {
  /**
   * 충전금 잔액 조회
   */
  async getBalance() {
    const body = await this._get('/credits');
    return new ResponseParser(body).getDict();
  }

  /**
   * 거래 내역
   * @param {Object} params - { limit, offset, from, to }
   */
  async transactions(params = {}) {
    const { limit = 20, offset = 0, from, to } = params;
    const body = await this._get('/credits/transactions', { limit, offset, from, to });
    return new ResponseParser(body).getDict();
  }

  /**
   * Sandbox 충전
   * @param {number} amount - 충전 금액
   * @param {string} [memo] - 메모
   */
  async sandboxCharge(amount, memo) {
    const body = await this._post('/credits/sandbox/charge', { amount, memo });
    return new ResponseParser(body).getDict();
  }
}

// ============================================================
// Order Client (메인)
// ============================================================

class OrderClient {
  /**
   * @param {Object} options
   * @param {string} options.apiKey - API key
   * @param {string} [options.baseUrl] - API base URL
   * @param {string} [options.environment] - 'sandbox' for sandbox server, 'live' for production (default)
   * @param {boolean} [options.useCookie] - cookie 인증 사용
   * @param {number} [options.timeout] - Request timeout in ms (default: 60000)
   */
  constructor(options = {}) {
    if (!options.apiKey && !options.useCookie) {
      throw new SweetbookValidationError('apiKey is required (or set useCookie: true)', 'apiKey');
    }
    this._apiKey = options.apiKey || null;
    this._adminApiKey = null;
    this._useCookie = options.useCookie || false;
    this._timeout = options.timeout || 60000;

    if (options.baseUrl) {
      this._baseUrl = options.baseUrl;
    } else if (options.environment === 'sandbox') {
      this._baseUrl = 'https://api-sandbox.sweetbook.com/v1';
    } else {
      this._baseUrl = 'https://api.sweetbook.com/v1';
    }

    this.books = new BooksClient(this);
    this.orders = new OrdersClient(this);
    this.credits = new CreditsClient(this);
  }
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OrderClient, BooksClient, OrdersClient, CreditsClient };
}
