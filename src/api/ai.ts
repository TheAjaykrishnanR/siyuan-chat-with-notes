export interface AIConfig {
    provider: string;
    apiKey: string;
    model: string;
}

export async function* streamMessage(config: AIConfig, messages: any[], signal?: AbortSignal) {
    switch (config.provider) {
        case 'openai':
            yield* chatOpenAIStream(config, messages, signal);
            break;
        case 'anthropic':
            yield* chatAnthropicStream(config, messages, signal);
            break;
        case 'gemini':
            yield* chatGeminiStream(config, messages, signal);
            break;
        case 'deepseek':
            yield* chatDeepSeekStream(config, messages, signal);
            break;
        default:
            throw new Error(`Unsupported provider: ${config.provider}`);
    }
}

export async function fetchModels(provider: string, apiKey: string): Promise<string[]> {
    if (!apiKey) return [];
    
    try {
        switch (provider) {
            case 'openai':
                return await fetchOpenAIModels(apiKey);
            case 'anthropic':
                return ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'];
            case 'gemini':
                return await fetchGeminiModels(apiKey);
            case 'deepseek':
                return await fetchDeepSeekModels(apiKey);
            default:
                return [];
        }
    } catch (error) {
        console.error(`Error fetching models for ${provider}:`, error);
        return [];
    }
}

async function fetchOpenAIModels(apiKey: string) {
    const response = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await response.json();
    if (data.error) return [];
    return data.data
        .filter((m: any) => m.id.startsWith('gpt-'))
        .map((m: any) => m.id)
        .sort();
}

async function fetchGeminiModels(apiKey: string) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    if (data.error) return [];
    return data.models
        .filter((m: any) => m.supportedGenerationMethods.includes('generateContent'))
        .map((m: any) => m.name.replace('models/', ''))
        .sort();
}

async function fetchDeepSeekModels(apiKey: string) {
    const response = await fetch('https://api.deepseek.com/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await response.json();
    if (!data.data) return ['deepseek-chat', 'deepseek-coder'];
    return data.data.map((m: any) => m.id).sort();
}

async function* chatOpenAIStream(config: AIConfig, messages: any[], signal?: AbortSignal) {
    const formattedMessages = messages.map(m => {
        if (m.role === 'user' && m.images && m.images.length > 0) {
            return {
                role: m.role,
                content: [
                    { type: 'text', text: m.content },
                    ...m.images.map((img: string) => ({
                        type: 'image_url',
                        image_url: { url: img }
                    }))
                ]
            };
        }
        return { role: m.role, content: m.content };
    });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
            model: config.model,
            messages: formattedMessages,
            stream: true
        }),
        signal
    });
    
    yield* processOpenAIStream(response);
}

async function* chatDeepSeekStream(config: AIConfig, messages: any[], signal?: AbortSignal) {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
            model: config.model,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            stream: true
        }),
        signal
    });
    
    yield* processOpenAIStream(response);
}

async function* processOpenAIStream(response: Response) {
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || response.statusText);
    }
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder("utf-8");
    if (!reader) throw new Error("No body in response");
    
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
            const message = line.replace(/^data: /, "").trim();
            if (!message) continue;
            if (message === "[DONE]") return;
            try {
                const parsed = JSON.parse(message);
                if (parsed.choices && parsed.choices[0].delta?.content) {
                    yield parsed.choices[0].delta.content;
                }
            } catch(e) {}
        }
    }
}

async function* chatAnthropicStream(config: AIConfig, messages: any[], signal?: AbortSignal) {
    const formattedMessages = messages.filter(m => m.role !== 'system').map(m => {
        if (m.role === 'user' && m.images && m.images.length > 0) {
            return {
                role: m.role,
                content: [
                    { type: 'text', text: m.content },
                    ...m.images.map((img: string) => {
                        const [header, data] = img.split(',');
                        const media_type = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
                        return {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type,
                                data
                            }
                        };
                    })
                ]
            };
        }
        return { role: m.role, content: m.content };
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
            'dangerously-allow-browser': 'true'
        },
        body: JSON.stringify({
            model: config.model,
            max_tokens: 4096,
            messages: formattedMessages,
            system: messages.find(m => m.role === 'system')?.content,
            stream: true
        }),
        signal
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || response.statusText);
    }
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder("utf-8");
    if (!reader) throw new Error("No body in response");
    
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
            if (line.startsWith("data: ")) {
                const message = line.replace(/^data: /, "").trim();
                if (!message || message === "[DONE]") continue;
                try {
                    const parsed = JSON.parse(message);
                    if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                        yield parsed.delta.text;
                    }
                } catch(e) {}
            }
        }
    }
}

async function* chatGeminiStream(config: AIConfig, messages: any[], signal?: AbortSignal) {
    const contents = messages.map(m => {
        const parts: any[] = [{ text: m.content }];
        if (m.role === 'user' && m.images && m.images.length > 0) {
            m.images.forEach((img: string) => {
                const [header, data] = img.split(',');
                const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
                parts.push({
                    inlineData: {
                        mimeType,
                        data
                    }
                });
            });
        }
        return {
            role: m.role === 'assistant' ? 'model' : 'user',
            parts
        };
    });

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:streamGenerateContent?alt=sse&key=${config.apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents
        }),
        signal
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || response.statusText);
    }
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder("utf-8");
    if (!reader) throw new Error("No body in response");
    
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
            const message = line.replace(/^data: /, "").trim();
            if (!message) continue;
            if (message === "[DONE]") return;
            try {
                const parsed = JSON.parse(message);
                if (parsed.candidates && parsed.candidates[0].content?.parts && parsed.candidates[0].content.parts.length > 0) {
                    yield parsed.candidates[0].content.parts[0].text;
                }
            } catch(e) {}
        }
    }
}
