const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const axios = require("axios");

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Dummy review data
const dummyReviews = [
  { id: 1, product: "Laptop", review: "Great performance, but battery life is short." },
  { id: 2, product: "Laptop", review: "Amazing screen and fast processor!" },
  { id: 3, product: "Laptop", review: "Good value for money, but the keyboard is not comfortable." },
];


const fetchReviews = async () => {
    const API_URL = "https://api.soco.id/reviews";
    const FILTER_PARAMS = encodeURIComponent(
      JSON.stringify({
        is_published: true,
        elastic_search: true,
        product_id: 84473,
        is_highlight: true
      })
    );
  
    const FULL_URL = `${API_URL}?filter=${FILTER_PARAMS}&skip=0&limit=6&sort=most_relevant`;
  
    try {
      const response = await axios.get(FULL_URL);
      const reviews = response.data?.data || []; // Ensure data exists
  
      return reviews.map((review, index) => ({
        id: index + 1,
        user: review?.user?.name || "Anonymous",
        rating: review?.average_rating || 0,
        comment: review?.details || "No comment provided",
        date: review?.created_at || new Date().toISOString(),
      }));
    } catch (error) {
      console.error("Error fetching reviews:", error.message);
      return [];
    }
  };
  
  // API Endpoint to Fetch External Reviews
  app.get("/api/external-reviews", async (req, res) => {
    try {
      const reviews = await fetchReviews();
      res.json(reviews);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reviews" });
    }
  });

    // Summarize Reviews API
    app.get("/api/reviews/summary", async (req, res) => {
    try {

        const reviews = await fetchReviews();
       
        const reviewsText = reviews.map((r) => r.comment);
        const prompt = `Summarize these product reviews:\n\n${reviewsText}`;
        console.log(reviewsText,'reviewsText');
        // const formattedReviews = reviews.map((review) => {
        //     return {
        //         'review text': review.details,
        //         "reviewer's beauty profile": {
        //             skin:
        //                 review.user && review.user.skin_types
        //                     ? review.user.skin_types.map((st) => st.name).join(', ')
        //                     : 'Not specified',
        //             hair:
        //                 review.user && review.user.hair_types
        //                     ? review.user.hair_types.map((ht) => ht.name).join(', ')
        //                     : 'Not specified',
        //         },
        //         'rating given': {
        //             average: review.average_rating,
        //             durability: review.star_durability,
        //             effectiveness: review.star_effectiveness,
        //             eficiency: review.star_eficiency,
        //             long_wear: review.star_long_wear,
        //             packaging: review.star_packaging,
        //             pigmentation: review.star_pigmentation,
        //             scent: review.star_scent,
        //             texture: review.star_texture,
        //             value_for_money: review.star_value_for_money,
        //         },
        //         repurchased: review.is_repurchase,
        //         created_at: review.created_at,
        //     };
        // });
        // // Get product category name
        // let categoryName = 'Unknown';
        // if (product.categories && product.categories.length > 0) {
        //     categoryName = product.categories[0].name;
        // }
        // // Construct the prompt for OpenAI
        // const prompt = `
        //         below is a list of reviews for the ${categoryName} product called ${product.name} from the brand ${
        //                 product.brand?.name || 'Unknown'
        //             }. 
        //         Each review has the following metadata:
        //         - review text: written review of the user
        //         - reviewer's beauty profile: skin and hair profile of the user
        //         - rating given: ratings given by user
        //         - repurchased: whether user have repurchased or not
        //         - created_at: date review is created.

        //         Your task is to create a summary of the product reviews by creating a list of pros and cons. 
        //         - For each point, if possible take note of the specific beauty profile the review point may be associated with.
        //         - Today's date is ${new Date()}, consider newer reviews to be more relevant.
        //         ${JSON.stringify(formattedReviews)}

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
        res.json({ review_summary: summary });

    } catch (error) {
        console.error('Error calling OpenAI:', error.response?.data || error.message);
        res.status(500).json({ review_summary: "Failed to generate review summary." });
    }
    });

    // Fetch Dummy Reviews API
    app.get("/api/reviews", (req, res) => {
    res.json(dummyReviews);
    });



    // Start the server
    app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    });
