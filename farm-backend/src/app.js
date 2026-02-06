const express = require('express');
const cors = require('cors');
const supabase = require('./config/db');

// Import routes
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Root route
app.get('/', (req, res) => {
  res.json({ message: '🚀 FarmConnect API running' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);

// App health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    env: process.env.NODE_ENV,
    time: new Date().toISOString()
  });
});

// Supabase DB health check
app.get('/api/db-health', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('test')
      .select('*')
      .limit(1);

    if (error) {
      return res.status(500).json({
        status: 'DB_ERROR',
        error: error.message
      });
    }

    res.json({
      status: 'DB_CONNECTED',
      sampleData: data
    });
  } catch (err) {
    res.status(500).json({
      status: 'DB_EXCEPTION',
      error: err.message
    });
  }
});

module.exports = app;
