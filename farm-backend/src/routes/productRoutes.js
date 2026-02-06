const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { verifyToken, checkRole } = require('../middleware/authMiddleware');

// Public route - Get all products (with filters)
router.get('/', productController.getAllProducts);

// Public route - Get single product
router.get('/:id', productController.getProductById);

// Protected routes - Require authentication
router.post('/', verifyToken, checkRole('FARMER'), productController.createProduct);
router.put('/:id', verifyToken, checkRole('FARMER'), productController.updateProduct);
router.delete('/:id', verifyToken, checkRole('FARMER'), productController.deleteProduct);

module.exports = router;
