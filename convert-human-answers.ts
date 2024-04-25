#!/usr/bin/env bun

/*
 * Checks for and fixes missing fields in .h. answers and moves bad answers to /bad folder
 */

import type { Post } from "./lib-view"
import fs from "fs"
import path from "path"
import { toCamelCase, toLocalISOString } from "./@servicestack/client"
import { createErrorLog, extractIdFromPath, generateSummary, lastLeftPart } from "./lib.mjs"

const dir = process.argv[2] || 'questions'

if (!dir || !fs.existsSync(dir)) {
    console.log('dir does not exist', dir)
    process.exit()
}

const logError = createErrorLog(process.argv[1], { reset:true })

function moveBadAnswer(modelAnswerPath: string, reason:string) {
    logError(`${modelAnswerPath} ${reason}`)
    const toAnswerPath = modelAnswerPath.replace('questions/', 'bad/')
    console.log(`mv ${modelAnswerPath} ${toAnswerPath}`)
    fs.mkdirSync(path.dirname(toAnswerPath), { recursive: true })
    fs.renameSync(modelAnswerPath, toAnswerPath)
}

const minDate = new Date('2000-01-01')
let count = 0

function processDir(dir:string) {
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.endsWith(".h.accepted.json") || x.endsWith(".h.most-voted.json"))
    const subDirs = nodes.filter(x => !x.includes('.'))

    files.forEach(file => {
        const answerPath = path.join(dir, file)
        const answerJson = fs.readFileSync(answerPath, 'utf-8')
        if (answerJson.trim().length == 0) {
            moveBadAnswer(answerPath, 'empty')
            return
        }
        let answer:Post
        try {
            answer = JSON.parse(answerJson) as Post
        } catch (e) {
            moveBadAnswer(answerPath, 'invalid json')
            return
        }

        let shouldUpdate = false

        // Still in PascalCase
        let answerBody = answer.body
        if (!answerBody && (answer as any).Body) {
            const to:any = {}
            Object.keys(answer).forEach(k => to[toCamelCase(k)] = answer[k])
            answer = to
            console.error(answerPath, 'converting to camelCase')
            answerBody = answer.body
            shouldUpdate = true
        }

        if (!answerBody || answerBody.trim().length == 0) {
            moveBadAnswer(answerPath, 'empty body')
            return
        }
        if (!answer.creationDate) {
            moveBadAnswer(answerPath, 'missing creationDate')
        }

        const userName = lastLeftPart(file.substring('000.a.'.length), '.json')

        if (!answer.parentId) {
            answer.parentId = extractIdFromPath(answerPath)!
            shouldUpdate = true
        }
        if (!answer.createdBy) {
            answer.createdBy = userName
            shouldUpdate = true
        }
        if (!answer.refId) {
            answer.refId = `${answer.parentId}-${userName}`
            shouldUpdate = true
        }
        if (!answer.summary || answer.summary.length <= 20) {
            answer.summary = generateSummary(answer.body)
            shouldUpdate = true
        }
        if (!shouldUpdate) return

        if (++count % 1000 == 0) {
            console.log(count, answer)
        }
        try {
            fs.writeFileSync(answerPath, JSON.stringify(answer, null, 2))
        } catch (e) {
            logError(`${answerPath} ${e.message}`)
        }
    })
    
    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(dir)
