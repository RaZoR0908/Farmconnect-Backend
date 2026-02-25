const supabase = require('../config/db');
const { calculatePrice } = require('../utils/pricingHelper');
const walletController = require('./walletController');

// Create Order (Buyer places order)
exports.createOrder = async (req, res) => {
  try {
    const buyer_id = req.user.id;
    const { product_id, quantity, delivery_address, notes } = req.body;

    // Validate input
    if (!product_id || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Product ID and quantity are required'
      });
    }

    // Get product details
    const { data: product, error: prodError } = await supabase
      .from('products')
      .select('*, farmer:users!farmer_id(id, full_name, email)')
      .eq('id', product_id)
      .single();

    if (prodError || !product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if enough stock
    if (product.quantity < quantity) {
      return res.status(400).json({
        success: false,
        message: `Not enough stock. Available: ${product.quantity} ${product.unit}`
      });
    }

    // Calculate total with buyer-specific pricing
    const basePrice = parseFloat(product.price);
    const pricing = calculatePrice(basePrice, req.user.role, quantity);
    const unit_price = pricing.finalPrice;
    const total_amount = unit_price * parseFloat(quantity);

    // Check wallet balance and deduct from customer wallet
    const { data: buyerWallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', buyer_id)
      .single();

    if (walletError && walletError.code === 'PGRST116') {
      return res.status(400).json({
        success: false,
        message: 'Wallet not found. Please add money to your wallet first.'
      });
    }

    if (walletError) throw walletError;

    const buyerBalance = parseFloat(buyerWallet.balance);
    if (buyerBalance < total_amount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. You have ₹${buyerBalance.toFixed(2)}, need ₹${total_amount.toFixed(2)}`
      });
    }

    // Deduct from buyer's wallet immediately
    const newBalance = buyerBalance - total_amount;
    const { error: debitError } = await supabase
      .from('wallets')
      .update({ balance: newBalance })
      .eq('id', buyerWallet.id);

    if (debitError) throw debitError;

    // Record transaction (HOLD - will be credited to farmer on acceptance)
    await supabase
      .from('wallet_transactions')
      .insert([{
        wallet_id: buyerWallet.id,
        user_id: buyer_id,
        amount: total_amount,
        type: 'DEBIT',
        transaction_type: 'ORDER_PAYMENT',
        description: `Payment for order (pending farmer acceptance)`,
        balance_before: buyerBalance,
        balance_after: newBalance,
        status: 'COMPLETED'
      }]);

    // Reduce product stock immediately when order is placed
    const newQuantity = parseFloat(product.quantity) - parseFloat(quantity);
    const { error: stockError } = await supabase
      .from('products')
      .update({ quantity: newQuantity })
      .eq('id', product_id);

    if (stockError) throw stockError;

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([{
        buyer_id,
        farmer_id: product.farmer_id,
        product_id,
        quantity,
        unit_price,
        total_amount,
        delivery_address,
        notes,
        payment_method: 'WALLET',
        status: 'PENDING'
      }])
      .select(`
        *,
        buyer:users!buyer_id(id, full_name, role),
        farmer:users!farmer_id(id, full_name),
        product:products(id, name, unit, price)
      `)
      .single();

    if (orderError) {
      // Restore stock if order creation fails
      await supabase
        .from('products')
        .update({ quantity: product.quantity })
        .eq('id', product_id);
      throw orderError;
    }

    // Add pricing breakdown to response
    const pricingInfo = calculatePrice(product.price, req.user.role, quantity);

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: {
        ...order,
        pricingBreakdown: {
          basePrice: pricingInfo.basePrice,
          discount: pricingInfo.discountPercent + '%',
          finalPrice: pricingInfo.finalPrice,
          totalSavings: pricingInfo.savings * parseFloat(quantity)
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating order',
      error: error.message
    });
  }
};

// Get Farmer's Orders
exports.getFarmerOrders = async (req, res) => {
  try {
    const farmer_id = req.user.id;
    const { status } = req.query;

    let query = supabase
      .from('orders')
      .select(`
        *,
        buyer:users!buyer_id(id, full_name, email, phone),
        product:products(id, name, unit)
      `)
      .eq('farmer_id', farmer_id)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      count: data.length,
      data
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
};

// Get Buyer's Orders
exports.getBuyerOrders = async (req, res) => {
  try {
    const buyer_id = req.user.id;

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        farmer:users!farmer_id(id, full_name, phone),
        product:products(id, name, unit, image_url)
      `)
      .eq('buyer_id', buyer_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      count: data.length,
      data
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
};

// Accept Order (Farmer)
exports.acceptOrder = async (req, res) => {
  try {
    const farmer_id = req.user.id;
    const { id } = req.params;

    // Check if order belongs to farmer
    const { data: order, error: checkError } = await supabase
      .from('orders')
      .select('*, product:products(quantity)')
      .eq('id', id)
      .eq('farmer_id', farmer_id)
      .single();

    if (checkError || !order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Cannot accept order with status: ${order.status}`
      });
    }

    // Credit the farmer (customer already paid when placing order)
    // Get or create farmer's wallet
    let { data: farmerWallet, error: farmerWalletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', farmer_id)
      .single();

    if (farmerWalletError && farmerWalletError.code === 'PGRST116') {
      // Create wallet if doesn't exist
      const { data: newWallet, error: createError } = await supabase
        .from('wallets')
        .insert([{ user_id: farmer_id, balance: 0.00 }])
        .select()
        .single();

      if (createError) throw createError;
      farmerWallet = newWallet;
    } else if (farmerWalletError) {
      throw farmerWalletError;
    }

    const farmerBalanceBefore = parseFloat(farmerWallet.balance);
    const farmerBalanceAfter = farmerBalanceBefore + parseFloat(order.total_amount);

    // Credit farmer's wallet
    const { error: creditError } = await supabase
      .from('wallets')
      .update({ balance: farmerBalanceAfter })
      .eq('id', farmerWallet.id);

    if (creditError) throw creditError;

    // Record farmer transaction
    await supabase
      .from('wallet_transactions')
      .insert([{
        wallet_id: farmerWallet.id,
        user_id: farmer_id,
        amount: parseFloat(order.total_amount),
        type: 'CREDIT',
        transaction_type: 'ORDER_PAYMENT',
        description: `Payment received for order #${order.id.slice(0, 8)}`,
        reference_id: order.id,
        balance_before: farmerBalanceBefore,
        balance_after: farmerBalanceAfter,
        status: 'COMPLETED'
      }]);

    // Update order status (stock already reduced when order was placed)
    const { data, error } = await supabase
      .from('orders')
      .update({ 
        status: 'ACCEPTED',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Order accepted and payment processed successfully',
      data
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error accepting order',
      error: error.message
    });
  }
};

// Reject Order (Farmer)
exports.rejectOrder = async (req, res) => {
  try {
    const farmer_id = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    // Check if order belongs to farmer
    const { data: order, error: checkError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .eq('farmer_id', farmer_id)
      .single();

    if (checkError || !order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Cannot reject order with status: ${order.status}`
      });
    }

    // Get current product to restore stock
    const { data: product, error: prodError } = await supabase
      .from('products')
      .select('quantity')
      .eq('id', order.product_id)
      .single();

    if (prodError) throw prodError;

    // Restore stock when rejecting order
    const restoredQuantity = parseFloat(product.quantity) + parseFloat(order.quantity);
    await supabase
      .from('products')
      .update({ quantity: restoredQuantity })
      .eq('id', order.product_id);

    // Refund to buyer's wallet
    const { data: buyerWallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', order.buyer_id)
      .single();

    let refundProcessed = false;

    if (!walletError && buyerWallet) {
      const buyerBalanceBefore = parseFloat(buyerWallet.balance);
      const buyerBalanceAfter = buyerBalanceBefore + parseFloat(order.total_amount);

      // Credit buyer's wallet (refund)
      const { error: refundError } = await supabase
        .from('wallets')
        .update({ balance: buyerBalanceAfter })
        .eq('id', buyerWallet.id);

      if (!refundError) {
        // Record refund transaction
        await supabase
          .from('wallet_transactions')
          .insert([{
            wallet_id: buyerWallet.id,
            user_id: order.buyer_id,
            amount: parseFloat(order.total_amount),
            type: 'CREDIT',
            transaction_type: 'REFUND',
            description: `Refund for rejected order #${order.id.slice(0, 8)}`,
            reference_id: order.id,
            balance_before: buyerBalanceBefore,
            balance_after: buyerBalanceAfter,
            status: 'COMPLETED'
          }]);

        refundProcessed = true;
      }
    }

    // Update order status
    const { data, error } = await supabase
      .from('orders')
      .update({ 
        status: 'CANCELLED',
        rejection_reason: reason || 'No reason provided',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    const message = refundProcessed 
      ? 'Order cancelled and refund processed to customer wallet'
      : 'Order cancelled (refund processing may have failed)';

    res.json({
      success: true,
      message,
      data
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error rejecting order',
      error: error.message
    });
  }
};
