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
        if (metaJson.trim().length == 0) {
            console.error(metaPath, 'is empty')
            return
        }
        if (!metaJson.trim().endsWith('}')) {
            try {
                metaJson += "}"
                const meta = JSON.parse(metaJson)
                console.log(metaPath, 'fix applied')
                fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
            } catch(e) {
                console.error(metaPath, 'error parsing', e)
            }
        }
    })
    
    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(dir)
