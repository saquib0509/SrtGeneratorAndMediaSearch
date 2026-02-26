import axios from 'axios';

const OPENAI_API_URL = 'https://api.openai.com/v1';

export const transcribeAudio = async (file, apiKey) => {
    if (!apiKey) throw new Error("OpenAI API Key is missing. Please add it in settings.");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("model", "whisper-1");

    try {
        const response = await axios.post(`${OPENAI_API_URL}/audio/transcriptions`, formData, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data.text;
    } catch (error) {
        console.error("Transcription Error:", error);
        throw new Error(error.response?.data?.error?.message || "Failed to transcribe audio.");
    }
};

export const extractKeywords = async (transcript, apiKey) => {
    if (!apiKey) throw new Error("OpenAI API Key is missing.");

    try {
        const response = await axios.post(
            `${OPENAI_API_URL}/chat/completions`,
            {
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "You are a creative director. Analyze the transcript and extract 5-8 distinct visual concepts or keywords that would make good stock footage to illustrate the content. Return ONLY a JSON array of strings, e.g., [\"sunny beach\", \"office meeting\", \"coding laptop\"]."
                    },
                    {
                        role: "user",
                        content: `Transcript: "${transcript}"`
                    }
                ],
                temperature: 0.7,
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const content = response.data.choices[0].message.content;
        // Clean up markdown code blocks if present
        const jsonString = content.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Keyword Extraction Error:", error);
        throw new Error(error.response?.data?.error?.message || "Failed to extract keywords.");
    }
};
