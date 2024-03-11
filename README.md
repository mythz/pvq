# pvq
pvq website

DB
 - gemma:2b
 - phi2
 - starcoder

DR
 - mistral:7b
 - codellama
 - gemma:7b
 - starcoder-15b
 - mixtral

Format:

    /000/000/009.json - question
    /000/000/009.a.gemma-2b.json - Answer from Gemma 2B
    /000/000/009.a.mistral.json - Answer from Mistral 7B
    /000/000/009.h.accepted.json - Accepted Answer
    /000/000/009.h.most-voted.json - Most Voted Answer
    /000/000/009.meta.json - answers ranked according another model pass
