#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import { useClient, sleep, formatTime } from "./lib.mjs"

let models = process.argv[2]
let worker = process.argv[3]
let port = process.argv[4] ?? '11434'

const { auth, get, send, fail } = useClient()

// Used to identify human models and matching file name conventions
const humanModels = ['accepted', 'most-voted']

async function handleQuestionJob(txtQuestion, id, model, failed, jobId, processed) {
    if (txtQuestion) {
        const idStr = `${id}`.padStart(9, '0')
        const dir1 = idStr.substring(0, 3)
        const dir2 = idStr.substring(3, 6)
        const fileId = idStr.substring(6)
        const questionFile = `${fileId}.json`
        const questionsDir = `./questions/${dir1}/${dir2}`
        fs.mkdirSync(questionsDir, {recursive: true})
        const questionPath = `${questionsDir}/${questionFile}`
        console.log(`writing to ${questionPath}...`)
        fs.writeFileSync(`${questionPath}`, txtQuestion)

        console.log(`./ask.mjs ${id} ${model} ${port}`)
        const r = execSync(`./ask.mjs ${id} ${model} ${port}`).toString()
        console.log(r)

        const answerFile = `${fileId}.a.${model.replace(/\:/g, '-')}.json`
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
    return {failed, processed};
}

async function handleRanking(id, failed, jobId, txtQuestion, processed) {
    // rank question answers
    const allAnswers = await get(`/api/GetAllAnswerModels?id=${id}`)
    const jsonAnswers = await allAnswers.json()
    if (!allAnswers.ok) {
        failed++
        await fail(jobId, `${allAnswers.status} Failed to GetAllAnswers: ${id}`)
        return;
    }
    const idStr = `${id}`.padStart(9, '0')
    const dir1 = idStr.substring(0, 3)
    const dir2 = idStr.substring(3, 6)
    const fileId = idStr.substring(6)
    const questionFile = `${fileId}.json`
    const questionsDir = `./questions/${dir1}/${dir2}`
    fs.mkdirSync(questionsDir, {recursive: true})
    const questionPath = `${questionsDir}/${questionFile}`
    console.log(`writing to ${questionPath}...`)
    fs.writeFileSync(`${questionPath}`, txtQuestion)
    const answers = jsonAnswers.results
    console.log(`answers: ${answers}`)
    for (let i = 0; i < answers.length; i++) {
        const answer = answers[i]
        console.log(`answer: ${answer}`)
        const answerRemoteFile = await get(`/api/GetAnswerFile?id=${idStr}-${answer.replace(/\:/g, '-')}`)
        const txtAnswer = await answerRemoteFile.text();
        if (!answerRemoteFile.ok) {
            failed++
            await fail(jobId, `${answerRemoteFile.status} Failed to GetAnswerFile: ${txtAnswer}`)
            continue;
        }
        const model = answer.replace(/\:/g, '-')
        const answerFile = humanModels.indexOf(model) > -1 ? `${fileId}.h.${model}.json` : `${fileId}.a.${model}.json`
        const answerPath = `${questionsDir}/${answerFile}`
        console.log(`writing to ${answerPath}...`)
        fs.writeFileSync(`${answerPath}`, txtAnswer)
    }


    async function postRankingResult() {
        const rankData = JSON.parse(fs.readFileSync(rankPath, 'utf8'))
        const formData = new FormData()
        formData.set('postId', id)
        formData.set('model', 'mixtral')
        formData.set('modelVotes', JSON.stringify(rankData.modelVotes))
        formData.set('postJobId', jobId)
        const resRank = await send(`/api/RankAnswers`, "POST", formData)
        const txtRank = await resRank.text()
        if (!resRank.ok) {
            failed++
            await fail(jobId, `${resRank.status} Failed to Create Rank: ${txtRank}`)
        } else {
            processed++
        }
    }

    const rankFile = `${fileId}.v.json`
    const rankPath = `${questionsDir}/${rankFile}`

    if (fs.existsSync(rankPath)) {
        await postRankingResult();
        return {failed, processed};
    }

    console.log(`./rank.mjs ${questionPath} mixtral`)
    const r = execSync(`./rank.mjs ${questionPath} mixtral`).toString()
    console.log(r)

    if (!fs.existsSync(rankPath)) {
        failed++
        await fail(jobId, `${rankPath} does not exist`)
    } else {
        await postRankingResult();
    }
    return {failed, processed};
}


// Main loop
if (await auth()) {
    let failed = 0
    let processed = 0
    let i = 0
    let startedAt = new Date()
    
    console.log(`Handling models '${models}' as worker '${worker}'`)
    
    while (true) {
        try {
            const elapsed = new Date() - startedAt
            const uptime = formatTime(elapsed)
            console.log(`[uptime:${uptime} processed:${processed} failed:${failed}] ${i++} waiting for next job...`)
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
                    if (model !== 'rank') {
                        const questionResult = await handleQuestionJob(txtQuestion, id, model, failed, jobId, processed);
                        failed = questionResult.failed;
                        processed = questionResult.processed;
                    } else {
                        const __ret = await handleRanking(id, failed, jobId, txtQuestion, processed);
                        failed = __ret.failed;
                        processed = __ret.processed;
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
