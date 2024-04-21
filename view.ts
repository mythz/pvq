#!/usr/bin/env bun

/**
 * This script views and answer or question by id or path
 */

import fs from 'fs'
import path from 'path'
import { lastLeftPart, extractIdFromPath, lastRightPart, getAnswerBody, idParts, rightPart, leftPart } from "./lib.mjs"

const target = process.argv[2] 
const verbose = process.argv[3] === '-v' 

import { contentStats, getQuestionOrAnswerId } from './lib-view.ts'

const id = getQuestionOrAnswerId(target)
if (!id) {
    if (target) {
        console.error('invalid id', target)
        process.exit(1)
    }
    console.log(`Usage: ${lastRightPart(process.argv[1],'/')} <post-id|question-id|path>`)
    process.exit(0)
}


const isAnswer = id.includes('-')

const postId = parseInt(leftPart(id, '-'))
const { dir1, dir2, fileId, file, questionDir, metaDir, questionPath, metaPath, vPath } = idParts(postId)
if (!fs.existsSync(questionPath)) {
    console.error(`Question ${id}: ${questionPath} not found`)
    process.exit(1)
}
if (!fs.existsSync(metaPath)) {
    console.error(`Question ${id}: ${metaPath} not found`)
    process.exit(1)
}
const metaJson = fs.readFileSync(metaPath, 'utf-8')
const meta = JSON.parse(metaJson)
const { modelVotes, modelReasons, gradedBy, statTotals, comments } = meta

const questionJson = fs.readFileSync(questionPath, 'utf-8')
const question = JSON.parse(questionJson)

if (isAnswer) {
    const userName = rightPart(id, '-')
    const modelAnswerPath = path.join(questionDir, `${fileId}.a.${userName}.json`)
    const humanAnswerPath = path.join(questionDir, `${fileId}.h.${userName}.json`)
    const answerPath = fs.existsSync(modelAnswerPath) 
        ? modelAnswerPath 
        : fs.existsSync(modelAnswerPath) 
            ? humanAnswerPath
            : null
    if (!answerPath) {
        console.error(`Answer not found: ${id}`)
        process.exit(1)
    }

    const answerJson = fs.readFileSync(answerPath, 'utf-8')
    const answer = JSON.parse(answerJson)
    const body = getAnswerBody(answerJson)

    console.log(`\nAnswer: ${id}`)
    console.log(`-`.repeat(80))
    console.log(body?.trim())
    console.log(`-`.repeat(80))
    const createdDate = answer.created 
        ? new Date(answer.created * 1000).toDateString()
        : new Date(answer.creationDate).toDateString()
    console.log(`created by ${userName} at ${createdDate}`)

    console.log(`\nFile: ${answerPath}`)
    console.log(`Post: ${questionPath}`)
    console.log(`Meta: ${metaPath}`)
    console.log(`Url: https://pvq.app/questions/${question.id}/${question.slug}#${id}`)

    if (verbose) {
        const statTotal = (statTotals ?? []).find(x => x.id === id)
        console.log(`\nTotals:`, statTotal)
        const stats = contentStats(body)
        console.log(`\nBody Stats:`)
        console.log(stats)
    }
} else {
    console.log(`\nQuestion: ${id}`)
    console.log(`Title:`, question.title)
    console.log(`Tags:`, question.tags)
    console.log(`-`.repeat(80))
    console.log(question.body?.trim())
    console.log(`-`.repeat(80))
    console.log(`created by ${question.createdBy} at ${new Date(question.creationDate).toDateString()}, ${question.viewCount} views`)

    console.log(`\nPost: ${questionPath}`)
    console.log(`Meta: ${metaPath}`)
    console.log(`Url: https://pvq.app/questions/${question.id}/${question.slug}`)
    console.log(`\nAnswers:`)
    const answersFiles = fs.readdirSync(questionDir)
        .filter(x => x.startsWith(`${fileId}.a.`) || x.startsWith(`${fileId}.h.`))
    const answers = answersFiles.map(x => {
        const file = lastRightPart(x, '/')
        const userName = lastLeftPart(file.substring('000.a.'.length), '.')
        const score = modelVotes && modelVotes[userName] ? modelVotes[userName] : ' '
        return { score, x }
    })
    answers.sort((a,b) => b.score - a.score)
        .forEach(({ score, x }) => console.log(score, path.join(questionDir, x)))

    if (verbose) {
        const statTotal = (statTotals ?? []).find(x => x.id === id)
        console.log(`\nTotals:`, statTotal)
        const stats = contentStats(question.body)
        console.log(`\nBody Stats:`)
        console.log(stats)
    }
}

