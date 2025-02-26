const express = require('express');
const router = express.Router();
const axios = require("axios");


const fetchProduct = async () => {
    const API_URL = "https://catalog-api1.sociolla.com/v3/products";
    const FILTER_PARAMS = encodeURIComponent(
      JSON.stringify({
        skip: 10,
        limit: 5,
        sort: "-updated_at",
      })
    );
  
    const FULL_URL = `https://catalog-api1.sociolla.com/v3/products?skip=20&limit=20&sort=-updated_at/`;
  
    try {
      const response = await axios.get(FULL_URL);
      const products = response.data?.data || []; // Ensure data exists
      return products
    } catch (error) {
      console.error("Error fetching products:", error.response?.data || error.message);
      return [];
    }
};


const fetchReviews = async (id) => {
    const API_URL = "https://api.soco.id/reviews";
    const FILTER_PARAMS = encodeURIComponent(
      JSON.stringify({
        is_published: true,
        elastic_search: true,
        product_id: id,
        is_highlight: true,
        is_spam: false,
        deleted_at: null
      })
    );
  
    const FULL_URL = `${API_URL}?filter=${FILTER_PARAMS}&skip=0&limit=50&sort=most_relevant`;
  
    try {
      const response = await axios.get(FULL_URL);
      const reviews = response.data?.data || []; // Ensure data exists
  
      return reviews.map((review, index) => ({
        id: index + 1,
        user: review?.user?.name || "Anonymous",
        rating: review?.average_rating || 0,
        comment: review?.details || "No comment provided",
        date: review?.created_at || new Date().toISOString(),
        userMeta: review?.user || {}
       }));
    } catch (error) {
      console.error("Error fetching reviews:", error.message);
      return [];
    }
};

router.get('/products', async (req, res) => {
  // This route will handle products functionality
  const product = await fetchProduct();
  console.log(product);
  res.json({ 
    success: true, 
    message: 'Review analysis endpoint',
    data: {
      product: product,
      timestamp: new Date()
    }
  });
});

router.post('/products/reviews/:id', async (req, res) => {
    const { id } = req.params; // Extract id from request params
    try {
        const product = await fetchReviews(id);
        res.json({ 
            success: true, 
            message: 'Review analysis endpoint',
            data: {
                product,
                timestamp: new Date()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch reviews", error: error.message });
    }
});

router.post('/analyze/:id', async (req, res) => {
  // This route will handle review analysis functionality
  const { id } = req.params; 
  console.log('id', id);
  try {

    const reviews = await fetchReviews(id);
    const reviewsText = reviews.map((r) => r.comment);
    
    const prompt = `Summarize these product reviews:\n\n${reviewsText}`;
    const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
        model: 'gpt-4o-mini',
        messages: [
        {
            role: 'system',
            content: `merangkum ulasan produk. Berikan ringkasan yang terstruktur dengan kelebihan dan kekurangan, dan juga efek yang dilaporkan oleh Pengulas

            contoh efek:
            ✅ Teman dengan kulit normal dan kombinasi merasa produk ini melembapkan dan tahan lama.
            ⚠️ Kulit Kering: Beberapa teman melaporkan adanya kemerahan atau rasa kencang setelah penggunaan.
            ⚠️ Kulit Berminyak: Beberapa pengguna merasa produk ini terlalu berat dan menyebabkan jerawat setelah beberapa hari penggunaan.
            ---
            tolong taro response sebagain JSON
            `,
        },
        {
            role: 'user',
            content: prompt,
        },
        ],
        functions: [
          {
            name: 'create_review_summary',
            description: 'Creates a JSON object containing a field for review summary.',
            parameters: {
              type: 'object',
              required: ['review_summary'],
              properties: {
                review_summary: {
                  type: 'string',
                  description: 'Summary of the review',
                },
                review_effects: {
                  type: 'array',
                  description: 'Effects of the review',
                  items: {
                    type: 'string',
                    description: 'A specific effect or feedback reported by users'
                  }
                },
              },
              additionalProperties: false,
            },
          },
        ],
        function_call: { name: 'create_review_summary' },
        max_tokens: 450,
    },
    {
        headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        },
    }
    );

    console.log(response.data.choices[0]?.message?.function_call?.arguments);
    // Parse the function response
    const functionResponse = JSON.parse(response.data.choices[0]?.message?.function_call?.arguments || '{"review_summary": "No summary available."}');
    const summary = functionResponse.review_summary;
    
    res.json({ 
      success: true, 
      message: 'Review analysis endpoint',
      data: {
        summary: summary,
        effects: functionResponse.review_effects,
        timestamp: new Date()
      }
    });

} catch (error) {
    // console.error('Error calling OpenAI:', error.response?.data || error.message);
    res.status(500).json({ review_summary: "Failed to generate review summary." });
}

});

router.post('/products/recommend', async (req, res) => {
    const { id } = req.params; // Extract id from request params
    try {
        const product = await fetchProduct();
        res.json({ 
            success: true, 
            message: 'Review analysis endpoint',
            data: {
                product,
                timestamp: new Date()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch reviews", error: error.message });
    }
});



module.exports = router; 