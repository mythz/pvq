#!/usr/bin/env bun

import fs from 'fs'
import path from 'path'

import { loadEnv, leftPart, rightPart } from './lib.mjs'
import { rankAnswerRequest, rankAnswerResponse, RankTaskDto } from './requests.ts'

loadEnv()
const BaseUrl = process.env.RANKSERVER_URL || 'http://localhost:8080'

const model = process.argv[2]
const range = process.argv[3]

const usage = `
USAGE:

ranking-worker.ts <model> <range>

example: 
$ ./ranking-worker.ts mixtral 0-10000
`

if (!model || !range) {
    console.log(usage)
    process.exit(0)
}

const after = parseInt(leftPart(range, '-')) || 0
const before = parseInt(rightPart(range, '-')) || 100000000
const take = parseInt(process.argv[4]) || 1

const url = `${BaseUrl}/api/RankAnswer?after=${after}&before=${before}&take=${take}`

async function fetchNext() {
    console.log(`GET ${url}`)
    let r = await fetch(url)
    return r
}
const failedAnswers = {

}

let count = 0
async function run() {
    let r:Response|null = null
    while (true) {
        count++
        // if (count > 1) process.exit(0)
        try {
            if (!r || !r.ok) {
                r = await fetchNext()
            }
            const txt = await r.text()
            r = null
            // console.log('txt', txt)
            const tasks = JSON.parse(txt) as RankTaskDto[]
            if (tasks.length == 0) {
                console.log('No more tasks')
                process.exit(0)
            }

            for (const task of tasks) {
                console.log('task', task, model)
                const request = rankAnswerRequest(task, model)
                // console.log(request)

                const voteResult = await rankAnswerResponse(request)
                // console.log('voteResult', voteResult)
                if (voteResult != null) {
                    const body = { answerId:task.answerId, model, ...voteResult }
                    console.log(`${count} POST ${url}`, body)
                    r = await fetch(url, {
                        method: 'POST',
                        body: JSON.stringify(body),
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    })
                    if (!r.ok) {
                        console.error(`POST ${url}`, await r.text())
                        r = null
                    }
                } else {
                    const answerFailures = (failedAnswers[task.answerId] || 0) + 1
                    failedAnswers[task.answerId] = answerFailures
                    console.error(`${answerFailures}x failed to rank ${task.answerId}`)
                    if (answerFailures > 3) {
                        console.error(`Giving up, flagging ${task.answerId} as failed...`)
                        r = await fetch(url, {
                            method: 'POST',
                            body: JSON.stringify({ answerId:task.answerId, model, fail:true }),
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        })
                    }
                }
            }
        } catch(e) {
            console.error(e)
            throw e
        }
    }
}
run()
