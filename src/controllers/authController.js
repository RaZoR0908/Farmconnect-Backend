const supabase = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../config/email');

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

    // Use limit(1) to get first matching user (handles duplicates)
    const { data, error } = await query.limit(1);
    
    const user = data && data.length > 0 ? data[0] : null;

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
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
};

// Request password reset (send 6-digit code)
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find user by email
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      // Don't reveal if email exists or not (security best practice)
      return res.json({
        success: true,
        message: 'If that email exists, a reset code has been sent'
      });
    }

    // Generate 6-digit code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Set expiration time (15 minutes)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Save reset token to database
    const { error: tokenError } = await supabase
      .from('password_reset_tokens')
      .insert([{
        user_id: user.id,
        reset_code: resetCode,
        expires_at: expiresAt,
        used: false
      }]);

    if (tokenError) {
      throw tokenError;
    }

    // Send email with reset code
    const emailResult = await sendPasswordResetEmail(email, resetCode, user.full_name);

    if (!emailResult.success) {
      console.error('Failed to send email:', emailResult.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send reset email. Please try again.'
      });
    }

    res.json({
      success: true,
      message: 'Password reset code has been sent to your email'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password reset request',
      error: error.message
    });
  }
};

// Verify reset code (optional - can be done in resetPassword)
exports.verifyResetCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: 'Email and code are required'
      });
    }

    // Find user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        success: false,
        message: 'Invalid email or code'
      });
    }

    // Find valid reset token
    const { data: token, error: tokenError } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('user_id', user.id)
      .eq('reset_code', code)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (tokenError || !token) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset code'
      });
    }

    res.json({
      success: true,
      message: 'Code verified successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error verifying reset code',
      error: error.message
    });
  }
};

// Reset password with code
exports.resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, code, and new password are required'
      });
    }

    // Validate password strength
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Find user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        success: false,
        message: 'Invalid email or code'
      });
    }

    // Find valid reset token
    const { data: token, error: tokenError } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('user_id', user.id)
      .eq('reset_code', code)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (tokenError || !token) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset code'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    const { error: updateError } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('id', user.id);

    if (updateError) {
      throw updateError;
    }

    // Mark token as used
    await supabase
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('id', token.id);

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error during password reset',
      error: error.message
    });
  }
};
