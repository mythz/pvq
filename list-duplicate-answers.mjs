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
    const files = nodes.filter(x => x.endsWith('.json'))
    const subDirs = nodes.filter(x => !x.includes('.'))
    
    const candidates = files.filter(x => (x.includes('.h.accepted')) && !x.startsWith('edit.'))
    
    candidates.forEach(file => {
        const dirParts = dir.replace(/\\/g,'/').split('/')
        const id = parseInt(`${dirParts[1]}${dirParts[2]}${file.split('.')[0]}`, 10)
        const accepted = path.join(dir,file) 
        const mostVoted = accepted.replace('.h.accepted','.h.most-voted')
        if (fs.existsSync(mostVoted) && fs.statSync(accepted).size === fs.statSync(mostVoted).size) {
            console.log(id, accepted)
        }
    })
    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(dir)
