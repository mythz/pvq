#!/usr/bin/env node

/**
 * This script will list all the (non-runtime) files in the questions directory that should be removed.
 */

import fs from "fs"
import path from "path"

const dir = process.argv[2] || './questions'

function processDir(dir) {
    if (dir.includes('/profiles/')) return
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.includes('.'))
    const subDirs = nodes.filter(x => !x.includes('.'))

    files.forEach(file => {
        if (file.endsWith('.json')) {
            if (file.length == '000.json'.length) return
            if (file.length == '000.meta.json'.length && file.endsWith('.meta.json')) return
            if (file.length > 10) {
                const answerSuffix = file.substring(3)
                if (answerSuffix.startsWith('.a.') || answerSuffix.startsWith('.h.')) return
            }
        }
        console.log(path.join(dir, file))
    })

    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(dir)
