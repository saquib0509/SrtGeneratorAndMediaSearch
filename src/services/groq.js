import axios from 'axios';

const GROQ_API_URL = 'https://api.groq.com/openai/v1';

export const transcribeAudio = async (file, apiKey, language = null) => {
    if (!apiKey) throw new Error("Groq API Key is missing. Please add it in settings.");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("response_format", "verbose_json");
    if (language) formData.append("language", language); // e.g. 'hi' for Hindi

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

export const transliterateToHinglish = async (segments, apiKey) => {
    if (!apiKey) throw new Error("Groq API Key is missing.");
    // Batch all segment texts, separated by a unique delimiter
    const SEP = '\n|||SEP|||\n';
    const batch = segments.map(s => s.text.trim()).join(SEP);

    const response = await axios.post(
        `${GROQ_API_URL}/chat/completions`,
        {
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content: `You are a Hindi-to-Hinglish transliterator. Convert each Hindi text chunk from Devanagari script into Hinglish (Hindi words written in Roman/English letters, as spoken naturally in Indian social media). Keep the same meaning and conversational flow. 
Rules:
- Do NOT translate to English — only transliterate sounds to Roman letters.
- Preserve the "|||SEP|||" separator lines between chunks exactly.
- Return ONLY the transliterated chunks with separators, no extra text.`
                },
                { role: "user", content: batch }
            ],
            temperature: 0.2,
        },
        { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
    );

    const result = response.data.choices[0].message.content;
    const transliterated = result.split('|||SEP|||').map(t => t.trim());
    return segments.map((seg, i) => ({ ...seg, text: transliterated[i] || seg.text }));
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
