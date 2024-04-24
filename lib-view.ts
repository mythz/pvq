import { stopWords } from './data.mjs'
import { extractIdFromPath, lastLeftPart, lastRightPart } from './lib.mjs'

export interface Meta {
    id: number
    modelVotes: { [index: string]: number }
    modelReasons: { [index: string]: string }
    gradedBy: { [index: string]: string }
    comments: { [index: string]: Comment[] }
    statTotals: StatTotals[]
    modifiedDate: string;
}

export interface StatTotals
{
    id: string;
    postId: number;
    createdBy?: string;
    favoriteCount: number;
    viewCount: number;
    upVotes: number;
    downVotes: number;
    startingUpVotes: number;
}

export interface Comment
{
    body: string
    created: number
    createdBy: string
    upVotes?: number
    reports?: number
}

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

export interface Post {
    id: number //0
    postTypeId: number //2
    parentId: number // postid
    summary: string
    creationDate: string //date
    createdBy: string //username
    body: string //answer body
    refId: string //answerId: postid-username
}

export type Choice = { index: number, message: { role: string, content: string } }
export interface OpenAIAnswer {    
    created: number
    choices: Choice[]
}

const alphaNumericChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'
const nonAlphaNumericChars = getNonAlphaNumericAsciiChars()

export function contentStats(body: string) {
    const allCharTotals = {}
    let alphaNumCount = 0
    let nonAlphaCount = 0
    let nonAsciiCount = 0
    const sb:string[] = []
    for (let i = 0; i < body.length; i++) {
        const point = body.codePointAt(i)
        const char = String.fromCodePoint(point ?? ' '.charCodeAt(0))
        if (alphaNumericChars.indexOf(char) >- 0) {
            alphaNumCount++
            sb.push(char)
        } else {
            sb.push(' ')
            if (nonAlphaNumericChars.indexOf(char) != -1) {
                nonAlphaCount++
                if (!allCharTotals[char]) allCharTotals[char] = 0
                allCharTotals[char]++
            } else {
                nonAsciiCount++
            }
        }
    }
    const cleanBody = sb.join('').toLowerCase()
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
    let words = cleanBody.split(/\s+/g)
        .filter(x => x.length > 1 && !stopWords.has(x))
    // console.log(words)
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
        alphaNumCount,
        nonAlphaCount,
        nonAsciiCount,
        charTotals,
        wordTotals,
    }
}

export function sortTotals(totals: { [key: string]: number }, take: number = 10) {
    return Object.keys(totals).sort((a, b) => totals[b] - totals[a])
        .slice(0, take)
        .map(key => ({ key, value: totals[key] }))
}

export function getQuestionOrAnswerId(target: string) {
    if (!target) return null

    let id = target.includes('.')
        ? extractIdFromPath(target)?.toString()
        : target

    if (!id) return null

    if (target.includes('.a.') || target.includes('.h.')) {
        return id + `-${lastLeftPart(lastRightPart(target, '/')?.substring('000.a.'.length), '.')}`
    }

    return id
}

export function range(size:number, startAt:number = 0):ReadonlyArray<number> {
    return [...Array(size).keys()].map(i => i + startAt);
}

export function characterRange(startChar:string, endChar:string) {
    return String.fromCharCode(...range(endChar.charCodeAt(0) -
            startChar.charCodeAt(0), startChar.charCodeAt(0)))
}

export function getNonAlphaNumericAsciiChars() {
    return '\r\n\t' + characterRange('!', '/') + characterRange(':', '@') + characterRange('[', '`') + characterRange('{', '~');
}

export function toDbParams(row:any) { 
    const dbRow = {}
    for (const key in row) {
        dbRow['$' + key] = row[key]
    }
    return dbRow
}