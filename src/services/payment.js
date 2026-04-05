// src/services/payment.js
// Mayar.id Payment Gateway Integration

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { TransactionDB, UserDB } = require('../database/queries');

const MAYAR_BASE_URL = process.env.MAYAR_BASE_URL || 'https://api.mayar.id/hl/v1';
const MAYAR_API_KEY = process.env.MAYAR_API_KEY;

// Create Axios instance for Mayar API
const mayarClient = axios.create({
  baseURL: MAYAR_BASE_URL,
  headers: {
    'Authorization': `Bearer ${MAYAR_API_KEY}`,
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

// =============================================
// CREATE PAYMENT LINK
// =============================================
const createPaymentLink = async (userId, amount, description) => {
  try {
    const user = UserDB.findById(userId);
    if (!user) throw new Error('User not found');

    const payload = {
      amount: amount,
      name: description || `Deposit Saldo - ${userId}`,
      description: `Deposit saldo untuk user ${user.username || userId}`,
      redirectUrl: `${process.env.WEBHOOK_DOMAIN}/payment/success`,
      metadata: {
        user_id: userId,
        type: 'deposit'
      }
    };

    // Use Mayar product if configured
    if (process.env.MAYAR_PRODUCT_ID) {
      const response = await mayarClient.post(`/payment-link/create`, payload);
      return response.data;
    } else {
      // Dynamic payment link
      const response = await mayarClient.post(`/payment-link`, payload);
      return response.data;
    }
  } catch (err) {
    logger.error(`createPaymentLink error: ${err.response?.data || err.message}`);
    throw err;
  }
};

// =============================================
// CREATE INVOICE
// =============================================
const createInvoice = async (userId, amount, description) => {
  try {
    const user = UserDB.findById(userId);
    const txId = TransactionDB.create({
      user_id: userId,
      type: 'deposit',
      amount: amount,
      status: 'pending',
      description: description || 'Deposit Saldo'
    });

    // Call Mayar API to create payment
    const payload = {
      name: `Deposit - ${user?.username || userId}`,
      amount: amount,
      email: `${userId}@bot.user`,
      description: description || 'Deposit Saldo Bot',
      expired_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    let paymentData = null;
    let paymentUrl = null;

    try {
      const response = await mayarClient.post('/payment', payload);
      paymentData = response.data;
      paymentUrl = paymentData?.data?.payment_url || paymentData?.payment_url;

      // Update transaction with Mayar data
      TransactionDB.update(txId, {
        mayar_invoice_id: paymentData?.data?.id || paymentData?.id,
        mayar_payment_url: paymentUrl,
        metadata: JSON.stringify({ mayar: paymentData })
      });
    } catch (apiErr) {
      // Fallback: create dummy payment link for testing
      logger.warn('Mayar API unavailable, using fallback');
      paymentUrl = `https://mayar.id/pay/demo?amount=${amount}&ref=${txId}`;
      TransactionDB.update(txId, { mayar_payment_url: paymentUrl });
    }

    return {
      transactionId: txId,
      paymentUrl,
      amount,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
  } catch (err) {
    logger.error(`createInvoice error: ${err.message}`);
    throw err;
  }
};

// =============================================
// VERIFY WEBHOOK SIGNATURE
// =============================================
const verifyWebhookSignature = (payload, signature) => {
  try {
    const secret = process.env.MAYAR_WEBHOOK_SECRET || '';
    const computed = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    return computed === signature;
  } catch (err) {
    logger.error(`verifyWebhookSignature error: ${err.message}`);
    return false;
  }
};

// =============================================
// PROCESS WEBHOOK PAYMENT
// =============================================
const processWebhookPayment = async (data) => {
  try {
    logger.info(`Processing payment webhook: ${JSON.stringify(data)}`);
    
    const { id: mayarId, status, amount, metadata } = data;

    if (status !== 'paid' && status !== 'settlement') {
      logger.info(`Payment ${mayarId} status: ${status}, skipping`);
      return { success: false, reason: 'not_paid' };
    }

    // Find transaction by Mayar invoice ID
    const transaction = TransactionDB.findByMayarId(mayarId);
    if (!transaction) {
      logger.warn(`Transaction not found for Mayar ID: ${mayarId}`);
      return { success: false, reason: 'transaction_not_found' };
    }

    if (transaction.status === 'completed') {
      return { success: false, reason: 'already_processed' };
    }

    // Update transaction status
    TransactionDB.update(transaction.transaction_id, { status: 'completed' });

    // Credit user balance
    const userId = transaction.user_id;
    UserDB.updateBalance(userId, transaction.amount);

    logger.info(`Payment confirmed: ${transaction.transaction_id} - User ${userId} +${transaction.amount}`);

    return {
      success: true,
      transactionId: transaction.transaction_id,
      userId,
      amount: transaction.amount
    };
  } catch (err) {
    logger.error(`processWebhookPayment error: ${err.message}`);
    throw err;
  }
};

// =============================================
// CHECK PAYMENT STATUS
// =============================================
const checkPaymentStatus = async (mayarInvoiceId) => {
  try {
    const response = await mayarClient.get(`/payment/${mayarInvoiceId}`);
    return response.data;
  } catch (err) {
    logger.error(`checkPaymentStatus error: ${err.message}`);
    return null;
  }
};

module.exports = {
  createPaymentLink,
  createInvoice,
  verifyWebhookSignature,
  processWebhookPayment,
  checkPaymentStatus
};
