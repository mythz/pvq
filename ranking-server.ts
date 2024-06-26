#!/usr/bin/env bun
import { Database } from 'bun:sqlite'
import fs from 'fs'

/**
 * This script is used to run a HTTP Server that serves ranking tasks to be ranked by client ranking-workers scripts
 * TODO: gradedBy handling needs update after gradedBy is fixed in the v.json files with `fix-v-gradedby.ts`
 */

import { createErrorLog, rightPart, getAnswerBody, formatTime } from "./lib.mjs"

const taskDbPath = './dist/tasks-missing.db'

if (!fs.existsSync(taskDbPath)) {
    throw new Error(`Database file ${taskDbPath} does not exist`)
}

const db = new Database(taskDbPath)

const logError = createErrorLog(process.argv[1])

const HomePage = `
## Usage:

GET /api/RankAnswer

GET /api/RankAnswer?after=10000&before=20000&mod=1&mod=1&take=1

POST /api/RankAnswer 
     { id, model, reason, score }

POST /api/RankAnswer?after=10000&before=20000&mod=1&mod=1&take=1
     { id, model, reason, score }
`

interface RankTask {
    Id: string
    PostId: number
    VPath: string
    QuestionPath: string
    MetaPath: string
    AnswerPath: string
}
interface RankTaskDto {
    answerId: string,
    postId: number,
    title: string,
    tags: string[],
    body: string,
    answerBody: string,
}

function getQueryParams(qs:URLSearchParams, args:any) {
    const to = {}
    for (const arg of args) {
        to[arg] = qs.get(arg)
    }
    return to
}
const stmtDelete = db.prepare(`DELETE FROM RankTask WHERE Id = ?`)

let total = db.prepare(`SELECT COUNT(*) AS count FROM RankTask`).get().count
let completed = 0
const startedAt = new Date().valueOf()

const Handlers = {
    "/": async (req:Request) => {
        return new Response(HomePage)
    },
    "/api/RankAnswer": async (req:Request) => {

        const url = new URL(req.url)
        if (req.method === 'POST') {
            const reqBody = await req.json()
            const { answerId, model, reason, score, fail } = reqBody
            console.log(`POST ${url.pathname}`, reqBody)
            if (!answerId) {
                return new Response('answerId is required', { status: 400 })
            }
            if (fail) {
                logError(`${answerId}: deleting failed task`)
                stmtDelete.run(answerId)
            } else {
                if (!model) {
                    return new Response('model used to grade task is required', { status: 400 })
                }
                if (reason == null || score == null) {
                    return new Response('reason and score are required to complete rank task', { status: 400 })
                }

                var task = db.prepare(`SELECT * FROM RankTask WHERE Id = ?`).get(answerId) as RankTask
                if (!task) {
                    return new Response('task not found', { status: 404 })
                }

                const vJson = fs.readFileSync(task.VPath, 'utf-8')
                const vObj = JSON.parse(vJson)
                const answerModel = rightPart(answerId, '-')
                vObj.modelVotes[answerModel] = score
                vObj.modelReasons[answerModel] = reason
                const gradedAnswers = vObj.gradedBy[model] || (vObj.gradedBy[model]=[])
                if (!gradedAnswers.includes(answerId)) {
                    gradedAnswers.push(answerId)
                }
                
                fs.writeFileSync(task.VPath, JSON.stringify(vObj, null, 4))
                const elapsed = new Date().valueOf() - startedAt
                const uptime = formatTime(elapsed)

                console.log(`uptime:${uptime} ${++completed}/${total} completed task in ${task.VPath}`, reqBody)
                stmtDelete.run(answerId)
            }
        }

        const { after, before, mod, take }:any = getQueryParams(new URL(req.url).searchParams, 
            ['after', 'before', 'mod', 'take'])
        
        let conditions:string[] = []
        let params:any[] = []
        if (!isNaN(parseInt(after))) {
            conditions.push(`PostId >= ?`)
            params.push(parseInt(after))
        }
        if (!isNaN(parseInt(before))) {
            conditions.push(`PostId < ?`)
            params.push(parseInt(before))
        }
        if (!isNaN(parseInt(mod))) {
            conditions.push(`mod(PostId, ?) = 0`)
            params.push(parseInt(mod))
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
        const sql = `SELECT * FROM RankTask ${where} ORDER BY PostId LIMIT ${parseInt(take) || 1}`
        // console.log(`sql`,sql,params)

        let tasks:RankTaskDto[] = []

        while (tasks.length === 0) {
            const stmt = db.prepare(sql)
            const candidates = stmt.all(params)
            if (candidates.length === 0) {
                break
            }

            candidates.forEach((task:RankTask) => {
                const vJson = fs.readFileSync(task.VPath, 'utf-8')
                const vObj = JSON.parse(vJson)
                const answerModel = rightPart(task.Id, '-')
                let alreadyRanked = vObj.modelReasons[answerModel]
                if (alreadyRanked) {
                    console.log(`deleting already ranked ${task.Id} in ${task.VPath}`)
                    stmtDelete.run(task.Id)
                } else {
                    const questionJson = fs.readFileSync(task.QuestionPath, 'utf-8')
                    const question = JSON.parse(questionJson)
        
                    const answerJson = fs.readFileSync(task.AnswerPath, 'utf-8')
                    const answerBody = getAnswerBody(answerJson)

                    tasks.push({
                        answerId: task.Id,
                        postId: task.PostId,
                        title: question.title,
                        tags: question.tags,
                        body: question.body,
                        answerBody,
                    })
                }
           })
        }

        return new Response(JSON.stringify(tasks))
    }
}

Bun.serve({
    port: 8080, // defaults to $BUN_PORT, $PORT, $NODE_PORT otherwise 3000
    development: true,
    fetch(req:Request) {
        const { method } = req;
        const { pathname, search } = new URL(req.url)

        console.log(`${req.method} ${pathname}${search}`)

        const handler = Handlers[pathname]
        if (handler) {
            return handler(req)
        }

        return new Response(`${pathname} 404!`)
    },
})