const express = require('express');
const router = express.Router();

/**
 * @route   GET /api/reviews/matching-percentage
 * @desc    Get the matching percentage for reviews
 * @access  Public
 */
router.get('/matching-percentage', (req, res) => {
  // This route will handle matching percentage functionality
  // For now, just returning a placeholder response
  res.json({ 
    success: true, 
    message: 'Matching percentage endpoint',
    data: {
      percentage: 85,
      timestamp: new Date()
    }
  });
});

/**
 * @route   GET /api/reviews/analyze
 * @desc    Analyze reviews
 * @access  Public
 */
router.get('/analyze', (req, res) => {
  // This route will handle review analysis functionality
  // For now, just returning a placeholder response
  res.json({ 
    success: true, 
    message: 'Review analysis endpoint',
    data: {
      analysis: 'Placeholder analysis result',
      timestamp: new Date()
    }
  });
});


router.get('/analyze', async (req, res) => {
  // This route will handle review analysis functionality

  try {

    const reviews = await fetchReviews();
   
    const reviewsText = reviews.map((r) => r.comment);
    const prompt = `Summarize these product reviews:\n\n${reviewsText}`;
    console.log(reviewsText,'reviewsText');
    
    const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
        model: 'gpt-4o-mini',
        messages: [
        {
            role: 'system',
            content: 'merangkum ulasan produk. Berikan ringkasan yang terstruktur dengan kelebihan dan kekurangan.',
        },
        {
            role: 'user',
            content: prompt,
        },
        ],
        max_tokens: 150,
    },
    {
        headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        },
    }
    );

    const summary = response.data.choices[0]?.message?.content.trim() || "No summary available.";
    // res.json({ review_summary: summary });
    res.json({ 
      success: true, 
      message: 'Review analysis endpoint',
      data: {
        summary: summary,
        timestamp: new Date()
      }
    });

} catch (error) {
    console.error('Error calling OpenAI:', error.response?.data || error.message);
    res.status(500).json({ review_summary: "Failed to generate review summary." });
}

});


// Dummy review data
const dummyReviews = [
  { id: 1, product: "Laptop", review: "Great performance, but battery life is short." },
  { id: 2, product: "Laptop", review: "Amazing screen and fast processor!" },
  { id: 3, product: "Laptop", review: "Good value for money, but the keyboard is not comfortable." },
];

// Fetch External Reviews API
// const fetchReviews = async () => {
//   const API_URL = "https://api.soco.id/reviews";
//   const FILTER_PARAMS = encodeURIComponent(
//     JSON.stringify({
//       is_published: true,
//       elastic_search: true,
//       product_id: 84473,
//       is_highlight: true
//     })
//   );

//   const FULL_URL = `${API_URL}?filter=${FILTER_PARAMS}&skip=0&limit=6&sort=most_relevant`;

//   try {
//     const response = await axios.get(FULL_URL);
//     const reviews = response.data?.data || []; // Ensure data exists

//     return reviews.map((review, index) => ({
//       id: index + 1,
//       user: review?.user?.name || "Anonymous",
//       rating: review?.average_rating || 0,
//       comment: review?.details || "No comment provided",
//       date: review?.created_at || new Date().toISOString(),
//     }));
//   } catch (error) {
//     console.error("Error fetching reviews:", error.message);
//     return [];
//   }
// };

// API Endpoint to Fetch External Reviews
// app.get("/api/external-reviews", async (req, res) => {
//   try {
//     const reviews = await fetchReviews();
//     res.json(reviews);
//   } catch (error) {
//     res.status(500).json({ error: "Failed to fetch reviews" });
//   }
// });


module.exports = router; 