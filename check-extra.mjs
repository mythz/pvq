#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import { getQuestionFiles } from "./delete-question.mjs"

const dir = 'questions'
const showPaths = process.argv[2] === '-path'

if (!dir || !fs.existsSync(dir)) {
    console.log('dir does not exist', dir)
    process.exit()
}

function processDir(dir, dbIds) {
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.endsWith('.json'))
    const subDirs = nodes.filter(x => !x.includes('.'))
    
    const questionLength = '000.json'.length
    const candidates = files.filter(x => x.length == questionLength && x.endsWith('.json'))
    
    candidates.forEach(file => {
        const dirParts = dir.split('/')
        if (dirParts.length !== 3) return
        const id = parseInt(`${dirParts[1]}${dirParts[2]}${file.split('.')[0]}`, 10)
        if (!isNaN(id)) {
            dbIds.add(id)
        }
    })
    subDirs.forEach(subDir => processDir(path.join(dir,subDir), dbIds))
}

const dbIds = new Set()
processDir(dir, dbIds)

const out = execSync(`echo 'select id from post' | sqlite3 questions/app.db`).toString()

function* readByLine(lines) {
    let start = 0;
    for (let end = 0; end < lines.length; end++) {
        if (lines[end] === '\n') {
            yield lines.substring(start, end);
            start = end + 1;
        }
    }
    if (start < lines.length) {
        yield lines.substring(start);
    }
}
let asLines = readByLine(out)
for (let line of asLines) {
    const id = parseInt(line)
    if (!isNaN(id)) dbIds.delete(id)
}

const extraIds = Array.from(dbIds)
extraIds.sort((a,b) => a-b)

if (showPaths) {
    extraIds.forEach(id => {
        const questionFiles = getQuestionFiles(id) 
        questionFiles.forEach(id => console.log(id))
    })
} else {
    extraIds.forEach(id => console.log(id))
}