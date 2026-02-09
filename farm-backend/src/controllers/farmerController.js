const supabase = require('../config/db');

// Get Farmer Dashboard Stats
exports.getFarmerStats = async (req, res) => {
  try {
    const farmer_id = req.user.id;

    // Get all farmer's products
    const { data: products, error: prodError } = await supabase
      .from('products')
      .select('*')
      .eq('farmer_id', farmer_id);

    if (prodError) throw prodError;

    // Get all farmer's orders
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('farmer_id', farmer_id);

    if (ordersError) throw ordersError;

    // Calculate stats
    const totalProducts = products.length;
    const totalInventoryValue = products.reduce((sum, p) => sum + (parseFloat(p.price) * parseFloat(p.quantity)), 0);
    const lowStockProducts = products.filter(p => p.quantity < 20).length;
    
    const totalOrders = orders.length;
    const pendingOrders = orders.filter(o => o.status === 'PENDING').length;
    const acceptedOrders = orders.filter(o => o.status === 'ACCEPTED').length;
    const totalRevenue = orders.filter(o => o.status === 'ACCEPTED' || o.status === 'COMPLETED')
      .reduce((sum, o) => sum + parseFloat(o.total_amount), 0);

    res.json({
      success: true,
      data: {
        totalProducts,
        totalInventoryValue: totalInventoryValue.toFixed(2),
        lowStockProducts,
        totalOrders,
        pendingOrders,
        acceptedOrders,
        totalRevenue: totalRevenue.toFixed(2)
      }
    });

  } catch (error) {
    console.error('Farmer stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching stats',
      error: error.message
    });
  }
};

// Update Farmer Profile
exports.updateProfile = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { full_name, phone } = req.body;

    const updateData = {};
    if (full_name) updateData.full_name = full_name;
    if (phone) updateData.phone = phone;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', user_id)
      .select()
      .single();

    if (error) throw error;

    // Remove password from response
    const { password: _, ...userWithoutPassword } = data;

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: userWithoutPassword
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  }
};
