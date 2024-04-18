#!/usr/bin/env bun
import { Database } from 'bun:sqlite'
import fs from 'fs'
import path from 'path'
import { rightPart, idParts, extractIdFromPath } from "./lib.mjs"

const dir = process.argv[2] || './meta'

const taskDbPath = './dist/tasks.db'

if (!fs.existsSync(taskDbPath)) {
    throw new Error(`Database file ${taskDbPath} does not exist`)
}

const db = new Database(taskDbPath)

const HomePage = `
## Usage:

GET /api/FetchNextTask
    /api/FetchNextTask?after=10000&before=20000&orderBy=postId

POST /api/CompleteTask { model, answerId, reason, score }
`

function getQueryParams(qs:URLSearchParams, args:any) {
    const to = {}
    for (const arg of args) {
        to[arg] = qs.get(arg)
    }
    return to
}

const Handlers = {
    "/": async (req:Request) => {
        return new Response(HomePage)
    },
    "/api/FetchNextTask": async (req:Request) => {
        const { after, before, orderBy, take }:any = getQueryParams(new URL(req.url).searchParams, 
            ['after', 'before', 'orderBy', 'take'])
        const sql = `SELECT * FROM RankTask WHERE PostId > ? AND PostId < ? ORDER BY ${orderBy || 'PostId'} LIMIT ${parseInt(take) || 1}`
        console.log(`sql`,sql)
        const stmt = db.prepare(sql)
        const tasks = stmt.all(parseInt(after) || 0, parseInt(before) || 100000000)
        return new Response(JSON.stringify(tasks))
    },
    "/api/CompleteTask": async (req:Request) => {
        const { model, answerId, reason, score } = await req.json()
        // const stmt = db.prepare(`DELETE FROM RankTask (Model, AnswerId, Reason, Score) VALUES (?, ?, ?, ?)`)
        // stmt.run(model, answerId, reason, score)
        return new Response('ok')
    }
}

Bun.serve({
    port: 8080, // defaults to $BUN_PORT, $PORT, $NODE_PORT otherwise 3000
    development: true,
    fetch(req:Request) {
        const { method } = req;
        const { pathname } = new URL(req.url)

        const handler = Handlers[pathname]
        if (handler) {
            return handler(req)
        }

        return new Response(`${pathname} 404!`)
    },
})