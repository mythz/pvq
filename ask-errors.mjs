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
    files.filter(x => x.includes('.e.')).forEach(file => {
        console.log(`${path.join(dir,file)}`)
    })
    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(dir)
