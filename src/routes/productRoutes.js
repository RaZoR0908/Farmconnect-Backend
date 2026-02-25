const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { verifyToken, checkRole } = require('../middleware/authMiddleware');

// Make verifyToken optional for getAllProducts
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return verifyToken(req, res, next);
  }
  next();
};

// Public routes (with optional authentication for pricing)
router.get('/', optionalAuth, productController.getAllProducts);
router.get('/:id', productController.getProductById);

// Protected routes - Require authentication (specific routes BEFORE :id)
router.get('/farmer/my-products', verifyToken, checkRole('FARMER'), productController.getMyProducts);
router.post('/', verifyToken, checkRole('FARMER'), productController.createProduct);

// Stock management
router.patch('/:id/stock', verifyToken, checkRole('FARMER'), productController.updateStock);

// Protected update/delete
router.put('/:id', verifyToken, checkRole('FARMER'), productController.updateProduct);
router.delete('/:id', verifyToken, checkRole('FARMER'), productController.deleteProduct);

module.exports = router;
