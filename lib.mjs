import fs from "fs"
import path from "path"

const BASE_URL = `https://pvq.app`

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

    return { auth, get, send, fail, sleep }
}

export function loadEnv() {
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

export function lastLeftPart(s, needle) {
    if (s == null) return null
    let pos = s.lastIndexOf(needle)
    return pos == -1
        ? s
        : s.substring(0, pos)
}

export function tryDecode(s) {
    try {
        return decodeURIComponent(s)
    } catch(e) {
        return s
    }
}
