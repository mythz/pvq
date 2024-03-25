#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { execSync } from "child_process"

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

let models = process.argv[2]
let worker = process.argv[3]
let port = process.argv[4] ?? '11434'

const userName = 'servicestack'
const password = 'p@55wOrd'

// const BaseUrl = `https://pvq.app`
const BaseUrl = `https://192.168.4.26:5001`

const res = await fetch(`${BaseUrl}/api/Authenticate`, {
    method:'POST',
    credentials: 'include',
    body: JSON.stringify({ provider:'credentials', userName, password, rememberMe:true })
})

if (!res.ok) {
    console.log(`${res.status} Failed to authenticate`)
} else {
    console.log(`Authenticated as ${userName}, handling models '${models}' as worker '${worker}'`)
}

let cookiesMap = {}
let authCookies = []
let setCookies = []
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
let headers = new Headers()
headers.set("Cookie", setCookies.join("; "))

function send(url, method, body) {
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

function parseCookie(setCookie) {
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
function stripQuotes(s) { return s && s[0] == '"' && s[s.length] == '"' ? s.slice(1,-1) : s }
function splitOnFirst(s, c) {
    if (!s) return [s]
    let pos = s.indexOf(c)
    return pos >= 0 ? [s.substring(0, pos), s.substring(pos + 1)] : [s]
}
function tryDecode(s) {
    try {
        return decodeURIComponent(s)
    } catch(e) {
        return s
    }
}

const jobId = 1
const id = 100000001
const model = 'phi'
const questionsDir = `./questions/100/000`
const fileId = `001`

const answerFile = `${fileId}.a.${model}.json`
const answerPath = `${questionsDir}/${answerFile}`
if (!fs.existsSync(answerPath)) {
    await fail(jobId, `${answerPath} does not exist`)
} else {
    const answerJson = await fs.openAsBlob(answerPath)
    const formData = new FormData()
    formData.set('postId', id)
    formData.set('model', model)
    formData.set('json', answerJson, answerFile)
    formData.set('postJobId', jobId)
    const resAnswer = await send(`${BaseUrl}/api/CreateWorkerAnswer`, "POST", formData)
    const txtAnswer = await resAnswer.text()
    if (!resAnswer.ok) {
        console.log(`${resAnswer} Failed to Create Answer: ${txtAnswer}`)
    }
}
