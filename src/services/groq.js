import axios from 'axios';

const GROQ_API_URL = 'https://api.groq.com/openai/v1';

export const transcribeAudio = async (file, apiKey) => {
    if (!apiKey) throw new Error("Groq API Key is missing. Please add it in settings.");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("response_format", "verbose_json");

    try {
        const response = await axios.post(`${GROQ_API_URL}/audio/transcriptions`, formData, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    } catch (error) {
        console.error("Groq Transcription Error:", error);
        throw new Error(error.response?.data?.error?.message || "Failed to transcribe audio with Groq.");
    }
};

export const extractKeywords = async (transcript, apiKey) => {
    if (!apiKey) throw new Error("Groq API Key is missing.");

    try {
        const response = await axios.post(
            `${GROQ_API_URL}/chat/completions`,
            {
                model: "llama-3.3-70b-versatile",
                messages: [
                    {
                        role: "system",
                        content: "You are a creative director. Analyze the transcript and extract 5-8 distinct visual concepts or keywords that would make good stock footage to illustrate the content. Return ONLY a JSON array of strings, e.g., [\"sunny beach\", \"office meeting\", \"coding laptop\"]. Do not add any markdown formatting or explanation."
                    },
                    {
                        role: "user",
                        content: `Transcript: "${transcript}"`
                    }
                ],
                temperature: 0.5,
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const content = response.data.choices[0].message.content;
        // Clean up markdown just in case
        const jsonString = content.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Groq Keyword Extraction Error:", error);
        throw new Error(error.response?.data?.error?.message || "Failed to extract keywords with Groq.");
    }
};

export const generateScript = async (topic, apiKey, options = {}) => {
    if (!apiKey) throw new Error("Groq API Key is missing.");

    const { language = "English", tone = "Engaging", wordCount = 100 } = options;
    const wordCountInstruction = wordCount ? `Length: Approximately ${wordCount} words.` : "Length: 30-60 seconds.";

    const systemPrompt = `You are a viral content scriptwriter. Create a video script about the user's topic.
    
    Directives:
    - Topic: "${topic}"
    - Language: ${language} (If "Hinglish", use a mix of Hindi and English natural for Indian social media).
    - Tone: ${tone}
    - ${wordCountInstruction}
    
    Format: [HOOK], [BODY], [CTA].
    Do not include camera directions, just the spoken script.`;

    try {
        const response = await axios.post(
            `${GROQ_API_URL}/chat/completions`,
            {
                model: "llama-3.3-70b-versatile",
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: `Write the script.`
                    }
                ],
                temperature: 0.8,
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error("Groq Script Gen Error:", error);
        throw new Error(error.response?.data?.error?.message || "Failed to generate script.");
    }
};
