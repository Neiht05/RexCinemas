const crypto = require('crypto');
const Stripe = require('stripe');

const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const paymentConfig = {
    momo: {
        partnerCode: process.env.MOMO_PARTNER_CODE || '',
        accessKey: process.env.MOMO_ACCESS_KEY || '',
        secretKey: process.env.MOMO_SECRET_KEY || '',
        endpoint: process.env.MOMO_ENDPOINT || 'https://test-payment.momo.vn/v2/gateway/api/create',
        redirectUrl: process.env.MOMO_REDIRECT_URL || `${APP_BASE_URL}/api/payments/momo/return`,
        ipnUrl: process.env.MOMO_IPN_URL || `${APP_BASE_URL}/api/payments/momo/ipn`,
        requestType: process.env.MOMO_REQUEST_TYPE || 'captureWallet'
    },
    vnpay: {
        tmnCode: process.env.VNPAY_TMN_CODE || '',
        hashSecret: process.env.VNPAY_HASH_SECRET || '',
        payUrl: process.env.VNPAY_PAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
        returnUrl: process.env.VNPAY_RETURN_URL || `${APP_BASE_URL}/api/payments/vnpay/return`,
        ipnUrl: process.env.VNPAY_IPN_URL || `${APP_BASE_URL}/api/payments/vnpay/ipn`,
        locale: process.env.VNPAY_LOCALE || 'vn',
        currency: process.env.VNPAY_CURRENCY || 'VND'
    },
    vietqr: {
        bankId: process.env.VIETQR_BANK_ID || 'vietinbank',
        accountNo: process.env.VIETQR_ACCOUNT_NO || '101879989921',
        accountName: process.env.VIETQR_ACCOUNT_NAME || '',
        template: process.env.VIETQR_TEMPLATE || 'compact2',
        imageBase: process.env.VIETQR_IMAGE_BASE || 'https://img.vietqr.io/image'
    },
    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY || '',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
        successUrl: process.env.STRIPE_SUCCESS_URL || `${APP_BASE_URL}/api/payments/stripe/return?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: process.env.STRIPE_CANCEL_URL || `${APP_BASE_URL}/payment-result.html?status=cancelled`
    }
};

let stripeClient = null;

function getStripeClient() {
    if (!paymentConfig.stripe.secretKey) {
        throw new Error('Stripe chưa được cấu hình. Thiếu STRIPE_SECRET_KEY.');
    }
    if (!stripeClient) {
        stripeClient = new Stripe(paymentConfig.stripe.secretKey);
    }
    return stripeClient;
}

function ensureProviderConfigured(provider) {
    switch (provider) {
        case 'momo':
            if (!paymentConfig.momo.partnerCode || !paymentConfig.momo.accessKey || !paymentConfig.momo.secretKey) {
                throw new Error('MoMo chưa được cấu hình đầy đủ.');
            }
            return;
        case 'vnpay':
            if (!paymentConfig.vnpay.tmnCode || !paymentConfig.vnpay.hashSecret) {
                throw new Error('VNPAY chưa được cấu hình đầy đủ.');
            }
            return;
        case 'vietqr':
            if (!paymentConfig.vietqr.bankId || !paymentConfig.vietqr.accountNo) {
                throw new Error('VietQR chưa được cấu hình đầy đủ.');
            }
            return;
        case 'stripe':
            getStripeClient();
            return;
        default:
            throw new Error('Phương thức thanh toán không được hỗ trợ.');
    }
}

function sortObjectByKey(obj) {
    return Object.keys(obj)
        .sort()
        .reduce((result, key) => {
            result[key] = obj[key];
            return result;
        }, {});
}

function vnpEncode(value) {
    return encodeURIComponent(String(value))
        .replace(/[!'()*~]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
        .replace(/%20/g, '+');
}

function buildVnpHashData(params) {
    return Object.keys(params)
        .sort()
        .map((key) => `${vnpEncode(key)}=${vnpEncode(params[key])}`)
        .join('&');
}

function buildVnpQueryString(params) {
    return Object.keys(params)
        .sort()
        .map((key) => `${vnpEncode(key)}=${vnpEncode(params[key])}`)
        .join('&');
}

function buildVietQrImageUrl({ amount, addInfo }) {
    ensureProviderConfigured('vietqr');

    const params = new URLSearchParams();
    if (Number.isFinite(Number(amount)) && Number(amount) > 0) {
        params.set('amount', String(Math.round(Number(amount))));
    }
    if (addInfo) {
        params.set('addInfo', String(addInfo));
    }
    if (paymentConfig.vietqr.accountName) {
        params.set('accountName', paymentConfig.vietqr.accountName);
    }

    const query = params.toString();
    return `${paymentConfig.vietqr.imageBase}/${paymentConfig.vietqr.bankId}-${paymentConfig.vietqr.accountNo}-${paymentConfig.vietqr.template}.png${query ? `?${query}` : ''}`;
}

async function createMoMoPayment({ booking, amount, orderInfo, returnUrl, notifyUrl }) {
    ensureProviderConfigured('momo');

    const requestId = booking.payment_reference;
    const orderId = booking.payment_reference;
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
        requestType: paymentConfig.momo.requestType,
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
    if (!response.ok || Number(data.resultCode) !== 0 || !data.payUrl) {
        throw new Error(data.message || 'Không thể tạo thanh toán MoMo.');
    }

    return {
        checkoutUrl: data.payUrl,
        provider: 'momo',
        sessionId: data.requestId
    };
}

function createVnpayPayment({ booking, amount, orderInfo, clientIp }) {
    ensureProviderConfigured('vnpay');

    const createDate = new Date();
    const formatDate = (date) => {
        const yyyy = date.getFullYear();
        const MM = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const HH = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        const ss = String(date.getSeconds()).padStart(2, '0');
        return `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
    };

    const expiresDate = new Date(createDate.getTime() + 15 * 60 * 1000);
    const params = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: paymentConfig.vnpay.tmnCode,
        vnp_Locale: paymentConfig.vnpay.locale,
        vnp_CurrCode: paymentConfig.vnpay.currency,
        vnp_TxnRef: booking.payment_reference,
        vnp_OrderInfo: orderInfo,
        vnp_OrderType: 'other',
        vnp_Amount: String(Math.round(amount) * 100),
        vnp_ReturnUrl: paymentConfig.vnpay.returnUrl,
        vnp_IpAddr: clientIp || '127.0.0.1',
        vnp_CreateDate: formatDate(createDate),
        vnp_ExpireDate: formatDate(expiresDate)
    };

    const sorted = sortObjectByKey(params);
    const signData = buildVnpHashData(sorted);
    const secureHash = crypto
        .createHmac('sha512', paymentConfig.vnpay.hashSecret)
        .update(Buffer.from(signData, 'utf-8'))
        .digest('hex');

    const query = buildVnpQueryString({ ...sorted, vnp_SecureHash: secureHash });
    return {
        checkoutUrl: `${paymentConfig.vnpay.payUrl}?${query}`,
        provider: 'vnpay',
        sessionId: booking.payment_reference
    };
}

function createVietQrPayment({ booking, amount }) {
    ensureProviderConfigured('vietqr');

    const qrUrl = buildVietQrImageUrl({
        amount,
        addInfo: booking.payment_reference
    });

    return {
        checkoutUrl: `${APP_BASE_URL}/payment-result.html?booking=${encodeURIComponent(booking.booking_code)}`,
        provider: 'vietqr',
        sessionId: booking.payment_reference,
        qrUrl
    };
}

async function createStripePayment({ booking, amount, orderInfo }) {
    ensureProviderConfigured('stripe');
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        success_url: `${paymentConfig.stripe.successUrl}&booking_code=${encodeURIComponent(booking.booking_code)}`,
        cancel_url: `${paymentConfig.stripe.cancelUrl}${paymentConfig.stripe.cancelUrl.includes('?') ? '&' : '?'}booking=${encodeURIComponent(booking.booking_code)}`,
        client_reference_id: booking.booking_code,
        metadata: {
            bookingCode: booking.booking_code,
            paymentReference: booking.payment_reference
        },
        line_items: [
            {
                quantity: 1,
                price_data: {
                    currency: 'vnd',
                    product_data: {
                        name: orderInfo
                    },
                    unit_amount: Math.round(amount)
                }
            }
        ]
    });

    return {
        checkoutUrl: session.url,
        provider: 'stripe',
        sessionId: session.id
    };
}

function verifyVnpayReturn(query) {
    const payload = Object.keys(query || {})
        .filter((key) => key.startsWith('vnp_'))
        .reduce((result, key) => {
            result[key] = query[key];
            return result;
        }, {});
    const secureHash = payload.vnp_SecureHash;
    delete payload.vnp_SecureHash;
    delete payload.vnp_SecureHashType;

    const sorted = sortObjectByKey(payload);
    const signData = buildVnpHashData(sorted);
    const expected = crypto
        .createHmac('sha512', paymentConfig.vnpay.hashSecret)
        .update(Buffer.from(signData, 'utf-8'))
        .digest('hex');

    return {
        isValid: secureHash === expected,
        isSuccess: payload.vnp_ResponseCode === '00' && payload.vnp_TransactionStatus === '00',
        reference: payload.vnp_TxnRef,
        transactionId: payload.vnp_TransactionNo || '',
        payload
    };
}

function verifyMoMoSignature(body) {
    const rawSignature =
        `accessKey=${paymentConfig.momo.accessKey}` +
        `&amount=${body.amount}` +
        `&extraData=${body.extraData || ''}` +
        `&message=${body.message}` +
        `&orderId=${body.orderId}` +
        `&orderInfo=${body.orderInfo}` +
        `&orderType=${body.orderType || ''}` +
        `&partnerCode=${body.partnerCode}` +
        `&payType=${body.payType || ''}` +
        `&requestId=${body.requestId}` +
        `&responseTime=${body.responseTime}` +
        `&resultCode=${body.resultCode}` +
        `&transId=${body.transId || ''}`;

    const expected = crypto
        .createHmac('sha256', paymentConfig.momo.secretKey)
        .update(rawSignature)
        .digest('hex');

    return {
        isValid: expected === body.signature,
        isSuccess: Number(body.resultCode) === 0,
        reference: body.orderId,
        transactionId: body.transId ? String(body.transId) : '',
        payload: body
    };
}

async function retrieveStripeSession(sessionId) {
    const stripe = getStripeClient();
    return stripe.checkout.sessions.retrieve(sessionId);
}

module.exports = {
    APP_BASE_URL,
    paymentConfig,
    ensureProviderConfigured,
    createMoMoPayment,
    createVnpayPayment,
    createVietQrPayment,
    createStripePayment,
    verifyVnpayReturn,
    verifyMoMoSignature,
    retrieveStripeSession,
    getStripeClient,
    buildVietQrImageUrl
};
