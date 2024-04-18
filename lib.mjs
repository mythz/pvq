import fs from "fs"
import path from "path"

let BASE_URL = `https://pvq.app`
const SYSTEM_PROMPT = { "role":"system", "content":"You are a friendly AI Assistant that helps answer developer questions. Think step by step and assist the user with their question, ensuring that your answer is relevant, on topic and provides actionable advice with code examples as appropriate." }
let ModelProviders = {}

export function openAiDefaults() {
    return {
        temperature: 0.7,
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 2048,
    }
}

const ProviderApis = {
    'groq':      apiPath => `https://api.groq.com/openai${apiPath}`,
    'mistral':   apiPath => `https://api.mistral.ai${apiPath}`,
    'openai':    apiPath => `https://api.openai.com${apiPath}`,
    'anthropic': apiPath => `https://api.anthropic.com/v1/messages`,
    'google':    apiPath => 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
}

export function openAiUrl(model,port) {
    let provider = ModelProviders[model]
    const apiPath = '/v1/chat/completions'
    const fn = ProviderApis[provider]
    if (fn) {
        return fn(apiPath)
    }
    return (process.env.OLLAMA_URL == null ? `http://localhost:${port ?? '11434'}` : `${process.env.OLLAMA_URL}`) + `${apiPath}`
}

export function openAiApiKey(model) {
    let provider = ModelProviders[model]
    return provider === 'groq'
        ? process.env.GROQ_API_KEY
        : provider === 'mistral'
            ? process.env.MISTRAL_API_KEY
            : provider === 'openai'
                ? process.env.OPENAI_API_KEY
                : provider === 'google'
                    ? new Date().valueOf() % 2 == 0 ? process.env.GOOGLE_API_KEY : (process.env.GOOGLE_API_KEY2 || process.env.GOOGLE_API_KEY)
                    : provider === 'anthropic'
                        ? process.env.ANTHROPIC_API_KEY
                        : provider === 'cohere'
                            ? process.env.COHERE_API_KEY
                            : null
}

// Converts API model names to their model usernames in pvq.app
export function openAiFromModel(model) {
    const mapping = {
        'claude-3-haiku-20240307':  'claude3-haiku',
        'claude-3-sonnet-20240229': 'claude3-sonnet',
        'claude-3-opus-20240229':   'claude3-opus',
        'claude-3-haiku':           'claude3-haiku',
        'claude-3-sonnet':          'claude3-sonnet',
        'claude-3-opus':            'claude3-opus',
        'deepseek-coder-6.7b':      'deepseek-coder',
        'mixtral-8x7b-32768':       'mixtral',
        'gemma-7b-it':              'gemma',
        'gpt-4-turbo-preview':      'gpt4-turbo',
        'gpt-4-0125-preview':       'gpt4-turbo',
        'open-mixtral-8x7b':        'mixtral',
    }
    return mapping[model] ?? model
}

export function extractIdFromPath(path) {
    // remove 'questions' or 'meta' prefix
    let idPath = path.replace('questions/', '').replace('meta/', '')
    // remove '.json' suffix
    idPath = idPath.replace('.json', '')
    // Truncate string by splitting on last . and taking the first part
    idPath = leftPart(idPath, '.')
    // remove any remaining slashes
    idPath = idPath.replaceAll('/', '')
    // parse the id as an integer
    return parseInt(idPath)
}

export function openAiModel(model) {
    let provider = ModelProviders[model]
    // console.log('provider', provider, model, ModelProviders)
    if (provider === 'groq') {
        const mapping = {
            mixtral: `mixtral-8x7b-32768`,
            gemma: `gemma-7b-it`
        }
        return mapping[model] ?? model
    } else if (provider === 'mistral') {
        const mapping = {
            'mixtral': 'open-mixtral-8x7b',
        }
        return mapping[model] ?? model
    } else if (provider === 'openai') {
        const mapping = {
            'gpt-4-turbo': 'gpt-4-turbo-preview',
        }
        return mapping[model] ?? model
    } else if (provider === 'anthropic') {
        const mapping = {
            'claude-3-haiku':  'claude-3-haiku-20240307',
            'claude-3-sonnet': 'claude-3-sonnet-20240229',
            'claude-3-opus':   'claude-3-opus-20240229',
        }
        return mapping[model] ?? model
    }
    return model
}

export function openAiResponse(txt, model) {
    let res = null
    try {
        res = JSON.parse(txt)
    } catch(e) {
        console.log('Failed to parse response', e)
        console.log(txt)
        return null
    }

    const created = Math.floor(new Date().getTime() / 1000)

    let provider = ModelProviders[model]
    if (provider === 'google') {
        try {
            const content = res.candidates?.[0]?.content?.parts?.[0]?.text
            if (!content) {
                console.log('google missing response: ')
                console.log(txt)
                return null
            }
            res.candidates[0].content.parts[0].text = '${choices[0].message.content}'
            const finish_reason = res.candidates[0].finishReason || 'stop'

            res.id = `chatcmpl-${created}`
            res.object = 'chat.completion'
            res.created = created
            res.model = model
            res.choices = [{
                index: 0, 
                message: {
                    role: 'assistant',
                    content,
                },
                finish_reason,
            }]
        } catch(e) {
            console.log('google response error', e, res)
            throw e
        }
    } else if (provider === 'cohere') {
        const content = res.text
        res.message = '${choices[0].message.content}'
        res.id = `chatcmpl-${created}`
        res.object = 'chat.completion'
        res.created = created
        res.choices = [{
            index: 0,
            message: {
                role: 'assistant',
                content,
            },
            finish_reason: 'stop'
        }]
    } else if (provider === 'anthropic') {
        const content = res.content[0].text
        res.content[0].text = '${choices[0].message.content}'
        res.id = `chatcmpl-${created}`
        res.object = 'chat.completion'
        res.created = created
        res.choices = [{
            index: 0, 
            message: {
                role: 'assistant',
                content,
            },
            finish_reason: 'stop'
        }]
    }
    return res
}

async function openAi(opt) {
    opt = opt ?? {}
    const { content, model, port } = opt
    if (!content) throw new Error('content requred')
    if (!model) throw new Error('model requred')
    const defaults = openAiDefaults()
    const temperature = opt.temperature ?? defaults.temperature
    const systemPrompt = opt.systemPrompt ?? defaults.systemPrompt
    const max_tokens = opt.maxTokens ?? defaults.maxTokens    
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }
    const apiKey = openAiApiKey(model)
    // console.log('headers', headers)
    const messages = opt.messages ?? []

    let provider = ModelProviders[model]
    if (provider === 'google') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`
        console.log(`POST ${lastLeftPart(url,'?')}`)
        return await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                "contents": [{
                  "parts":[
                        {"text": content}
                    ]
                }],
                safetySettings: [
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_ONLY_HIGH"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_ONLY_HIGH"
                    },
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_ONLY_HIGH"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_ONLY_HIGH"
                    },
                ],
                generationConfig: {
                    temperature: temperature,
                    maxOutputTokens: max_tokens,
                }
            }),
            // signal: AbortSignal.timeout(60 * 1000), // Doesn't work
        })
    } else if (provider === 'cohere') {
        const url = `https://api.cohere.ai/v1/chat`
        headers['Authorization'] = `Bearer ${apiKey}`
        // Change messages roles from "assistant" to "CHATBOT","user" to "USER" and "system" to "SYSTEM"
        messages.forEach(m => {
            if (m.role === 'assistant') m.role = 'CHATBOT'
            if (m.role === 'user') m.role = 'USER'
            if (m.role === 'system') m.role = 'SYSTEM'
        })
        // Change `content` to `message` for previous messages
        messages.forEach(m => {
            m.message = m.content
            delete m.content
        })
        if(systemPrompt)
            messages.push({role: 'SYSTEM', message: systemPrompt.content})
        let body = {
            chat_history:messages,
            message: content,
            temperature,
            max_tokens,
        }
        // Add the new message
        return await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            // signal: AbortSignal.timeout(60 * 1000),
        })
    } else if (provider === 'anthropic') {
        if (apiKey) {
            headers['x-api-key'] = apiKey
        }
        headers['anthropic-version'] = '2023-06-01'

        messages.push({ role: 'user', content })

        const body = {
            messages,
            temperature,
            model:openAiModel(model),
            max_tokens,
        }
        if (systemPrompt) {
            body.system = systemPrompt.content
        }

        const url = openAiUrl(model,port)
        console.log(`POST ${url}`)
        return await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            // signal: AbortSignal.timeout(60 * 1000),
        })
    } else {
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`
        }
        if (systemPrompt) messages.push(systemPrompt)
        messages.push({ role: 'user', content })

        const url = openAiUrl(model,port)
        console.log(`POST ${url}`)
        return await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                messages,
                temperature,
                model:openAiModel(model),
                max_tokens,
                stream: false,
            }),
            // signal: AbortSignal.timeout(60 * 1000),
        })
    }
}

export function useClient() {
    loadEnv()

    let cookiesMap = {}
    let authCookies = []
    let setCookies = []
    let headers = new Headers()

    async function auth(authDto=null) {
        authDto = authDto || {}
        const userName = authDto.userName ?? process.env.PVQ_USERNAME
        const password = authDto.password ?? process.env.PVQ_PASSWORD
        const requestDto = Object.assign({ provider:'credentials', userName, password, rememberMe:true }, authDto)

        const res = await fetch(`${BASE_URL}/api/Authenticate`, {
            method:'POST',
            credentials: 'include',
            body: JSON.stringify(requestDto)
        })
    
        if (!res.ok) {
            console.log(`${res.status} Failed to authenticate`)
            return false
        } else {
            console.log(`Authenticated as '${userName}'`)
            updateCookies(res)

            if (Object.keys(ModelProviders).length > 0) {
                console.log('ModelProviders:',ModelProviders)
            }

            return true
        }
    }

    function updateCookies(res) {
        res.headers.forEach((v,k) => {
            switch (k.toLowerCase()) {
                case "set-cookie":
                    let cookies = v.split(',')
                    cookies.forEach(c => setCookies.push(c))
                    break
            }
        })
        setCookies.forEach(x => {
            let cookie = parseCookie(x)
            if (cookie)
                cookiesMap[cookie.name] = cookie
        })
        headers.set("Cookie", setCookies.join("; "))
    }

    function get(url) { return send(url, "GET") }
    function send(url, method, body) {
        if (url.startsWith('/'))
            url = BASE_URL + url
        console.log(`${method} ${url}`)
        const reqOptions = { method, headers, credentials: 'include' }
        if (method !== "GET" && body != null) {
            reqOptions.body = body
            reqOptions.headers = new Headers(headers)
            const isFormData = body instanceof FormData
            if (!isFormData) {
                reqOptions.headers.append('Content-Type', `application/json`)
            }
        }
        const r = fetch(url, reqOptions)
        return r
    }
    function fail(jobId, error) {
        console.log(error)
        return send(`/api/FailJob`, "POST", JSON.stringify({ 
            id:jobId, error 
        }))
    }

    return { auth, get, send, fail, openAi, openAiDefaults, openAiFromModel, openAiResponse, sleep }
}

export function useLogging() {

    let infoStream = null
    function logInfo(message) {
        infoStream ??= fs.createWriteStream("info.log", {flags:'a'})
        console.info(message)
        infoStream.write(message + "\n")
    }
    
    let debugStream = null
    function logDebug(message) {
        debugStream ??= fs.createWriteStream("debug.log", {flags:'a'})
        console.log(message)
        debugStream.write(message + "\n")
    }
    
    let errorStream = null
    function logError(message) {
        errorStream ??= fs.createWriteStream("error.log", {flags:'a'})
        console.error(message)
        errorStream.write(message + "\n")
    }
    
    return { logInfo, logDebug, logError }
}

export function loadEnv() {
    const envData = fs.readFileSync(`./.env`, { encoding: 'utf-8' })
    const envLines = envData.split('\n')
    for (const line of envLines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('#')) continue

        const key = leftPart(trimmed,'=')
        const value = rightPart(trimmed,'=')
        if (key && value) {
            process.env[key] = value
            if (key === 'MODEL_PROVIDERS') {
                ModelProviders = queryString('?' + value)
                // console.log('ModelProviders', ModelProviders)
            } else if (key === 'PVQ_BASE_URL') {
                process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0
                BASE_URL = value
            }
        }
    }
}

export function groqRateLimiting(txt) {
    const regex = /Please try again in (\d+\.\d+)s/;
    const match = txt.match(regex);
    let waitTime = 1000;
    let found = match && match[1]
    if (match && match[1]) {
        try {
            waitTime = parseFloat(match[1]) * 1000;
        } catch (e) {
            console.error(e);
        }
    } else {
        console.log("No match found.");
    }
    return { found, waitTime };
}

export function idParts(id) {
    const idStr = `${id}`.padStart(9, '0')
    const dir1 = idStr.substring(0,3)
    const dir2 = idStr.substring(3,6)
    const fileId = idStr.substring(6)
    const file = fileId + '.json'
    const questionDir = `./questions/${dir1}/${dir2}`
    const metaDir = `./meta/${dir1}/${dir2}`
    const questionPath = `${questionDir}/${file}`
    return { dir1, dir2, fileId, file, questionDir, metaDir, questionPath }
}

export function sleep(ms) {
    return new Promise(r => setTimeout(r, ms))
}

export function parseCookie(setCookie) {
    if (!setCookie)
        return null
    let to = null
    let pairs = setCookie.split(/; */)
    for (let i=0; i<pairs.length; i++) {
        let pair = pairs[i]
        let parts = splitOnFirst(pair, '=')
        let name = parts[0].trim()
        let value = parts.length > 1 ? tryDecode(stripQuotes(parts[1].trim())) : null
        if (i == 0) {
            to = { name, value, path: "/" }
        } else {
            let lower = name.toLowerCase()
            if (lower == "httponly") {
                to.httpOnly = true
            } else if (lower == "secure") {
                to.secure = true
            } else if (lower == "expires") {
                to.expires = new Date(value)

                // MS Edge returns Invalid Date when using '-' in "12-Mar-2037"
                if (to.expires.toString() === "Invalid Date") {
                    to.expires = new Date(value.replace(/-/g, " "))
                }
            } else {
                to[name] = value
            }
        }
    }
    return to
}

export function stripQuotes(s) { return s && s[0] == '"' && s[s.length] == '"' ? s.slice(1,-1) : s }

export function splitOnFirst(s, c) {
    if (!s) return [s]
    let pos = s.indexOf(c)
    return pos >= 0 ? [s.substring(0, pos), s.substring(pos + 1)] : [s]
}
export function splitOnLast(s, c) {
    if (!s) return [s]
    let pos = s.lastIndexOf(c)
    return pos >= 0
        ? [s.substring(0, pos), s.substring(pos + 1)]
        : [s]
}
export function leftPart(s, needle) {
    if (s == null) return null
    let pos = s.indexOf(needle)
    return pos == -1
        ? s
        : s.substring(0, pos)
}
export function rightPart(s, needle) {
    if (s == null) return null
    let pos = s.indexOf(needle)
    return pos == -1
        ? s
        : s.substring(pos + needle.length)
}
export function lastLeftPart(s, needle) {
    if (s == null) return null
    let pos = s.lastIndexOf(needle)
    return pos == -1
        ? s
        : s.substring(0, pos)
}
export function lastRightPart(s, needle) {
    if (s == null) return null
    let pos = s.lastIndexOf(needle)
    return pos == -1
        ? s
        : s.substring(pos + needle.length)
}

export function tryDecode(s) {
    try {
        return decodeURIComponent(s)
    } catch(e) {
        return s
    }
}

export function queryString(url) {
    if (!url || url.indexOf('?') === -1) return {}
    let pairs = rightPart(url, '?').split('&')
    let map = {}
    for (let i = 0; i < pairs.length; ++i) {
        let p = pairs[i].split('=')
        map[p[0]] = p.length > 1
            ? decodeURIComponent(p[1].replace(/\+/g, ' '))
            : null
    }
    return map
}

const pad2 = n => `${n}`.padStart(2,'0')
export function formatTime(ms) {
    const totalSecs = Math.floor(ms/1000)
    const totalMins = Math.floor(totalSecs/60)
    const totalHours = Math.floor(totalMins/60)
    const totalDays = Math.floor(totalHours/24)
    const secs = totalSecs % 60
    const mins = totalMins % 60
    const hours = totalHours % 24

    let fmt = `${pad2(hours)}:${pad2(mins)}:${pad2(secs)}`

    if (totalDays > 0) {
        const s = totalDays != 1 ? 's' : ''
        fmt = `${totalDays} day${s} ` + fmt
    }
    return fmt
}

export function emptyVFile() {
    return ({
        modelVotes: { },
        modelReasons: { },
        gradedBy: { },
    })
}
