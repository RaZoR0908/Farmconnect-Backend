const supabase = require('../config/db');

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

    // Calculate total
    const unit_price = parseFloat(product.price);
    const total_amount = unit_price * parseFloat(quantity);

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
        status: 'PENDING'
      }])
      .select()
      .single();

    if (orderError) throw orderError;

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: order
    });

  } catch (error) {
    console.error('Create order error:', error);
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
    console.error('Get farmer orders error:', error);
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
    console.error('Get buyer orders error:', error);
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

    // Update order status
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

    // Reduce product quantity
    await supabase
      .from('products')
      .update({ 
        quantity: order.product.quantity - order.quantity 
      })
      .eq('id', order.product_id);

    res.json({
      success: true,
      message: 'Order accepted successfully',
      data
    });

  } catch (error) {
    console.error('Accept order error:', error);
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

    // Update order status
    const { data, error } = await supabase
      .from('orders')
      .update({ 
        status: 'REJECTED',
        notes: reason || order.notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Order rejected',
      data
    });

  } catch (error) {
    console.error('Reject order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting order',
      error: error.message
    });
  }
};
