const express = require('express');
const router = express.Router();
const axios = require("axios");


const fetchProduct = async () => {
    const FULL_URL = `https://api.soco.id/products/featured/trending`;
  
    try {
      const response = await axios.get(FULL_URL, {
        params: {
          limit: 5,
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
    console.log('reviews', reviews);
    
    // Extract detailed information for the prompt
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
    
    const prompt = `Summarize these product reviews:\n\n${reviewsText}`;
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

Fokus pada menghasilkan field review_summary dan review_effects yang akurat, informatif, dan relevan dengan produk yang diulas. Gunakan data rating khusus (texture, long_wear, dll) untuk memperkaya insight Anda.`,
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