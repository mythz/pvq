import { stopWords } from './data.mjs'
import { extractIdFromPath, lastLeftPart, lastRightPart } from './lib.mjs'

export interface Stat {
    Id: string
    PostId: number
    AnswerPath: string
    Length: number
    MaxChar: string
    MaxCharCount: number
    MaxWord: string
    MaxWordCount: number
    NonAsciiCount: number
    CharTotals: string
    WordTotals: string
}

const checkChars = ['.',',','-','_',';','|','\n','\t','/','\\','`','-','+','[',']','(',')','<','>']

export function contentStats(body:string) {
    const allCharTotals = {}
    for (let i=0; i<body.length; i++) {
        const char = body[i]
        if (checkChars.includes(char)) {
            if (!allCharTotals[char]) allCharTotals[char] = 0
            allCharTotals[char]++
        }
    }
    const nonAsciiCount = body.length - body.replace(/[\u{0080}-\u{FFFF}]/gu,"").length
    let maxChar = ''
    let maxCharCount = 0
    for (const char in allCharTotals) {
        if (allCharTotals[char] > maxCharCount) {
            maxCharCount = allCharTotals[char]
            maxChar = char
        }
    }
    const charTotals = sortTotals(allCharTotals, 10)
        .filter(x => x.value > 2)
        .reduce((acc, x) => {
            acc[x.key] = x.value
            return acc
        }, {})

    let maxWord = ''
    let maxWordCount = 0
    let words = body.replace(/[\u{0080}-\u{FFFF}]/gu," ").split(/\s+/g)
        .map(x => x.replace(/['"<>\\/`]/g,'').toLowerCase())
        .filter(x => x.length > 1 && !stopWords.has(x))
    const allWordTotals = {
    }
    for (const word of words) {
        if (!allWordTotals[word]) allWordTotals[word] = 0
        allWordTotals[word]++

        if (allWordTotals[word] > maxWordCount) {
            maxWordCount = allWordTotals[word]
            maxWord = word
        }
    }
    const wordTotals = sortTotals(allWordTotals, 10)
        .filter(x => x.value > 2)
        .reduce((acc, x) => {
            acc[x.key] = x.value
            return acc
        }, {})

    return {
        length: body.length,
        maxChar,
        maxCharCount,
        maxWord,
        maxWordCount,
        nonAsciiCount,
        charTotals,
        wordTotals,
    }
}

export function sortTotals(totals:{[key:string]:number}, take:number = 10) {
    return Object.keys(totals).sort((a,b) => totals[b] - totals[a])
        .slice(0,take)
        .map(key => ({key, value: totals[key]}))
}

export function getQuestionOrAnswerId(target:string) {
    if (!target) return null
    
    let id = target.includes('.') 
        ? extractIdFromPath(target)?.toString()
        : target
    
    if (!id) return null
    
    if (target.includes('.a.') || target.includes('.h.')) {
        return id + `-${lastLeftPart(lastRightPart(target,'/')?.substring('000.a.'.length),'.')}`
    }
    
    return id
}