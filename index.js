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

// Placeholder function to fetch user data
const fetchUser = async (userId) => {
  // This would normally call an external service
  // For demo purposes, returning mock beauty profile data
  return {
    id: userId,
    beauty: [
      {
        name: 'jenis-kulit',
        subtags: [
          { name: 'Berminyak' },
          { name: 'Sensitive' }
        ]
      },
      {
        name: 'warna-kulit',
        subtags: [
          { name: 'Sawo Matang' }
        ]
      }
    ]
  };
};

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
            tools: [
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
                  },
                  additionalProperties: false,
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "create_review_summary" } }
        },
        {
            headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
            },
        }
        );

        // Extract the summary from the tool call response
        const toolCalls = response.data.choices[0]?.message?.tool_calls || [];
        let summary = "No summary available.";
        
        if (toolCalls.length > 0 && toolCalls[0].function.name === 'create_review_summary') {
          try {
            const functionArguments = JSON.parse(toolCalls[0].function.arguments);
            summary = functionArguments.review_summary || summary;
          } catch (error) {
            console.error('Error parsing function arguments:', error);
          }
        }
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

    // User Matching Percentage API
    app.get("/api/reviews/matching-percentage", async (req, res) => {
      try {
        // Get productId from query params, default to a test product if not provided
        const productId = req.query.productId || "84473";
        
        // In a real app, this would be extracted from auth token
        // For demo purposes, use a static user ID
        const userId = req.query.userId || "123";
        
        // Get user's beauty profile
        let userBeautyProfile = null;
        try {
          const user = await fetchUser(userId);
          userBeautyProfile = user.beauty || [];
        } catch (error) {
          return res.status(404).json({
            matching_percentage: 0,
            message: 'User not found',
            details: {}
          });
        }

        if (!userBeautyProfile || !userBeautyProfile.length) {
          return res.json({
            matching_percentage: 0,
            message: 'User has no beauty profile',
            details: {},
          });
        }

        // Prepare user's beauty attributes map for easy comparison
        const userAttributes = {};
        userBeautyProfile.forEach((category) => {
          if (category.subtags && category.subtags.length) {
            // Map category (like 'jenis-kulit', 'warna-kulit', etc) to its values
            userAttributes[category.name] = category.subtags.map((subtag) => subtag.name.toLowerCase());
          }
        });

        // Get reviews using the existing fetchReviews function
        // Note: In a real implementation, we'd modify fetchReviews to accept productId
        const reviews = await fetchReviews();

        if (!reviews || !reviews.length) {
          return res.json({
            matching_percentage: 0,
            message: 'No reviews found for this product',
            details: {},
          });
        }

        // Count beauty profile attribute frequencies from all reviews
        const attributeFrequencies = {};
        const highlyRatedReviews = reviews.filter((review) => review.rating >= 4);

        // Extract beauty profiles from high-rated reviews
        highlyRatedReviews.forEach((review) => {
          // Handle different structures of beauty data in reviews
          let reviewerBeautyData = [];

          // Create mock beauty data based on user information
          // In real implementation, this would come from each review's user data
          if (review.user) {
            // Simulate skin types based on the review
            reviewerBeautyData.push({
              name: review.user.includes('Anonymous') ? 'Normal' : 'Berminyak',
              category: 'jenis-kulit'
            });
            
            // Add more simulated beauty attributes for demonstration
            if (review.rating > 4) {
              reviewerBeautyData.push({ name: 'Sensitive', category: 'jenis-kulit' });
            }
            
            if (review.rating > 3) {
              reviewerBeautyData.push({ name: 'Sawo Matang', category: 'warna-kulit' });
            }
          }

          // Now process the beauty data
          reviewerBeautyData.forEach((item) => {
            const attrName = item.name.toLowerCase();
            // Create category entry if it doesn't exist
            if (!attributeFrequencies[attrName]) {
              attributeFrequencies[attrName] = 0;
            }
            // Increment frequency
            attributeFrequencies[attrName]++;
          });
        });

        // Find attributes that have significant presence (e.g., frequency > 1)
        // and sort them by frequency
        const significantAttributes = Object.keys(attributeFrequencies)
          .filter((attr) => attributeFrequencies[attr] > 1) // Adjust threshold as needed
          .sort((a, b) => attributeFrequencies[b] - attributeFrequencies[a]);

        // Map user attributes to a flat list for easier matching
        const flatUserAttributes = [];
        Object.keys(userAttributes).forEach((category) => {
          userAttributes[category].forEach((attr) => {
            flatUserAttributes.push(attr);
          });
        });

        // Calculate matches
        let matchedAttributes = 0;
        const matchDetails = {};
        let totalWeightedScore = 0;
        let maxPossibleScore = 0;

        // Calculate maximum possible score based on the top significant attributes
        significantAttributes.forEach((attr) => {
          maxPossibleScore += attributeFrequencies[attr];
        });

        // Find matches between user attributes and significant attributes
        flatUserAttributes.forEach((userAttr) => {
          // Check if this user attribute exists in our significant attributes list
          if (significantAttributes.includes(userAttr)) {
            matchedAttributes++;
            const attrWeight = attributeFrequencies[userAttr] || 0;
            totalWeightedScore += attrWeight;

            // Track match details
            matchDetails[userAttr] = {
              matched: true,
              frequency: attrWeight,
            };
          } else {
            // When the user attribute is similar to but not exactly matching a significant attribute
            // Try to find a close match by normalizing strings further
            const normalizedUserAttr = userAttr.toLowerCase().replace(/\s+/g, '').trim();
            const matchedAttr = significantAttributes.find((attr) => {
              const normalizedAttr = attr.toLowerCase().replace(/\s+/g, '').trim();
              return normalizedUserAttr === normalizedAttr;
            });

            if (matchedAttr) {
              matchedAttributes++;
              const attrWeight = attributeFrequencies[matchedAttr] || 0;
              totalWeightedScore += attrWeight;

              // Track match details
              matchDetails[userAttr] = {
                matched: true,
                matched_with: matchedAttr,
                frequency: attrWeight,
              };
            } else {
              // No match found
              matchDetails[userAttr] = {
                matched: false,
              };
            }
          }
        });

        // Calculate matching percentage
        let matchingPercentage = 0;
        let weightedMatchingPercentage = 0;

        // If user has no relevant attributes, they can't match
        if (flatUserAttributes.length === 0) {
          return res.json({
            matching_percentage: 0,
            message: 'User has no relevant beauty attributes for this product',
            details: {
              user_attributes: flatUserAttributes,
              significant_attributes: significantAttributes,
              attribute_frequencies: attributeFrequencies,
            },
          });
        }

        // Simple percentage based on number of attributes that matched
        matchingPercentage = Math.round((matchedAttributes / flatUserAttributes.length) * 100);

        // Weighted percentage based on frequency of attributes in reviews
        if (maxPossibleScore > 0) {
          weightedMatchingPercentage = Math.round((totalWeightedScore / maxPossibleScore) * 100);
        }

        // Use the weighted percentage if available, otherwise fall back to simple percentage
        const finalPercentage = weightedMatchingPercentage || matchingPercentage;

        // Calculate individual attribute matching percentages
        const attributePercentages = {};

        // Calculate the total frequency of all significant attributes
        const totalFrequency = Object.values(attributeFrequencies).reduce((sum, freq) => sum + freq, 0);

        // Process each user attribute to determine its contribution percentage
        flatUserAttributes.forEach((userAttr) => {
          const matchInfo = matchDetails[userAttr];

          // If this attribute was matched (directly or after normalization)
          if (matchInfo && matchInfo.matched) {
            // Get the matched attribute name (either direct match or matched_with)
            const matchedAttrName = matchInfo.matched_with || userAttr;

            // Get the frequency of this attribute
            const attrFrequency = attributeFrequencies[matchedAttrName] || 0;

            // Calculate this attribute's contribution to the overall match as a percentage
            // Formula: (attribute frequency / total frequency of all attributes) * 100
            const percentage = Math.round((attrFrequency / totalFrequency) * 100);

            // Store the percentage using the original attribute name (not lowercase)
            // Find the original name from the user's beauty profile
            const originalName =
              userBeautyProfile
                .flatMap((category) => category.subtags || [])
                .find((subtag) => subtag.name.toLowerCase() === userAttr)?.name || userAttr;

            attributePercentages[originalName] = percentage;
          } else {
            // If the attribute wasn't matched, its contribution is 0%
            const originalName =
              userBeautyProfile
                .flatMap((category) => category.subtags || [])
                .find((subtag) => subtag.name.toLowerCase() === userAttr)?.name || userAttr;

            attributePercentages[originalName] = 0;
          }
        });

        return res.json({
          matching_percentage: finalPercentage,
          simple_matching_percentage: matchingPercentage,
          weighted_matching_percentage: weightedMatchingPercentage,
          message: `Product has a ${finalPercentage}% match with the user's beauty profile`,
          details: {
            matched_attributes: matchedAttributes,
            total_user_attributes: flatUserAttributes.length,
            weighted_score: totalWeightedScore,
            max_possible_score: maxPossibleScore,
            attribute_matches: matchDetails,
            significant_attributes: significantAttributes,
            attribute_frequencies: attributeFrequencies,
            user_attributes: flatUserAttributes,
            attribute_percentages: attributePercentages,
          },
        });
      } catch (error) {
        console.error('Error calculating user matching percentage:', error);
        return res.status(500).json({ 
          matching_percentage: 0,
          message: 'Error calculating matching percentage',
          error: error.message
        });
      }
    });

    // Start the server
    app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    });
