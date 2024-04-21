#!/usr/bin/env node

import fs from "fs"
import path from "path"

const dir = process.argv[2] || 'questions'

if (!dir || !fs.existsSync(dir)) {
    console.log('dir does not exist', dir)
    process.exit()
}

function processDir(dir) {
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.endsWith('.meta.json'))
    const subDirs = nodes.filter(x => !x.includes('.'))

    files.forEach(file => {
        let metaPath = path.join(dir, file)
        let metaJson = fs.readFileSync(metaPath, 'utf-8')
        if (!metaJson.trim().endsWith('}')) {
            console.log(metaPath)
        }
    })
    
    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(dir)
