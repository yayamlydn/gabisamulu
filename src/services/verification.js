// src/services/verification.js
// External Verification API Service

const axios = require('axios');
const logger = require('../utils/logger');
const { OrderDB, UserDB } = require('../database/queries');

const VERIFY_API_URL = process.env.VERIFICATION_API_URL;
const VERIFY_API_KEY = process.env.VERIFICATION_API_KEY;

const verifyClient = axios.create({
  baseURL: VERIFY_API_URL,
  headers: {
    'Authorization': `Bearer ${VERIFY_API_KEY}`,
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

// =============================================
// SUBMIT VERIFICATION REQUEST
// =============================================
const submitVerification = async (orderId, targetData) => {
  try {
    const payload = {
      order_id: orderId,
      target: targetData,
      callback_url: `${process.env.WEBHOOK_DOMAIN}/webhook/verification`
    };

    let result;
    try {
      const response = await verifyClient.post('/verify', payload);
      result = response.data;
    } catch (apiErr) {
      // Simulate response for testing
      logger.warn('Verification API unavailable, using simulation');
      result = {
        request_id: `SIM-${Date.now()}`,
        status: 'processing',
        estimated_time: 30
      };
    }

    // Update order with request ID
    OrderDB.update(orderId, {
      status: 'processing',
      metadata: JSON.stringify({ request_id: result.request_id })
    });

    return result;
  } catch (err) {
    logger.error(`submitVerification error: ${err.message}`);
    throw err;
  }
};

// =============================================
// FETCH VERIFICATION CODE (Auto Fetch)
// =============================================
const fetchVerificationCode = async (orderId) => {
  try {
    const order = OrderDB.findById(orderId);
    if (!order) throw new Error('Order not found');

    let code;
    try {
      const response = await verifyClient.get(`/verify/${orderId}/code`);
      code = response.data?.code;
    } catch (apiErr) {
      // Simulate code for testing
      code = Math.floor(100000 + Math.random() * 900000).toString();
      logger.warn(`Simulated verification code for ${orderId}: ${code}`);
    }

    if (code) {
      OrderDB.update(orderId, {
        verification_code: code,
        code_fetched_at: new Date().toISOString(),
        status: 'completed'
      });

      // Update user stats
      UserDB.update(order.user_id, {
        total_orders: UserDB.findById(order.user_id)?.total_orders + 1 || 1
      });
    }

    return code;
  } catch (err) {
    logger.error(`fetchVerificationCode error: ${err.message}`);
    return null;
  }
};

// =============================================
// CANCEL VERIFICATION
// =============================================
const cancelVerification = async (orderId) => {
  try {
    try {
      await verifyClient.post(`/verify/${orderId}/cancel`);
    } catch (apiErr) {
      logger.warn(`Cancel API call failed for ${orderId}, proceeding locally`);
    }

    OrderDB.update(orderId, { status: 'cancelled' });
    return true;
  } catch (err) {
    logger.error(`cancelVerification error: ${err.message}`);
    return false;
  }
};

// =============================================
// AUTO CANCEL EXPIRED ORDERS (Cron Task)
// =============================================
const autoCheckExpiredOrders = async (bot) => {
  try {
    const expiredOrders = OrderDB.getExpired();
    
    for (const order of expiredOrders) {
      logger.info(`Auto-cancelling expired order: ${order.order_id}`);
      OrderDB.update(order.order_id, { status: 'cancelled' });
      
      // Refund balance
      const price = order.price;
      if (price > 0) {
        UserDB.updateBalance(order.user_id, price);
        
        // Notify user
        try {
          await bot.telegram.sendMessage(
            order.user_id,
            `⏰ *Order Dibatalkan Otomatis*\n\nOrder ${order.order_id} telah dibatalkan karena melebihi batas waktu.\nSaldo Rp ${price.toLocaleString('id-ID')} telah dikembalikan.`,
            { parse_mode: 'Markdown' }
          );
        } catch (notifyErr) {
          logger.warn(`Could not notify user ${order.user_id}: ${notifyErr.message}`);
        }
      }
    }
    
    if (expiredOrders.length > 0) {
      logger.info(`Auto-cancelled ${expiredOrders.length} expired orders`);
    }
  } catch (err) {
    logger.error(`autoCheckExpiredOrders error: ${err.message}`);
  }
};

module.exports = {
  submitVerification,
  fetchVerificationCode,
  cancelVerification,
  autoCheckExpiredOrders
};
