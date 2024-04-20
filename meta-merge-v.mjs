#!/usr/bin/env node

/**
 * This script will merge the modelVotes, modelReasons, and gradedBy from the .v.json files into the .meta.json files.
 */

import fs from "fs"
import path from "path"

import { createErrorLog } from "./lib.mjs"

const dir = process.argv[2] || './questions'

const logError = createErrorLog(process.argv[1])

let count = 0

function processDir(dir) {
    const nodes = fs.readdirSync(dir)
    const files = nodes.filter(x => x.includes('.'))
    const subDirs = nodes.filter(x => !x.includes('.'))

    files.forEach(file => {
        if (file.endsWith('.meta.json')) {
            let metaPath = path.join(dir, file)
            let vPath = metaPath.replace('questions/','meta/').replace('.meta.json', '.v.json')
            if (!fs.existsSync(vPath)) {
                logError(vPath + ' missing')
                return
            }
            if (count++ > 5) {
                process.exit()
            }

            const metaObj = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            const vObj = JSON.parse(fs.readFileSync(vPath, 'utf-8'))
            let { modelVotes, modelReasons, gradedBy } = vObj
            if (!modelVotes) modelVotes = {}
            if (!modelReasons) modelReasons = {}
            if (!gradedBy) gradedBy = {}

            // keep them together at bottom of meta.json
            if (metaObj.modelVotes) delete metaObj.modelVotes
            if (metaObj.modelReasons) delete metaObj.modelReasons
            if (metaObj.gradedBy) delete metaObj.gradedBy
            metaObj.modelVotes = modelVotes
            metaObj.modelReasons = modelReasons
            metaObj.gradedBy = gradedBy
            console.log(count, 'rewriting ' + metaPath)
            console.log(metaObj)
            console.log('------------------\n\n\n')
            // fs.writeFileSync(metaPath, JSON.stringify(metaObj, null, 2))
        }
    })

    subDirs.forEach(subDir => processDir(path.join(dir,subDir)))
}

processDir(dir)
