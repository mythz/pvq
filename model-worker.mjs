#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { execSync } from "child_process"

let models = process.argv[2]
let worker = process.argv[3]
let port = process.argv[4] ?? '11434'

const userName = 'servicestack'
const password = 'p@55wOrd'

const res = await fetch(`https://pvq.app/api/Authenticate`, {
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

function get(url) { return send(url, "GET") }
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
function fail(jobId, error) {
    console.log(error)
    return send(`https://pvq.app/api/FailJob`, "POST", JSON.stringify({ 
        id:jobId, error 
    }))
}


const sleep = ms => new Promise(r => setTimeout(r, ms));
let errors = 0
let i = 0

while (true) {
    try {
        console.log(`${i++} waiting for next job...`)
        const resJob = await get(`https://pvq.app/api/GetNextJobs?models=${models}&worker=${worker}`)
        const txtJob = await resJob.text()
        if (!resJob.ok) {
            console.log(`${resJob.status} Failed to GetNextJobs: ${txtJob}`)
            await sleep(1000)
            continue;
        }
        let results = []
        if (txtJob) {
            const obj = JSON.parse(txtJob)
            let postJobs = obj.results || []
            console.log('job', postJobs)
            for (let index=0; index<postJobs.length; index++) {
                const postJob = postJobs[index]
                const jobId = postJob.id
                const id = postJob.postId
                const model = postJob.model
                const resQuestion = await get(`https://pvq.app/api/GetQuestionFile?id=${id}`)
                const txtQuestion = await resQuestion.text()
                if (!resQuestion.ok) {
                    await fail(jobId, `${resQuestion.status} Failed to GetQuestionFile: ${txtQuestion}`)
                    continue
                }
                if (txtQuestion) {
                    const idStr = `${id}`.padStart(9, '0')
                    const dir1 = idStr.substring(0,3)
                    const dir2 = idStr.substring(3,6)
                    const fileId = idStr.substring(6)
                    const questionFile = `${fileId}.json`
                    const questionsDir = `./questions/${dir1}/${dir2}`
                    fs.mkdirSync(questionsDir, { recursive: true })
                    const questionPath = `${questionsDir}/${questionFile}`
                    console.log(`writing to ${questionPath}...`)
                    fs.writeFileSync(`${questionPath}`, txtQuestion)
                    
                    console.log(`./ask.mjs ${id} ${model} ${port}`)
                    const r = execSync(`./ask.mjs ${id} ${model} ${port}`).toString()
                    console.log(r)

                    const answerFile = `${fileId}.a.${model.replace(/\:/g,'-')}.json`
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
                        const resAnswer = await send(`https://pvq.app/api/CreateWorkerAnswer`, "POST", formData)
                        const txtAnswer = await resAnswer.text()
                        if (!resAnswer.ok) {
                            console.log(`${resAnswer.status} Failed to Create Answer: ${txtAnswer}`)
                        }
                    }
                } else {
                    await fail(jobId, `Empty Question File for ${id}`)
                }
            }
        } else {
            console.log('No jobs available...')
        }
    } catch(e) {
        console.log(errors++, e)
        await sleep(1000)
    }
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