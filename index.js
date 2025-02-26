const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Import routes
const reviewsRoutes = require('./routes/reviews');
const ProductsRoutes = require('./routes/products');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Middleware
app.use(cors({
  origin: '*'
}));
app.use(express.json());

// Routes
app.use('/api/reviews', reviewsRoutes);
app.use('/api/', ProductsRoutes);

// Default route
app.get('/', (req, res) => {
  res.json({ 
    message: 'API Review Hack API is running',
    endpoints: [
      '/api/reviews/matching-percentage',
      '/api/reviews/analyze',
      '/api/reviews/compare'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'An unexpected error occurred',
    error: process.env.NODE_ENV === 'production' ? {} : err
  });
});

// Start server
const PORT = process.env.PORT || 7001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 