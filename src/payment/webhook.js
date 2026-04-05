// src/payment/webhook.js
// Webhook Server for Mayar.id Payment & Bot

const express = require('express');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { processWebhookPayment, verifyWebhookSignature } = require('../services/payment');

const createWebhookRouter = (bot) => {
  const router = express.Router();

  // =============================================
  // MAYAR.ID PAYMENT WEBHOOK
  // POST /webhook/mayar
  // =============================================
  router.post('/mayar', express.json(), async (req, res) => {
    try {
      logger.info(`Mayar webhook received: ${JSON.stringify(req.body)}`);

      // Verify webhook signature
      const signature = req.headers['x-mayar-signature'] || req.headers['x-signature'] || '';
      
      if (process.env.MAYAR_WEBHOOK_SECRET) {
        const isValid = verifyWebhookSignature(req.body, signature);
        if (!isValid) {
          logger.warn('Invalid Mayar webhook signature');
          return res.status(401).json({ success: false, message: 'Invalid signature' });
        }
      }

      const result = await processWebhookPayment(req.body);

      if (result.success) {
        // Send notification to user via bot
        try {
          const { formatCurrency } = require('../utils/helpers');
          await bot.telegram.sendMessage(
            result.userId,
            `✅ *Deposit Berhasil!*\n\n💰 Nominal: *${formatCurrency(result.amount)}*\n📄 ID: \`${result.transactionId}\`\n\nSaldo Anda telah ditambahkan. Terima kasih!`,
            { parse_mode: 'Markdown' }
          );
        } catch (notifyErr) {
          logger.warn(`Could not notify user ${result.userId}: ${notifyErr.message}`);
        }

        return res.json({ success: true, message: 'Payment processed' });
      }

      return res.json({ success: false, reason: result.reason });
    } catch (err) {
      logger.error(`Mayar webhook error: ${err.message}`);
      return res.status(500).json({ success: false, message: 'Internal error' });
    }
  });

  // =============================================
  // VERIFICATION API CALLBACK WEBHOOK
  // POST /webhook/verification
  // =============================================
  router.post('/verification', express.json(), async (req, res) => {
    try {
      logger.info(`Verification callback: ${JSON.stringify(req.body)}`);
      
      const { order_id, code, status } = req.body;
      if (!order_id) return res.status(400).json({ success: false });

      const { OrderDB, UserDB } = require('../database/queries');
      const order = OrderDB.findById(order_id);
      
      if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

      if (status === 'success' && code) {
        OrderDB.update(order_id, {
          verification_code: code,
          code_fetched_at: new Date().toISOString(),
          status: 'completed'
        });

        // Update user stats
        const user = UserDB.findById(order.user_id);
        UserDB.update(order.user_id, {
          total_orders: (user?.total_orders || 0) + 1,
          total_spent: (user?.total_spent || 0) + order.price
        });

        // Notify user
        try {
          const { formatCurrency } = require('../utils/helpers');
          await bot.telegram.sendMessage(
            order.user_id,
            `🎉 *Kode Verifikasi Berhasil!*\n\n📦 Order: \`${order_id}\`\n🔐 Kode: \`${code}\`\n\n⚡ Segera gunakan sebelum kadaluarsa!`,
            { parse_mode: 'Markdown' }
          );
        } catch (err) { logger.warn(`Notify user error: ${err.message}`); }
      } else if (status === 'failed') {
        OrderDB.update(order_id, { status: 'failed' });
        
        // Refund
        UserDB.updateBalance(order.user_id, order.price);
        
        try {
          const { formatCurrency } = require('../utils/helpers');
          await bot.telegram.sendMessage(
            order.user_id,
            `❌ *Verifikasi Gagal*\n\nOrder \`${order_id}\` gagal diproses.\nSaldo ${formatCurrency(order.price)} telah dikembalikan.`,
            { parse_mode: 'Markdown' }
          );
        } catch (err) {}
      }

      res.json({ success: true });
    } catch (err) {
      logger.error(`Verification webhook error: ${err.message}`);
      res.status(500).json({ success: false });
    }
  });

  // =============================================
  // HEALTH CHECK
  // GET /webhook/health
  // =============================================
  router.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  return router;
};

module.exports = { createWebhookRouter };
