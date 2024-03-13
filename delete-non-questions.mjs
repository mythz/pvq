#!/usr/bin/env node

import fs from "fs"
import path from "path"

const dir = process.argv[2]

if (!dir || !fs.existsSync(dir)) {
    console.log('dir does not exist', dir)
    process.exit()
}

function processDir(dir) {
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.endsWith('.json'))
    const subDirs = nodes.filter(x => !x.includes('.'))
    
    const questionLength = '000.json'.length
    const candidates = files.filter(x => x.length == questionLength && x.endsWith('.json'))
    
    candidates.forEach(file => {
        const json = fs.readFileSync(path.join(dir,file))
        const obj = JSON.parse(json)
        if (obj.PostTypeId != 1) {
            const fileId = file.split('.')[0]
            console.log(`${path.join(dir,file)}`)
            files.filter(x => x.startsWith(`${fileId}.a.`)).forEach(x => console.log(`${path.join(dir,x)}`))
        }
    })
    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(dir)
