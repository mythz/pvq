#!/usr/bin/env bun

import fs from "fs"
import path from "path"
import { toLocalISOString } from "./@servicestack/client"
import { createErrorLog, extractIdFromPath, idParts, lastLeftPart } from "./lib.mjs"

const dir = process.argv[2] || 'questions'

if (!dir || !fs.existsSync(dir)) {
    console.log('dir does not exist', dir)
    process.exit()
}

interface Post {
    id: number //0
    postTypeId: number //2
    parentId: number // postid
    summary: string
    creationDate: string //date
    createdBy: string //username
    body: string //answer body
    refId: string //answerId: postid-username
}

type Choice = { index: number, message: { role: string, content: string } }
interface OpenAIAnswer {    
    created: number
    choices: Choice[]
}

const logError = createErrorLog(process.argv[1])

function moveAnswer(modelAnswerPath: string) {
    const toAnswerPath = modelAnswerPath.replace('questions/', 'build/')
    fs.mkdirSync(path.dirname(toAnswerPath), { recursive: true })
    fs.renameSync(modelAnswerPath, toAnswerPath)
}

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
    const files = nodes.filter(x => x.includes('.a.'))
    const subDirs = nodes.filter(x => !x.includes('.'))

    files.forEach(file => {
        const modelAnswerPath = path.join(dir, file)
        const modelAnswerJson = fs.readFileSync(modelAnswerPath, 'utf-8')
        if (modelAnswerJson.trim().length == 0) {
            moveBadAnswer(modelAnswerPath, 'empty')
            return
        }
        let modelAnswer:OpenAIAnswer
        try {
            modelAnswer = JSON.parse(modelAnswerJson) as OpenAIAnswer
        } catch (e) {
            moveBadAnswer(modelAnswerPath, 'invalid json')
            return
        }

        const answerBody = modelAnswer.choices?.[0]?.message?.content
        if (!answerBody || answerBody.trim().length == 0) {
            moveBadAnswer(modelAnswerPath, 'empty body')
            return
        }
        const userName = lastLeftPart(file.substring('000.a.'.length), '.json')
        const created = new Date(modelAnswer.created * 1000)
        const createdDate = toLocalISOString(created)
        const postId = extractIdFromPath(modelAnswerPath)
        const answerId = `${postId}-${userName}`
        
        if (created < minDate) {
            moveBadAnswer(modelAnswerPath, 'invalid created date')
            return
        }

        let summary = answerBody.replace(/<[^>]*>?/gm, '') //naive html stripping
        summary = summary.replace(/```[^`]+```/g, '') // remove code blocks
        summary = summary.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() // collapse new lines and spaces
        summary = summary.length > 200 ? summary.substring(0, 200) + '...' : summary

        const answer:Post = {
            id: 0,
            postTypeId: 2,
            parentId: postId!,
            summary: summary,
            creationDate: createdDate,
            createdBy: userName,
            body: answerBody,
            refId: answerId,            
        }

        if (++count % 1000 == 0) {
            console.log(count, answer)
        }
        try {
            const humanAnswerPath = modelAnswerPath.replace('.a.', '.h.')
            fs.writeFileSync(humanAnswerPath, JSON.stringify(answer, null, 2))
            moveAnswer(modelAnswerPath)
        } catch (e) {
            logError(`${modelAnswerPath} ${e.message}`)
        }
    })
    
    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(dir)
