#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { execSync } from "child_process"

const dir = process.argv[2] || 'questions'

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
            dbIds.delete(id)
        }
    })
    subDirs.forEach(subDir => processDir(path.join(dir,subDir), dbIds))
}

const out = execSync(`echo 'select id from post' | sqlite3 questions/app.db`).toString()

const dbIds = new Set()

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
    if (!isNaN(id)) dbIds.add(id)
}

processDir(dir, dbIds)

const missingIds = Array.from(dbIds)
missingIds.sort((a,b) => a-b)
missingIds.forEach(id => console.log(id))
