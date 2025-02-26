const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Import routes
const reviewsRoutes = require('./routes/reviews');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/reviews', reviewsRoutes);

// Default route
app.get('/', (req, res) => {
  res.json({ 
    message: 'API Review Hack API is running',
    endpoints: [
      '/api/reviews/matching-percentage',
      '/api/reviews/analyze'
    ]
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 