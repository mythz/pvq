#!/usr/bin/env bun

/**
 * This script allows you to query the answers-stats.db database, e.g:
 * ./db-answers.ts                            # prints the top 10 answers by length
 * ./db-answers.ts -orderBy Length            # prints the top 10 answers by smallest length
 * ./db-answers.ts -orderByDesc MaxCharCount  # prints the top 10 answers by Max Char Count
 * ./db-answers.ts -where "PostId"   # prints only Answer Id and Path
 * ./db-answers.ts -select "Id, AnswerPath"   # prints only Answer Id and Path
 * ./db-answers.ts -take 20                   # prints the top 20 answers by length
 * ./db-answers.ts -skip 20 -take 20          # prints the next top 20 answers by length
 */

import { Database } from 'bun:sqlite'
import { Inspect } from "./@servicestack/client"
import { Stat } from './lib-view.ts'

const dbPath = './dist/answers-stats.db'

const args = process.argv.slice(2)
const cmds:{[name:string]:any} = {}
for (let i = 0; i < args.length; i++) {
    let name = args[i]
    if (name.startsWith('-')) {
        name = name.substring(1)
    }
    cmds[name] = args[i + 1]
    i++
}

const db = new Database(dbPath)

const select = cmds.select || 'Id, PostId, Length, MaxCharCount, MaxWord, MaxWordCount, NonAsciiCount'
const orderBy = cmds.orderBy || cmds.orderByDesc ? `${cmds.orderByDesc} DESC` : 'Length DESC'
const where = cmds.where || '1=1'
const skip = cmds.skip || 0
const take = cmds.take || 10
const groupBy = cmds.groupBy ? 'GROUP BY ' + cmds.groupBy : ''
const stmt = db.prepare(`SELECT ${select} FROM Stat WHERE ${where} ${groupBy} ORDER BY ${orderBy} LIMIT ${take} OFFSET ${skip}`)
const rows = stmt.all()

Inspect.printDumpTable(rows)
stmt.finalize()
