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
        const apiUrl = 'https://accounts-api.soco.id/user/me';
        const filter = encodeURIComponent(JSON.stringify({ get_user_address: true }));
        const url = `${apiUrl}?filter=${filter}`;

        const response = await axios.get(url, {
            headers: {
                Authorization: authHeader
            }
        });

        return response.data?.data || {};
    } catch (error) {
        console.error('Error fetching user data:', error.message);
        throw new Error('Failed to fetch user data');
    }
};

const fetchReviews = async (id) => {
    const API_URL = "https://api.soco.id/reviews";
    const FILTER_PARAMS = encodeURIComponent(
        JSON.stringify({
            is_published: true,
            elastic_search: true,
            product_id: id,
            is_highlight: true
        })
    );

    const FULL_URL = `${API_URL}?filter=${FILTER_PARAMS}&skip=0&limit=6&sort=most_relevant`;

    try {
        const response = await axios.get(FULL_URL);
        const reviews = response.data?.data || []; // Ensure data exists

        return reviews;
    } catch (error) {
        console.error("Error fetching reviews:", error.message);
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
        // Get user's beauty profile
        let userBeautyProfile = null;
        try {
            const user = await fetchUser(req.headers.authorization);
            userBeautyProfile = user.beauty || [];
        } catch (error) {
            throw new Errors.NotFoundError(Errors.CODES.ERR_USER_NOT_FOUND, 'User not found');
        }

        if (!userBeautyProfile || !userBeautyProfile.length) {
            return {
                matching_percentage: 0,
                message: 'User has no beauty profile',
                details: {},
            };
        }

        // Prepare user's beauty attributes map for easy comparison
        const userAttributes = {};
        userBeautyProfile.forEach((category) => {
            if (category.subtags && category.subtags.length) {
                // Map category (like 'jenis-kulit', 'warna-kulit', etc) to its values
                userAttributes[category.name] = category.subtags.map((subtag) => subtag.name.toLowerCase());
            }
        });

        const reviews = await fetchReviews(req.params.productId);

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
        throw error;
    }
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
        console.log(reviewsText, 'reviewsText');

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