const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { verifyToken, checkRole } = require('../middleware/authMiddleware');

// POST /api/orders - Create order (Buyer)
router.post('/', verifyToken, orderController.createOrder);

// GET /api/orders/buyer - Get buyer's orders
router.get('/buyer', verifyToken, orderController.getBuyerOrders);

// GET /api/orders/farmer - Get farmer's orders
router.get('/farmer', verifyToken, checkRole('FARMER'), orderController.getFarmerOrders);

// PUT /api/orders/:id/accept - Accept order (Farmer)
router.put('/:id/accept', verifyToken, checkRole('FARMER'), orderController.acceptOrder);

// PUT /api/orders/:id/reject - Reject order (Farmer)
router.put('/:id/reject', verifyToken, checkRole('FARMER'), orderController.rejectOrder);

module.exports = router;
