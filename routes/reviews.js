const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * Fetch user data from Soco accounts API
 * @param {string} userId - User ID
 * @param {object} authHeader - Authorization header from request
 * @returns {Promise<object>} User data
 */
const fetchUser = async (authHeader) => {
    try {
        // const apiUrl = 'https://uat-ms-soco-public-api.sociolabs.io/user/me';
        const apiUrl = 'https://api.soco.id/user/me';
        const filter = encodeURIComponent(JSON.stringify({ get_user_address: true }));
        const url = `${apiUrl}?filter=${filter}`;

        // Create a custom axios instance with specific configuration
        const apiClient = axios.create({
            timeout: 15000, // 15 second timeout
            withCredentials: false, // Don't send cookies
        });

        console.log('Making user API request to:', url);
        
        const response = await apiClient.get(url, {
            headers: {
                Authorization: authHeader,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                // Add a user agent to make the request look more like a browser
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        });

        console.log('User API response status:', response.status);
        return response.data?.data || {};
    } catch (error) {
        // More detailed error logging
        console.error('Error fetching user data:', error.message);
        
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error('Error response data:', error.response.data);
            console.error('Error response status:', error.response.status);
            console.error('Error response headers:', error.response.headers);
        } else if (error.request) {
            // The request was made but no response was received
            console.error('No response received from server:', error.request);
        }
        
        // Return an empty object instead of throwing an error
        // This prevents the API from failing completely when user data can't be retrieved
        return {};
    }
};

const fetchReviews = async (id) => {
    // Use the exact filter structure from the working example
    // Notice we're using the number (not string) format for product_id in the JSON
    const filterJson = JSON.stringify({
        "$and": [
            {
                "product_id": `${id}` // Convert to string
            }
        ]
    });
    
    // Create the exact same URL as the working example
    // const baseUrl = 'https://uat-ms-soco-public-api.sociolabs.io/reviews';
    const baseUrl = 'https://api.soco.id/reviews';
    const url = `${baseUrl}?filter=${encodeURIComponent(filterJson)}&skip=0&limit=10`;
    
    const options = {
        headers: {
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            Connection: 'keep-alive',
            DNT: '1',
            'SOC-PLATFORM': 'review-web-mobile',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors'
        }
    };

    try {
        // Using axios but with the full URL instead of params
        const response = await axios.get(url, options);
        console.log("Reviews API response:", response.data);
        const reviews = response.data?.data || []; // Ensure data exists
        return reviews;
    } catch (error) {
        console.error("Error fetching reviews:", error.message);
        if (error.response) {
            console.error("Error response:", error.response.data);
        }
        return [];
    }
};

/**
 * @route   GET /api/reviews/matching-percentage
 * @desc    Get the matching percentage for reviews
 * @access  Public
 */
router.get('/matching-percentage', async (req, res) => {
    try {
        // Get product ID from query params
        const { productId } = req.query;
        
        if (!productId) {
            return res.status(400).json({
                success: false,
                message: 'Product ID is required'
            });
        }
        
        // Get user's beauty profile
        const user = await fetchUser(req.headers.authorization);
        const userBeautyProfile = user.beauty || [];

        // Check if user data was successfully retrieved
        if (Object.keys(user).length === 0) {
            return res.json({
                matching_percentage: 0,
                message: 'Unable to retrieve user data',
                details: {},
                success: true
            });
        }

        if (!userBeautyProfile || !userBeautyProfile.length) {
            return res.json({
                matching_percentage: 0,
                message: 'User has no beauty profile',
                details: {},
                success: true
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

        const reviews = await fetchReviews(productId);

        if (!reviews || !reviews.length) {
            return {
                matching_percentage: 0,
                message: 'No reviews found for this product',
                details: {},
            };
        }

        // Count beauty profile attribute frequencies from all reviews
        const attributeFrequencies = {};
        const highlyRatedReviews = reviews.filter((review) => review.average_rating >= 4);

        // Extract beauty profiles from high-rated reviews
        highlyRatedReviews.forEach((review) => {
            // Handle different structures of beauty data in reviews
            let reviewerBeautyData = [];

            // First try using skin_types if available
            if (review.user?.skin_types && Array.isArray(review.user.skin_types)) {
                reviewerBeautyData = review.user.skin_types;
            } else if (review.user?.beauty && Array.isArray(review.user.beauty)) {
                // Then try using beauty field if availablekkkkk
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
            return {
                matching_percentage: 0,
                message: 'User has no relevant beauty attributes for this product',
                details: {
                    user_attributes: flatUserAttributes,
                    significant_attributes: significantAttributes,
                    attribute_frequencies: attributeFrequencies,
                },
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

        res.json({
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
        res.status(500).json({
            success: false,
            message: 'Error calculating matching percentage',
            error: error.message
        });
    }
});

router.get('/analyze', async (req, res) => {
    // This route will handle review analysis functionality

    try {
        const { productId } = req.query;
        
        if (!productId) {
            return res.status(400).json({
                success: false,
                message: 'Product ID is required'
            });
        }

        const reviews = await fetchReviews(productId);

        const reviewsText = reviews.map((r) => ({
            detail: r.detail,
            user: r.user,
            is_recommended: r.is_recommended,
         is_repurchase: r.is_repurchase,
            average_rating: r.average_rating,
            created_at: r.created_at,
        }));
        const prompt = `Summarize these product reviews:\n\n${JSON.stringify(reviewsText)}`;
        console.log(reviewsText, 'reviewsText');

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'merangkum ulasan produk. Berikan ringkasan yang terstruktur dengan kelebihan dan kekurangan. Refer to the customers as "Bestie", e.g. Besties menyukai produk ini karena...',
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

/**
 * @route   GET /api/reviews/compare
 * @desc    Compare matching percentages for multiple products
 * @access  Public
 */
router.get('/compare', async (req, res) => {
    try {
        const { productId1, productId2 } = req.query;

        if (!productId1 || !productId2) {
            return res.status(400).json({ 
                success: false, 
                message: 'Two product IDs are required for comparison'
            });
        }

        // Get user's beauty profile
        const user = await fetchUser(req.headers.authorization);
        const userBeautyProfile = user.beauty || [];
        
        // Check if user data was successfully retrieved
        if (Object.keys(user).length === 0) {
            return res.status(200).json({
                success: true,
                message: 'Unable to retrieve user data',
                data: {
                    product1: { attribute_percentages: {} },
                    product2: { attribute_percentages: {} }
                }
            });
        }

        if (!userBeautyProfile || !userBeautyProfile.length) {
            return res.status(200).json({
                success: true,
                message: 'User has no beauty profile',
                data: {
                    product1: { attribute_percentages: {} },
                    product2: { attribute_percentages: {} }
                }
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

        // Get reviews for both products
        const reviews1 = await fetchReviews(productId1);
        const reviews2 = await fetchReviews(productId2);

        // Process data for both products
        const product1Data = await processProductMatch(reviews1, userAttributes, userBeautyProfile);
        const product2Data = await processProductMatch(reviews2, userAttributes, userBeautyProfile);

        res.json({
            success: true,
            message: 'Product comparison completed',
            data: {
                product1: {
                    product_id: productId1,
                    matching_percentage: product1Data.finalPercentage,
                    attribute_percentages: product1Data.attributePercentages
                },
                product2: {
                    product_id: productId2,
                    matching_percentage: product2Data.finalPercentage,
                    attribute_percentages: product2Data.attributePercentages
                }
            }
        });
    } catch (error) {
        console.error('Error calculating comparison:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to compare products',
            error: error.message
        });
    }
});

/**
 * Process product matching data
 * @param {Array} reviews - Product reviews
 * @param {Object} userAttributes - User beauty attributes
 * @param {Array} userBeautyProfile - User beauty profile
 * @returns {Object} Matching data
 */
async function processProductMatch(reviews, userAttributes, userBeautyProfile) {
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
        // Handle different structures of beauty data in reviews
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

    return {
        finalPercentage,
        attributePercentages
    };
}

module.exports = router; 