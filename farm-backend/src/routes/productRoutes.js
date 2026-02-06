const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { verifyToken, checkRole } = require('../middleware/authMiddleware');

// Public routes
router.get('/', productController.getAllProducts);

// Protected routes - Require authentication (specific routes BEFORE :id)
router.get('/farmer/my-products', verifyToken, checkRole('FARMER'), productController.getMyProducts);
router.post('/', verifyToken, checkRole('FARMER'), productController.createProduct);

// Public route with parameter (must come AFTER specific routes)
router.get('/:id', productController.getProductById);

// Protected update/delete
router.put('/:id', verifyToken, checkRole('FARMER'), productController.updateProduct);
router.delete('/:id', verifyToken, checkRole('FARMER'), productController.deleteProduct);

module.exports = router;
