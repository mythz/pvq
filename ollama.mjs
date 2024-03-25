import fs from "fs";
import path from "path";

const systemDefault = { "role":"system", "content":"You are a friendly AI Assistant that helps answer developer questions" }
const temperatureDefault = 0.7
const maxTokensDefault = 2048
const baseUrlDefault = 'http://localhost'

// Read the .env file
const envFile = path.join('./', '.env');
const envData = fs.readFileSync(envFile, { encoding: 'utf-8' });

// Parse the environment variables
const envLines = envData.split('\n');
for (const line of envLines) {
    const [key, value] = line.trim().split('=');
    if (key && value) {
        process.env[key] = value;
    }
}

const providerUrlMapping = {
    "groq": { "url": "https://api.groq.com/openai"},
    "openai": { "url": "https://api.openai.com"},
    "ollama": { "url": "http://localhost", "port": "11434"},
    "mistral": { "url": "https://api.mistral.ai"}
};

function askOllama(messages, model,temperature, max_tokens, provider = 'ollama', port = null) {
    if(!temperature) temperature = temperatureDefault
    if(!max_tokens) max_tokens = maxTokensDefault
    let base_url = providerUrlMapping[provider].url
    let portStr = port ?? providerUrlMapping[provider].port
    base_url = portStr == null ? base_url : `${base_url}:${portStr}`

    let fullUrl = `${base_url}/v1/chat/completions`
    console.log(fullUrl)
    return fetch(fullUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                messages: messages,
                temperature,
                model,
                max_tokens,
                stream: false,
            })
        })
}

export default askOllama;