const express = require('express');
const router = express.Router();
const axios = require("axios");


const fetchProduct = async (skip = 0, limit = 10) => {
    const FULL_URL = `https://api.soco.id/products`;
  
    try {
      const response = await axios.get(FULL_URL, {
        params: {
          skip: skip,
          limit: limit,
          filter: {
            is_in_stock_sociolla: true
          },
          sort: {
           created_at: -1
          }
        }
      });
      const products = response.data?.data || []; // Ensure data exists
      return products
    } catch (error) {
      console.error("Error fetching products:", error.response?.data || error.message);
      return [];
    }
};


const fetchReviews = async (id) => {
    // const API_URL = "https://uat-ms-soco-public-api.sociolabs.io/reviews";
    const API_URL = "https://api.soco.id/reviews";
    const FILTER_PARAMS = encodeURIComponent(
      JSON.stringify({
            is_published: true,
            product_id: id,
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
        user: {
          age_range: review?.user?.age_range || "Tidak disebutkan",
          skin_types: review?.user?.skin_types?.map(skin => skin.name) || [],
          hair_types: review?.user?.hair_types?.map(hair => hair.name) || [],
          user_level: review?.user?.user_level || "Regular User"
        },
        product_info: {
          name: review?.product?.name || "",
          brand: review?.product?.brand?.name || "",
          category: review?.product?.category?.name || ""
        },
        ratings: {
          overall: review?.average_rating || 0,
          long_wear: review?.star_long_wear || 0,
          packaging: review?.star_packaging || 0,
          pigmentation: review?.star_pigmentation || 0,
          texture: review?.star_texture || 0,
          value_for_money: review?.star_value_for_money || 0
        },
        usage: {
          duration: review?.duration_of_used || "Tidak disebutkan",
          is_repurchase: review?.is_repurchase || "no",
          is_recommended: review?.is_recommended || "no",
          is_verified_purchase: review?.is_verified_purchase || false
        },
        comment: review?.details || "No comment provided",
        date: review?.created_at || new Date().toISOString()
      }));
    } catch (error) {
      console.error("Error fetching reviews:", error.message);
      return [];
    }
};

const fetchProductById = async (productId) => {
  const API_URL = "https://api.soco.id/products";
  const FILTER_PARAMS = encodeURIComponent(
    JSON.stringify({
      "$and": [{
        "$or": [
          {"deleted_at": null},
          {"deleted_at": {"$exists": false}}
        ]
      }],
      "name": {"$ne": null},
      "is_active_in_review": true
    })
  );

  const FULL_URL = `${API_URL}/${productId}?filter=${FILTER_PARAMS}`;

  try {
    const response = await axios.get(FULL_URL, {
      headers: {
        'accept': 'application/json',
        'soc-platform': 'review-web-mobile'
      }
    });
    
    return response.data?.data || {}; // Return the product data or empty object
  } catch (error) {
    console.error(`Error fetching product ${productId}:`, error.response?.data || error.message);
    return {};
  }
};

router.get('/products', async (req, res) => {
  // Get pagination parameters from query
  const skip = parseInt(req.query.skip) || 0;
  const limit = parseInt(req.query.limit) || 10;
  
  // This route will handle products functionality
  const product = await fetchProduct(skip, limit);
  console.log(`Fetched ${product.length} products with skip=${skip}, limit=${limit}`);
  
  res.json({ 
    success: true, 
    message: 'Products fetched successfully',
    data: {
      product: product,
      pagination: {
        skip: skip,
        limit: limit,
        total: product.length // Note: This is not the actual total, just the count of returned items
      },
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
  console.log('Processing analysis for product ID:', id);
  
  // Set headers for streaming
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  try {
    // Step 1: Fetch reviews
    console.log(`Fetching reviews for product ${id}...`);
    const reviews = await fetchReviews(id);
    
    if (!reviews || reviews.length === 0) {
      console.error(`No reviews found for product ${id}`);
      return res.status(404).json({ 
        success: false, 
        message: 'No reviews found for this product',
        error_code: 'REVIEWS_NOT_FOUND'
      });
    }
    
    console.log(`Found ${reviews.length} reviews for product ${id}`);
    
    // Start building the response
    const initialResponse = {
      success: true,
      message: 'Review analysis in progress',
      data: {
        summary: "Analyzing reviews...",
        effects: [],
        review_count: reviews.length,
        timestamp: new Date()
      }
    };
    
    // Send the initial response to show we're working on it
    res.write(JSON.stringify(initialResponse));
    
    // Step 2: Process reviews for prompt
    try {
      const reviewsWithContext = reviews.map(review => {
        const skinTypes = review.user.skin_types.length > 0 
          ? `Tipe kulit: ${review.user.skin_types.join(', ')}` 
          : '';
        const ageRange = review.user.age_range !== "Tidak disebutkan" 
          ? `Usia: ${review.user.age_range}` 
          : '';
        const usageDuration = review.usage.duration !== "Tidak disebutkan" 
          ? `Durasi penggunaan: ${review.usage.duration}` 
          : '';
        const ratings = `Rating: ${review.ratings.overall}/5 (Tekstur: ${review.ratings.texture}, Ketahanan: ${review.ratings.long_wear})`;
        
        const userContext = [skinTypes, ageRange, usageDuration, ratings]
          .filter(item => item !== '')
          .join(' | ');
          
        return `REVIEW ${review.id}:\n${review.comment}\n${userContext}\n`;
      });

      const reviewsText = reviewsWithContext.join('\n');
      
      // Step 3: Call OpenAI API
      console.log('Calling OpenAI API for review analysis...');
      const prompt = `Summarize these product reviews:\n\n${reviewsText}`;
      
      try {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `Anda adalah asisten untuk merangkum ulasan produk kecantikan. Tugas Anda adalah menyediakan:

1. RINGKASAN UMUM: Ringkasan singkat tentang sentimen umum dan poin-poin kunci yang disebutkan dalam ulasan (1-2 kalimat).
2. EFEK YANG DILAPORKAN: Daftar efek spesifik yang dilaporkan oleh pengguna berdasarkan tipe kulit, usia, dan durasi penggunaan.

Selalu merujuk para pengulas sebagai "Besties". Format efek dengan indikator emoji:
✅ Untuk efek positif 
⚠️ Untuk potensi masalah atau peringatan

Pertimbangkan informasi lengkap tentang pengguna, termasuk:
- Tipe kulit pengguna (kering, kombinasi, berminyak, dll)
- Rentang usia pengguna
- Durasi penggunaan produk
- Rating khusus (tekstur, ketahanan, packaging, dll)
- Keinginan untuk membeli kembali
- Status rekomendasi

Contoh RINGKASAN UMUM yang baik untuk Setting Spray:
"Mayoritas Besties sangat puas dengan Lock The Look Setting Spray ini, memuji kemampuannya mengunci makeup sepanjang hari bahkan selama beraktivitas. Rating keseluruhan sangat tinggi (4.8/5) dengan hampir semua Besties merekomendasikan produk ini, terutama untuk tekstur ringan dan kekuatan menahan makeup."

Contoh EFEK YANG DILAPORKAN yang baik:
✅ "Besties dengan kulit kombinasi melaporkan makeup tetap tahan sepanjang hari dari pagi hingga sore bahkan saat berolahraga."
✅ "Besties berusia 19-24 tahun dengan kulit kering menyarankan membiarkan spray meresap untuk hasil terbaik."
✅ "Besties memuji tekstur ringan (rating 4.9/5) dan tidak terasa lengket saat diaplikasikan."
⚠️ "Beberapa Besties dengan kulit sensitif mungkin perlu berhati-hati karena belum ada laporan khusus untuk tipe kulit ini."

Fokus pada menghasilkan field review_summary dan review_effects yang akurat, informatif, dan relevan dengan produk yang diulas. Gunakan data rating khusus (texture, long_wear, dll) untuk memperkaya insight Anda.

Batasi respon hingga 550 token.
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
            max_tokens: 650,
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        // Step 4: Parse response
        console.log('OpenAI API response received, parsing results...');
        if (!response.data || !response.data.choices || !response.data.choices[0]) {
          console.error('Invalid response structure from OpenAI:', response.data);
          return res.status(500).json({ 
            success: false, 
            message: 'Failed to analyze reviews - invalid response from AI',
            error_code: 'INVALID_AI_RESPONSE'
          });
        }
        
        const functionArgsRaw = response.data.choices[0]?.message?.function_call?.arguments;
        console.log('Function arguments received:', functionArgsRaw);
        
        if (!functionArgsRaw) {
          console.error('Missing function arguments in OpenAI response');
          return res.status(500).json({ 
            success: false, 
            message: 'Failed to analyze reviews - missing summary data',
            error_code: 'MISSING_SUMMARY_DATA'
          });
        }
        
        try {
          // Parse the function response
          const functionResponse = JSON.parse(functionArgsRaw);
          console.log('Successfully parsed review summary data');
          
          // Instead of sending all at once, send pieces of information as they're ready
          
          // Send summary first
          const summaryUpdate = {
            success: true,
            message: 'Review summary generated',
            data: {
              summary: functionResponse.review_summary || "No summary available.",
              effects: [],
              review_count: reviews.length,
              timestamp: new Date()
            }
          };
          
          res.write(JSON.stringify(summaryUpdate));
          
          // Small delay to simulate processing effects
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Then send full response with effects
          const finalResponse = {
            success: true, 
            message: 'Review analysis successful',
            data: {
              summary: functionResponse.review_summary || "No summary available.",
              effects: functionResponse.review_effects || [],
              review_count: reviews.length,
              timestamp: new Date()
            }
          };
          
          res.write(JSON.stringify(finalResponse));
          res.end();
          
        } catch (parseError) {
          console.error('Error parsing OpenAI function arguments:', parseError);
          return res.status(500).json({ 
            success: false, 
            message: 'Failed to parse AI response',
            error_code: 'PARSE_ERROR',
            details: parseError.message
          });
        }
      } catch (openAiError) {
        console.error('OpenAI API error:', openAiError.response?.status, openAiError.response?.data?.error || openAiError.message);
        return res.status(500).json({ 
          success: false, 
          message: 'Error communicating with AI service',
          error_code: 'AI_SERVICE_ERROR',
          details: openAiError.response?.data?.error?.message || openAiError.message
        });
      }
    } catch (processingError) {
      console.error('Error processing reviews:', processingError);
      return res.status(500).json({ 
        success: false, 
        message: 'Error processing review data',
        error_code: 'PROCESSING_ERROR',
        details: processingError.message
      });
    }
  } catch (error) {
    console.error('General error in analyze endpoint:', error.message);
    res.status(500).json({ 
      success: false, 
      message: "Failed to analyze reviews",
      error_code: 'GENERAL_ERROR',
      details: error.message
    });
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

router.get('/products/:productId', async (req, res) => {
  const { productId } = req.params;
  
  try {
    const product = await fetchProductById(productId);
    
    if (!product || Object.keys(product).length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
        error_code: 'PRODUCT_NOT_FOUND'
      });
    }
    
    res.json({
      success: true,
      message: 'Product details retrieved successfully',
      data: {
        product,
        timestamp: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch product details",
      error_code: 'GENERAL_ERROR',
      details: error.message
    });
  }
});

// New route to fetch related products for comparison
router.get('/products/:productId/related', async (req, res) => {
  const { productId } = req.params;
  
  try {
    // First, fetch the details of the current product to get its category
    const product = await fetchProductById(productId);
    
    if (!product || Object.keys(product).length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
        error_code: 'PRODUCT_NOT_FOUND'
      });
    }
    
    // Extract category information
    const categoryId = product.default_category?.id || 
                      product.categories?.[0]?.id || 
                      product.category?.id;
    
    if (!categoryId) {
      return res.status(404).json({
        success: false,
        message: 'Product category not found',
        error_code: 'CATEGORY_NOT_FOUND'
      });
    }
    
    // Fetch related products from the same category
    const API_URL = "https://api.soco.id/products";
    const FILTER_PARAMS = encodeURIComponent(
      JSON.stringify({
        "$or": [
          {"is_active_in_sociolla": true},
          {"is_active_in_review": true}
        ],
        "categories.id": categoryId,
        "id": {"$ne": productId}, // Exclude the current product
        "brand": {"$ne": null}
      })
    );
    
    const FULL_URL = `${API_URL}?filter=${FILTER_PARAMS}&limit=5&fields=id+brand+name+review_stats+combinations+images+default_category+parent_category+my_sociolla_sql_id+slug+default_combination`;
    
    const response = await axios.get(FULL_URL, {
      headers: {
        'accept': 'application/json',
        'soc-platform': 'review-web-mobile'
      }
    });
    
    if (!response.data?.data || !Array.isArray(response.data.data) || response.data.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No related products found',
        error_code: 'NO_RELATED_PRODUCTS'
      });
    }
    
    // Get the first related product
    const relatedProduct = response.data.data[0];
    
    // Fetch user data for profile matching
    const fetchUser = async () => {
      try {
        const apiUrl = 'https://api.soco.id/user/me';
        const filter = encodeURIComponent(JSON.stringify({ get_user_address: true }));
        const url = `${apiUrl}?filter=${filter}`;

        const apiClient = axios.create({
          timeout: 15000,
          withCredentials: false,
        });
        
        const response = await apiClient.get(url, {
          headers: {
            Authorization: `Bearer ${process.env.MY_BEARER_TOKEN}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          }
        });

        return response.data?.data || {};
      } catch (error) {
        console.error('Error fetching user data:', error.message);
        return {};
      }
    };
    
    // Fetch reviews for the product
    const fetchProductReviews = async (pid) => {
      const filterJson = JSON.stringify({
        "$and": [
          {
            "product_id": `${pid}`
          }
        ]
      });
      
      const baseUrl = 'https://api.soco.id/reviews';
      const url = `${baseUrl}?filter=${encodeURIComponent(filterJson)}&skip=0&limit=10`;
      
      const options = {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          Connection: 'keep-alive',
          'SOC-PLATFORM': 'review-web-mobile',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors'
        }
      };

      try {
        const response = await axios.get(url, options);
        return response.data?.data || [];
      } catch (error) {
        console.error("Error fetching reviews:", error.message);
        return [];
      }
    };
    
    // Process matching percentages for a product
    const processProductMatch = async (reviews, userAttributes, userBeautyProfile) => {
      if (!reviews || !reviews.length) {
        return {
          finalPercentage: 0,
          attributePercentages: {}
        };
      }

      // Count beauty profile attribute frequencies from all reviews
      const attributeFrequencies = {};
      const highlyRatedReviews = reviews.filter((review) => review.average_rating >= 4);

      // Extract beauty profiles from high-rated reviews
      highlyRatedReviews.forEach((review) => {
        let reviewerBeautyData = [];

        // First try using skin_types if available
        if (review.user?.skin_types && Array.isArray(review.user.skin_types)) {
          reviewerBeautyData = review.user.skin_types;
        } else if (review.user?.beauty && Array.isArray(review.user.beauty)) {
          // Then try using beauty field if available
          review.user.beauty.forEach((category) => {
            if (category.subtags && Array.isArray(category.subtags)) {
              category.subtags.forEach((subtag) => {
                reviewerBeautyData.push({
                  name: subtag.name,
                  category: category.name,
                });
              });
            }
          });
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

      // Find attributes that have significant presence
      const significantAttributes = Object.keys(attributeFrequencies)
        .filter((attr) => attributeFrequencies[attr] > 1)
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
          // Try to find a close match by normalizing strings
          const normalizedUserAttr = userAttr.toLowerCase().replace(/\s+/g, '').trim();
          const matchedAttr = significantAttributes.find((attr) => {
            const normalizedAttr = attr.toLowerCase().replace(/\s+/g, '').trim();
            return normalizedUserAttr === normalizedAttr;
          });

          if (matchedAttr) {
            matchedAttributes++;
            const attrWeight = attributeFrequencies[matchedAttr] || 0;
            totalWeightedScore += attrWeight;

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
        return {
          finalPercentage: 0,
          attributePercentages: {}
        };
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
          const percentage = Math.round((attrFrequency / totalFrequency) * 100);

          // Store the percentage using the original attribute name
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

      return {
        finalPercentage,
        attributePercentages
      };
    };
    
    // Get user profile and calculate product matching
    const user = await fetchUser();
    const userBeautyProfile = user.beauty || [];
    
    // Prepare user's beauty attributes map
    const userAttributes = {};
    if (userBeautyProfile && userBeautyProfile.length) {
      userBeautyProfile.forEach((category) => {
        if (category.subtags && category.subtags.length) {
          userAttributes[category.name] = category.subtags.map((subtag) => subtag.name.toLowerCase());
        }
      });
    }
    
    // Get reviews for both products
    const reviews1 = await fetchProductReviews(productId);
    const reviews2 = await fetchProductReviews(relatedProduct.id);
    
    // Calculate matching percentages based on user profile if available
    let product1Data, product2Data;
    
    if (Object.keys(userAttributes).length > 0) {
      // Use user profile for personalized matching
      product1Data = await processProductMatch(reviews1, userAttributes, userBeautyProfile);
      product2Data = await processProductMatch(reviews2, userAttributes, userBeautyProfile);
    } else {
      // Calculate based on review data when no user profile is available
      product1Data = calculateProductRatingMatch(reviews1);
      product2Data = calculateProductRatingMatch(reviews2);
    }
    
    // Format the response for comparison
    const comparisonData = {
      product1: {
        product_id: productId,
        matching_percentage: product1Data.finalPercentage,
        attribute_percentages: product1Data.attributePercentages
      },
      product2: {
        product_id: relatedProduct.id,
        matching_percentage: product2Data.finalPercentage,
        attribute_percentages: product2Data.attributePercentages
      }
    };
    
    res.json({
      success: true,
      message: 'Related product comparison data retrieved successfully',
      data: comparisonData,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('Error fetching related products:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch related products",
      error_code: 'GENERAL_ERROR',
      details: error.message
    });
  }
});

/**
 * Calculate product matching data based on review ratings when user profile is unavailable
 * @param {Array} reviews - Product reviews
 * @returns {Object} Matching data with percentages based on ratings
 */
function calculateProductRatingMatch(reviews) {
  if (!reviews || reviews.length === 0) {
    return {
      finalPercentage: 70, // Default baseline percentage
      attributePercentages: {
        "Texture": 70,
        "Value for Money": 70,
        "Effectiveness": 70
      }
    };
  }
  
  // Extract ratings from reviews
  const ratings = {
    overall: 0,
    texture: 0,
    valueForMoney: 0,
    effectiveness: 0,
    packaging: 0,
    count: {
      texture: 0,
      valueForMoney: 0,
      effectiveness: 0,
      packaging: 0
    }
  };
  
  // Calculate average ratings
  reviews.forEach(review => {
    if (review.average_rating) {
      ratings.overall += review.average_rating;
    }
    
    if (review.star_texture) {
      ratings.texture += review.star_texture;
      ratings.count.texture++;
    }
    
    if (review.star_value_for_money) {
      ratings.valueForMoney += review.star_value_for_money;
      ratings.count.valueForMoney++;
    }
    
    if (review.star_effectiveness) {
      ratings.effectiveness += review.star_effectiveness;
      ratings.count.effectiveness++;
    } else if (review.star_long_wear) {
      // Use long_wear as fallback for effectiveness
      ratings.effectiveness += review.star_long_wear;
      ratings.count.effectiveness++;
    }
    
    if (review.star_packaging) {
      ratings.packaging += review.star_packaging;
      ratings.count.packaging++;
    }
  });
  
  // Calculate average ratings
  const avgOverall = reviews.length > 0 ? ratings.overall / reviews.length : 0;
  const avgTexture = ratings.count.texture > 0 ? ratings.texture / ratings.count.texture : 0;
  const avgValueForMoney = ratings.count.valueForMoney > 0 ? ratings.valueForMoney / ratings.count.valueForMoney : 0;
  const avgEffectiveness = ratings.count.effectiveness > 0 ? ratings.effectiveness / ratings.count.effectiveness : 0;
  const avgPackaging = ratings.count.packaging > 0 ? ratings.packaging / ratings.count.packaging : 0;
  
  // Convert ratings to percentages (5 star = 100%)
  const finalPercentage = Math.round((avgOverall / 5) * 100);
  const attributePercentages = {
    "Texture": Math.round((avgTexture / 5) * 100),
    "Value for Money": Math.round((avgValueForMoney / 5) * 100),
    "Effectiveness": Math.round((avgEffectiveness / 5) * 100)
  };
  
  // Add packaging if available
  if (avgPackaging > 0) {
    attributePercentages["Packaging"] = Math.round((avgPackaging / 5) * 100);
  }
  
  // Add recommendation percentage if available
  const recommendCount = reviews.filter(review => review.is_recommended === true || review.is_recommended === "yes").length;
  if (reviews.length > 0) {
    attributePercentages["Recommendation"] = Math.round((recommendCount / reviews.length) * 100);
  }
  
  return {
    finalPercentage: finalPercentage || 70, // Fallback to 70% if calculation fails
    attributePercentages: attributePercentages
  };
}

module.exports = router; 