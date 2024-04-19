import { useClient } from './lib.mjs'

export interface RankTaskDto {
    answerId: string,
    postId: number,
    title: string,
    tags: string[],
    body: string,
    answerBody: string,
}
export interface RankResult {
    score: number,
    reason: string
}

const expectedReasonsSchema = {
    "reason": "Your reason goes here. Below score is only an example. Score should reflect the review of the answer.",
    "score": 1
}

export function rankAnswerRequest({ answerId, postId, title, body, tags, answerBody}:RankTaskDto, model:string) {
    return {
        model,
        answerId,
        postId,
        maxTokens: 1024,
        temperature: 0.1,
        systemPrompt: {
            "role": "system",
            "content": "You are an AI assistant that votes on the quality and relevance of answers to a given question. Before giving votes, give an critique of each answer based on quality and relevance."
        },
        content: 
    `Below I have a user question and an answer to the user question. I want you to give a score out of 10 based on the quality in relation to the original user question. 
    
## Original User Question

Title: ${title}
Body:
${body}
Tags: ${tags.join(', ')}
---

Critique the below answer to justify your score, providing a brief explanation before returning the simple JSON object showing your reasoning and score.

Think about the answer given in relation to the original user question. Use the tags to help you understand the context of the question.

## Answer Attempt

${answerBody}
---

Now review and score the answer above out of 10.

Concisely articulate what a good answer needs to contain and how the answer provided does or does not meet those criteria.

- If the answer has mistakes or does not address all the question details, score it between 0-2. 
- If the answer is correct, but could be improved, score it between 3-6. 
- If the answer is correct and provides a good explanation, score it between 7-9.
- If the answer is perfect and provides a clear and concise explanation, score it 10. 

Because these are coding questions, mistakes in the code are critical and should be scored lower. Look closely at the syntax and logic of the code for any mistakes. Missing mistakes in reviews leads to a failed review, and many answers are not correct.

You MUST provide a JSON object with the following schema:

## Example JSON Response

\`\`\`json
${JSON.stringify(expectedReasonsSchema, null, 4)}
\`\`\`

Use code fences, aka triple backticks, to encapsulate your JSON object.
`
    }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function rankAnswerResponse({ answerId, postId, model, content, systemPrompt, temperature, maxTokens }) {
    const { openAi, openAiResponse } = useClient()

    let retry = 0
    let elapsed_ms = 0
    let txt:any = null
    let res = null
    let r:Response|null = null
    let startTime = performance.now()
    
    while (retry++ <= 10) {
        let sleepMs = 1000 * retry
        try {
            let reqOptions = {content, model, systemPrompt, temperature, maxTokens}
            r = await openAi(reqOptions)
            let endTime = performance.now()
            elapsed_ms = endTime - startTime
    
            console.log(`=== RESPONSE ${postId} in ${elapsed_ms}ms ===\n`)
            txt = await r.text()
    
            if (!r.ok) {
                console.log(`${r.status} openAi request ${retry + 1} failed: ${txt}`)
                if (r.status === 429) {
                    // Try handle GROQ rate limiting, if not found, defaults to 1000ms
                    console.log(`Rate limited, retry-after ${r.headers.get('retry-after')} seconds...`)
    
                    const retryAfter = parseInt(r.headers.get('retry-after') ?? '')
                    if (!isNaN(retryAfter)) {
                        sleepMs = retryAfter * 1000
                    }
                }
            } else {
                res = openAiResponse(txt, model)
            }
            if (res) break
        } catch (e) {
            console.error(`Failed:`, JSON.stringify({postId, error: e.message, stacktrace: e.stacktrace}, null, 4))
            return null
        }
        console.log(`retrying in ${sleepMs}ms...`)
        await sleep(sleepMs)
    }
    
    let responseContent = txt.length > 0 && res?.choices?.length > 0 && res.choices[0].message?.content
    if (!responseContent) {
        console.error(`Empty response from ${answerId}`)
        return null
    }
    
    let structuredReasons:any = null
    let finalJson = ''
    
    let usedMarkdown = false;
    
    if (responseContent.trim().startsWith('{')) {
        // Try to extract the JSON from the response, if it's already JSON
        finalJson = responseContent.trim()
    } else if (responseContent.trim().startsWith('"reason')) {
        // Try to extract the JSON from the response, if it looks like broken json
        responseContent = `{\n${responseContent.trim()}`
        finalJson = responseContent
    } else {
        structuredReasons = responseContent.match(/(?<=```json\n)\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/);

        if (structuredReasons == null || structuredReasons.length === 0) {
            // Try without `json` after triple backticks
            structuredReasons = responseContent.match(/(?<=```\n)\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/);
        }

        if (structuredReasons == null || structuredReasons.length === 0) {
            console.error(`No structured reasons found in response: ${responseContent}`);
            return null
        }
    
        // Take first structured reason that contains the string 'score' and 'reason'
        structuredReasons = structuredReasons.filter(x => x.includes('score') && x.includes('reason'))
    
        if (structuredReasons.length === 0) {
            console.error(`No valid structured reasons found in response: ${responseContent}`);
            return null
        }
    
        const isValid = structuredReasons[0].includes('score') && structuredReasons[0].includes('reason')
        if (!isValid) {
            console.error(`Invalid structured reasons found in response: ${responseContent}`);
            return null
        }
    
        finalJson = structuredReasons[0]
        usedMarkdown = true
    }
    
    if (!finalJson) return null

    // try fix JSON output, invalid JSON tends to happen outside of the model using code fences
    // HACKY but models don't already produce valid JSON, and we don't want to waste responses
    if (!usedMarkdown) {
        finalJson = finalJson.replaceAll('\\', '').replaceAll('```json', '').replaceAll('```', '');
    
        // Count how many double quotes are in the finalJson
        let doubleQuotes = (finalJson.match(/"/g) || []).length
        // If the number of double quotes is > 4, then we need to remove the extra double quotes
        if (doubleQuotes > 4) {
            let indexOfReason = finalJson.indexOf('"reason": "');
            let indexOfScore = finalJson.indexOf('"score"');
    
        // Replace all double quotes after the first occurrence of "reason" key and before the first occurrence of "score"
        let reason = finalJson.substring(indexOfReason + 11, indexOfScore - 10).replaceAll('"', '\'');
        // Replace old reason with new reason
            finalJson = finalJson.replace(finalJson.substring(indexOfReason + 11, indexOfScore - 10), reason);
        }
    
        // Find the last '}' bracket that occurs shortly after the 'score' key
        let lastBracket = finalJson.lastIndexOf('}');
        let indexOfScore = finalJson.lastIndexOf('"score"');
        if (indexOfScore - lastBracket < -5) {
            // Remove everything after the last bracket
            finalJson = finalJson.substring(0, lastBracket + 1)
        }
    }
    
    try {
        console.log(`JSON found ${finalJson.length}`)
        console.log(`=== STRUCTURED REASONS for ${answerId} ===`)
        console.log(finalJson)
        console.log(`=== END STRUCTURED REASONS for ${answerId} in ${performance.now() - startTime}ms ===\n\n`)
    } catch(e) {
        console.error(`Failed finalJson: ${finalJson}`, e)
        return null
    }
    
    let rankResult:RankResult|null = null
    try {
        rankResult = JSON.parse(finalJson)
    } catch (e) {
        console.error(`Failed to parse JSON`, e, finalJson)
        return null
    }    
    if (rankResult == null || rankResult.score == null || rankResult.reason == null) {
        console.error(`Invalid vote result for ${answerId}: ${finalJson}`)
        return null
    }    
    if (rankResult.score == null || rankResult.reason == null) {
        console.error(`Invalid vote result for ${answerId}: ${structuredReasons[0]}`)
        return null
    }

    return rankResult
}