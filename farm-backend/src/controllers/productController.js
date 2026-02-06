const supabase = require('../config/db');

// Create new product (Farmer only)
exports.createProduct = async (req, res) => {
  try {
    const { name, category, price, unit, quantity, description, image_url } = req.body;
    const farmer_id = req.user.id; // Get farmer ID from JWT token

    // Validate required fields
    if (!name || !category || !price || !unit || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'name, category, price, unit, and quantity are required'
      });
    }

    // Insert product
    const { data, error } = await supabase
      .from('products')
      .insert([{ farmer_id, name, category, price, unit, quantity, description, image_url }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data
    });

  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating product',
      error: error.message
    });
  }
};

// Get all products
exports.getAllProducts = async (req, res) => {
  try {
    const { category, min_price, max_price } = req.query;

    let query = supabase
      .from('products')
      .select(`
        *,
        farmer:users!farmer_id (
          id,
          full_name,
          email,
          phone
        )
      `);

    // Apply filters
    if (category) {
      query = query.eq('category', category);
    }
    if (min_price) {
      query = query.gte('price', min_price);
    }
    if (max_price) {
      query = query.lte('price', max_price);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      count: data.length,
      data
    });

  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
};

// Get single product by ID
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        farmer:users!farmer_id (
          id,
          full_name,
          email,
          phone
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching product',
      error: error.message
    });
  }
};

// Update product
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, price, unit, quantity, description, image_url } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (category) updateData.category = category;
    if (price) updateData.price = price;
    if (unit) updateData.unit = unit;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (description) updateData.description = description;
    if (image_url) updateData.image_url = image_url;

    const { data, error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product updated successfully',
      data
    });

  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating product',
      error: error.message
    });
  }
};

// Delete product
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting product',
      error: error.message
    });
  }
};
