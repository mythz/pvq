#!/usr/bin/env bun

import fs from 'fs'
import path from 'path'

import { leftPart, rightPart } from './lib.mjs'
import { rankAnswerRequest, rankAnswerResponse } from './requests.mjs'

const BaseUrl = `http://localhost:8080`

const model = process.argv[2]
const range = process.argv[3]

if (!model) {
    throw new Error('model is required')
}
if (!range) {
    throw new Error('range is required')
}

interface RankTask {
    Id: string
    PostId: number
    VPath: string
    QuestionPath: string
    MetaPath: string
    AnswerPath: string
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

let count = 0
async function run() {
    let r:Response|null = null
    while (count++ < 2) {
        try {
            if (!r || !r.ok) {
                r = await fetchNext()
            }
            const txt = await r.text()
            r = null
            // console.log('txt', txt)
            const tasks = JSON.parse(txt) as RankTask[]

            for (const task of tasks) {
                const questionJson = fs.readFileSync(task.QuestionPath, 'utf-8')
                const question = JSON.parse(questionJson)
    
                const answerJson = fs.readFileSync(task.AnswerPath, 'utf-8')
                const answer = JSON.parse(answerJson)
    
                // console.log('question', question)
                // console.log('answer', answer)

                const args = {
                    model,
                    answerId:task.Id,
                    postId: question.id,
                    title: question.title,
                    body: question.body,
                    tags: question.tags,
                    answerContent: answer.body,
                }
                // console.log('args', args)
                const request = rankAnswerRequest(args)
                // console.log(request)

                const voteResult = await rankAnswerResponse(request)
                console.log('voteResult', voteResult)
                if (voteResult != null) {
                    const body = { id: task.Id, model, ...voteResult }
                    console.log(`POST ${url}`, body)
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
                }
            }
        } catch(e) {
            console.error(e)
            throw e
        }
    }
}
run()
