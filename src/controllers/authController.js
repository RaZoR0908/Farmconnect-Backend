const supabase = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' } // Token expires in 7 days
  );
};

// Register new user
exports.register = async (req, res) => {
  try {
    const { email, phone, full_name, role, password } = req.body;

    // Validate required fields
    if (!email || !full_name || !role || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email, full_name, role, and password are required'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Valid roles
    const validRoles = ['FARMER', 'WHOLESALER', 'RETAILER', 'CUSTOMER', 'INSTITUTIONAL_BUYER'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Role must be one of: ${validRoles.join(', ')}`
      });
    }

    // Insert user into database
    const { data, error } = await supabase
      .from('users')
      .insert([{ email, phone, full_name, role, password: hashedPassword }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique violation
        return res.status(409).json({
          success: false,
          message: 'Email already exists'
        });
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token: generateToken(data),
      data: {
        id: data.id,
        email: data.email,
        full_name: data.full_name,
        role: data.role
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message
    });
  }
};

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message
    });
  }
};

// Login user with email or phone
exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    // Validate input
    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email/phone and password'
      });
    }

    // Detect if identifier is email or phone
    const isEmail = identifier.includes('@');
    
    // Find user by email or phone
    let query = supabase.from('users').select('*');
    
    if (isEmail) {
      query = query.eq('email', identifier);
    } else {
      query = query.eq('phone', identifier);
    }

    const { data: user, error } = await query.single();

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      token: generateToken(user),
      message: 'Login successful',
      data: userWithoutPassword
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
};
