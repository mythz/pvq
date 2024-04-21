#!/usr/bin/env bun

/**
 * This script creates the answers-stats.db containing word and character statistics about each answer
 */

import { Database } from 'bun:sqlite'
import fs from 'fs'
import path from 'path'
import { lastLeftPart, extractIdFromPath, createErrorLog, getAnswerBody } from "./lib.mjs"
import { contentStats, toDbParams, Stat } from './lib-view.ts'

const dir = process.argv[2] || './questions'

const dbPath = './dist/answers-stats.db'

if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath)
}

const db = new Database(dbPath)

// Id = AnswerId
db.exec(`CREATE TABLE Stat (
    Id text primary key,
    PostId integer not null,
    AnswerPath text not null,
    Length integer not null,
    MaxChar text null,
    MaxCharCount integer not null,
    MaxWord text null,
    MaxWordCount integer not null,
    AlphaNumCount integer not null,
    NonAlphaCount integer not null,
    NonAsciiCount integer not null,
    CharTotals text not null,
    WordTotals text not null
)`)

const insert = db.prepare(
    `INSERT INTO Stat (Id,PostId,AnswerPath,Length,MaxChar,MaxCharCount,MaxWord,MaxWordCount,AlphaNumCount,NonAlphaCount,NonAsciiCount,CharTotals,WordTotals) VALUES ` +
    `($id,$postId,$answerPath,$length,$maxChar,$maxCharCount,$maxWord,$maxWordCount,$alphaNumCount,$nonAlphaCount,$nonAsciiCount,$charTotals,$wordTotals)`)
const tasks:any[] = []

const logError = createErrorLog(process.argv[1], { reset:true })

let count = 0

function processDir(dir) {
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.includes('.'))
    const subDirs = nodes.filter(x => !x.includes('.'))

    files.forEach(file => {
        if (file.endsWith('.json') && file.length > 10) {
            const answerSuffix = file.substring(3)
            if (!answerSuffix.startsWith('.a.')) return
            
            const answerPath = path.join(dir, file)
            try {
                const answerJson = fs.readFileSync(answerPath, 'utf8')
                const postId = extractIdFromPath(answerPath)
                const userName = lastLeftPart(file.substring('000.a.'.length), '.')
                const id = `${postId}-${userName}`
                const body = getAnswerBody(answerJson)
                if (!body || body.trim().length === 0) {
                    insert.run(toDbParams({
                        id,
                        postId,
                        answerPath,
                        length: 0,
                        maxChar: '',
                        maxCharCount: 0,
                        maxWord: '',
                        maxWordCount: 0,
                        alphaNumCount: 0,
                        nonAlphaCount: 0,
                        nonAsciiCount: 0,
                        charTotals: '{}',
                        wordTotals: '{}',
                    }))
                    logError(`${answerPath} empty body`)
                    return
                }
                const stats = contentStats(body)
                const row = {
                    id,
                    postId,
                    answerPath,
                    ...stats,
                }
                const dbRow = toDbParams(row)
                dbRow['$charTotals'] = JSON.stringify(stats.charTotals)
                dbRow['$wordTotals'] = JSON.stringify(stats.charTotals)
                try {
                    insert.run(dbRow)
                    count++
                } catch(e) {
                    console.log(`failed to insert stat ${id} in ${answerPath}`, e)
                    console.log(dbRow)
                    return
                }
                if (count % 1000 === 0) {
                    console.log(count, row)
                }
            } catch(e) {
                logError(`${answerPath} ${e.message}`)
                console.log(answerPath, e.stack)
            }
        }
    })

    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(dir)

insert.finalize()
db.close(true)

