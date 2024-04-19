#!/usr/bin/env bun
import { Database } from 'bun:sqlite'
import fs from 'fs'
import path from 'path'
import { rightPart, idParts, extractIdFromPath } from "./lib.mjs"

const dir = process.argv[2] || './meta'

const taskDbPath = './dist/tasks-missing.db'

if (!fs.existsSync(taskDbPath)) {
    throw new Error(`Database file ${taskDbPath} does not exist`)
}

const db = new Database(taskDbPath)

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

const Handlers = {
    "/": async (req:Request) => {
        return new Response(HomePage)
    },
    "/api/RankAnswer": async (req:Request) => {

        if (req.method === 'POST') {
            const reqBody = await req.json()
            const { id, model, reason, score } = reqBody
            console.log(`POST /api/RankAnswer`, { id, model, reason, score })
            if (!id) {
                return new Response('id (answerId) is required', { status: 400 })
            }
            if (!model) {
                return new Response('model used to grade task is required', { status: 400 })
            }
            if (!reason || !score) {
                return new Response('reason and score are required to complete rank task', { status: 400 })
            }

            var task = db.prepare(`SELECT * FROM RankTask WHERE Id = ?`).get(id) as RankTask
            if (!task) {
                return new Response('task not found', { status: 404 })
            }

            const vJson = fs.readFileSync(task.VPath, 'utf-8')
            const vObj = JSON.parse(vJson)
            const answerModel = rightPart(task.Id, '-')
            vObj.modelVotes[answerModel] = score
            vObj.modelReasons[answerModel] = reason
            const gradedAnswers = vObj.gradedBy[model] || (vObj.gradedBy[model]=[])
            if (!gradedAnswers.includes(id)) {
                gradedAnswers.push(id)
            }
            
            fs.writeFileSync(task.VPath, JSON.stringify(vObj, null, 4))
            console.log(`${++completed}/${total} completed task in ${task.VPath}`, reqBody)
            stmtDelete.run(id)
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

        let tasks:RankTask[] = []

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
                    tasks.push(task)
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
        const { pathname } = new URL(req.url)

        console.log(`${req.method} ${pathname}`)

        const handler = Handlers[pathname]
        if (handler) {
            return handler(req)
        }

        return new Response(`${pathname} 404!`)
    },
})