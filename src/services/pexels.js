import axios from 'axios';

const PEXELS_API_URL = 'https://api.pexels.com/videos/search';

export const searchStockFootage = async (query, apiKey) => {
    if (!apiKey) throw new Error("Pexels API Key is missing. Please add it in settings.");

    try {
        const response = await axios.get(PEXELS_API_URL, {
            headers: {
                'Authorization': apiKey,
            },
            params: {
                query: query,
                per_page: 3, // Get top 3 results per keyword
                orientation: 'landscape',
                size: 'medium'
            },
        });
        return response.data.videos;
    } catch (error) {
        console.error("Pexels Search Error:", error);
        return []; // Return empty array on failure to avoid crashing entire result set
    }
};
