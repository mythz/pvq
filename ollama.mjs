import fs from "fs";
import path from "path";

const systemDefault = { "role":"system", "content":"You are a friendly AI Assistant that helps answer developer questions" }
const temperatureDefault = 0.7
const maxTokensDefault = -1
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

function askOllama(system, user, model, port, temperature, max_tokens, base_url) {
    if(!system) system = systemDefault
    if(!temperature) temperature = temperatureDefault
    if(!max_tokens) max_tokens = maxTokensDefault
    if(!port) port = 11434
    if(!base_url) base_url = baseUrlDefault

    if(base_url === baseUrlDefault)
        base_url += `:${port}`
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
                messages: [
                    {role: 'system', content: system},
                    {role: 'user', content: user},
                ],
                temperature,
                model,
                max_tokens,
                stream: false,
            })
        })
}

export default askOllama;