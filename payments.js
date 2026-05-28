const crypto = require('crypto');

const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const paymentConfig = {
    momo: {
        partnerCode: process.env.MOMO_PARTNER_CODE || '',
        accessKey: process.env.MOMO_ACCESS_KEY || '',
        secretKey: process.env.MOMO_SECRET_KEY || '',
        endpoint: process.env.MOMO_ENDPOINT || 'https://test-payment.momo.vn/v2/gateway/api/create',
        queryEndpoint: process.env.MOMO_QUERY_ENDPOINT || 'https://test-payment.momo.vn/v2/gateway/api/query',
        redirectUrl: process.env.MOMO_REDIRECT_URL || `${APP_BASE_URL}/api/payments/momo/return`,
        ipnUrl: process.env.MOMO_IPN_URL || `${APP_BASE_URL}/api/payments/momo/ipn`,
        requestType: process.env.MOMO_REQUEST_TYPE || 'captureWallet'
    }
};

function ensureProviderConfigured(provider) {
    if (provider !== 'momo') {
        throw new Error('Phương thức thanh toán không được hỗ trợ.');
    }
    if (!paymentConfig.momo.partnerCode || !paymentConfig.momo.accessKey || !paymentConfig.momo.secretKey) {
        throw new Error('MoMo chưa được cấu hình đầy đủ.');
    }
}

async function createMoMoPayment({ booking, amount, orderInfo, returnUrl, notifyUrl, requestType }) {
    ensureProviderConfigured('momo');

    const requestId = booking.payment_reference;
    const orderId = booking.payment_reference;
    const resolvedRequestType = String(requestType || paymentConfig.momo.requestType || 'captureWallet');
    const allowedRequestTypes = new Set(['captureWallet', 'payWithMethod', 'payWithATM']);
    if (!allowedRequestTypes.has(resolvedRequestType)) {
        throw new Error('Yeu cau thanh toan MoMo khong hop le.');
    }

    const payload = {
        partnerCode: paymentConfig.momo.partnerCode,
        partnerName: 'Rex Cinemas',
        storeId: 'RexCinemas',
        requestId,
        amount: String(Math.round(amount)),
        orderId,
        orderInfo,
        redirectUrl: returnUrl || paymentConfig.momo.redirectUrl,
        ipnUrl: notifyUrl || paymentConfig.momo.ipnUrl,
        lang: 'vi',
        requestType: resolvedRequestType,
        autoCapture: true,
        extraData: Buffer.from(JSON.stringify({ bookingCode: booking.booking_code })).toString('base64')
    };

    const rawSignature =
        `accessKey=${paymentConfig.momo.accessKey}` +
        `&amount=${payload.amount}` +
        `&extraData=${payload.extraData}` +
        `&ipnUrl=${payload.ipnUrl}` +
        `&orderId=${payload.orderId}` +
        `&orderInfo=${payload.orderInfo}` +
        `&partnerCode=${payload.partnerCode}` +
        `&redirectUrl=${payload.redirectUrl}` +
        `&requestId=${payload.requestId}` +
        `&requestType=${payload.requestType}`;

    payload.signature = crypto
        .createHmac('sha256', paymentConfig.momo.secretKey)
        .update(rawSignature)
        .digest('hex');

    const response = await fetch(paymentConfig.momo.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    const checkoutUrl = data.payUrl || data.deeplink || data.qrCodeUrl;
    if (!response.ok || Number(data.resultCode) !== 0 || !checkoutUrl) {
        throw new Error(data.message || 'Không thể tạo thanh toán MoMo.');
    }

    return {
        checkoutUrl,
        provider: 'momo',
        sessionId: data.requestId || requestId,
        deeplink: data.deeplink || null,
        qrCodeUrl: data.qrCodeUrl || null
    };
}

function normalizeMoMoCallbackPayload(input = {}) {
    const resultCode = input.resultCode ?? input.errorCode ?? '';
    return {
        amount: input.amount ?? '',
        extraData: input.extraData ?? '',
        message: input.message ?? input.localMessage ?? '',
        orderId: input.orderId ?? input.order_id ?? '',
        orderInfo: input.orderInfo ?? '',
        orderType: input.orderType ?? 'momo_wallet',
        partnerCode: input.partnerCode ?? '',
        payType: input.payType ?? '',
        requestId: input.requestId ?? '',
        responseTime: input.responseTime ?? '',
        resultCode: resultCode,
        transId: input.transId ?? ''
    };
}

function safeCompareHex(a, b) {
    const left = String(a || '').trim().toLowerCase();
    const right = String(b || '').trim().toLowerCase();
    if (!left || !right || left.length !== right.length) return false;
    if (left.length % 2 !== 0 || right.length % 2 !== 0) return false;
    if (!/^[0-9a-f]+$/.test(left) || !/^[0-9a-f]+$/.test(right)) return false;
    return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function verifyMoMoSignature(rawPayload) {
    ensureProviderConfigured('momo');

    const payload = normalizeMoMoCallbackPayload(rawPayload);
    const rawSignature =
        `accessKey=${paymentConfig.momo.accessKey}` +
        `&amount=${payload.amount}` +
        `&extraData=${payload.extraData}` +
        `&message=${payload.message}` +
        `&orderId=${payload.orderId}` +
        `&orderInfo=${payload.orderInfo}` +
        `&orderType=${payload.orderType}` +
        `&partnerCode=${payload.partnerCode}` +
        `&payType=${payload.payType}` +
        `&requestId=${payload.requestId}` +
        `&responseTime=${payload.responseTime}` +
        `&resultCode=${payload.resultCode}` +
        `&transId=${payload.transId}`;

    const expected = crypto
        .createHmac('sha256', paymentConfig.momo.secretKey)
        .update(rawSignature)
        .digest('hex');
    const resultCode = Number(payload.resultCode);

    return {
        isValid: safeCompareHex(expected, rawPayload?.signature),
        isSuccess: resultCode === 0 || resultCode === 9000,
        reference: payload.orderId,
        transactionId: payload.transId ? String(payload.transId) : '',
        payload
    };
}

async function queryMoMoTransaction({ orderId, requestId, lang = 'vi' }) {
    ensureProviderConfigured('momo');

    const resolvedRequestId = requestId || `QUERY-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const rawSignature =
        `accessKey=${paymentConfig.momo.accessKey}` +
        `&orderId=${orderId}` +
        `&partnerCode=${paymentConfig.momo.partnerCode}` +
        `&requestId=${resolvedRequestId}`;
    const signature = crypto
        .createHmac('sha256', paymentConfig.momo.secretKey)
        .update(rawSignature)
        .digest('hex');

    const payload = {
        partnerCode: paymentConfig.momo.partnerCode,
        requestId: resolvedRequestId,
        orderId,
        lang,
        signature
    };

    const response = await fetch(paymentConfig.momo.queryEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || 'Không thể truy vấn trạng thái MoMo.');
    }
    return data;
}

module.exports = {
    APP_BASE_URL,
    paymentConfig,
    ensureProviderConfigured,
    createMoMoPayment,
    verifyMoMoSignature,
    queryMoMoTransaction
};
