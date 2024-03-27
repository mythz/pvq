#!/usr/bin/env node

import { sleep, formatTime } from "../lib.mjs"

const startedAt = new Date()
await sleep(1000)
const elapsed = new Date() - startedAt
console.log(formatTime(elapsed))