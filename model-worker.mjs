#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import { useClient, sleep } from "./lib.mjs"

let models = process.argv[2]
let worker = process.argv[3]
let port = process.argv[4] ?? '11434'

const { auth, get, send, fail } = useClient()

if (await auth()) {
    let failed = 0
    let processed = 0
    let i = 0
    
    console.log(`Handling models '${models}' as worker '${worker}'`)
    
    while (true) {
        try {
            console.log(`${i++} waiting for next job...         (processed:${processed}, failed:${failed})`)
            const resJob = await get(`/api/GetNextJobs?models=${models}&worker=${worker}`)
            const txtJob = await resJob.text()
            if (!resJob.ok) {
                console.log(`${resJob.status} Failed to GetNextJobs: ${txtJob}`)
                await sleep(1000)
                continue
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
                    const resQuestion = await get(`/api/GetQuestionFile?id=${id}`)
                    const txtQuestion = await resQuestion.text()
                    if (!resQuestion.ok) {
                        failed++
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
                            failed++
                            await fail(jobId, `${answerPath} does not exist`)
                        } else {
                            const answerJson = await fs.openAsBlob(answerPath)
                            const formData = new FormData()
                            formData.set('postId', id)
                            formData.set('model', model)
                            formData.set('json', answerJson, answerFile)
                            formData.set('postJobId', jobId)
                            const resAnswer = await send(`/api/CreateWorkerAnswer`, "POST", formData)
                            const txtAnswer = await resAnswer.text()
                            if (!resAnswer.ok) {
                                failed++
                                fail(jobId, `${resAnswer.status} Failed to Create Answer: ${txtAnswer}`)
                            } else {
                                processed++
                            }
                        }
                    } else {
                        failed++
                        await fail(jobId, `Empty Question File for ${id}`)
                    }
                }
            } else {
                console.log('No jobs available...')
            }
        } catch(e) {
            console.log(failed++, e)
            await sleep(1000)
        }
    }
}
