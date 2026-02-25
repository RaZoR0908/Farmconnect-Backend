const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { verifyToken } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(verifyToken);

// Get wallet balance
router.get('/balance', walletController.getWalletBalance);

// Get wallet transactions
router.get('/transactions', walletController.getWalletTransactions);

// Add money to wallet
router.post('/add-money', walletController.addMoney);

module.exports = router;
