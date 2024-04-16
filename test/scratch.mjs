#!/usr/bin/env node

import { sleep, formatTime, leftPart, lastLeftPart, lastRightPart } from "../lib.mjs"

const startedAt = new Date()
await sleep(1000)
const elapsed = new Date() - startedAt
console.log(formatTime(elapsed))

const answerPaths = [
    `questions/000/014/967.a.gemini-pro.json`,
    `questions/000/014/967.a.deepseek-coder-6.7b.json`,
    `questions/000/014/746.h.most-voted.json`,
    `questions/000/014/746.h.accepted.json`,
]

answerPaths.forEach(answerPath => {
    console.log(lastLeftPart(lastRightPart(answerPath, '/').substring('000.a.'.length), '.'))
})