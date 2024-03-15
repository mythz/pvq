# pvq
pvq website

DB
 - gemma:2b
 - phi
 - starcoder2:3b

DR
 - mistral:7b
 - codellama:13B
 - gemma:7b
 - starcoder2:15b
 - mixtral

Format:

    /000/000/009.json - question
    /000/000/009.a.gemma-2b.json - Answer from Gemma 2B
    /000/000/009.a.mistral.json - Answer from Mistral 7B
    /000/000/009.h.accepted.json - Accepted Answer
    /000/000/009.h.most-voted.json - Most Voted Answer
    /000/000/009.meta.json - answers ranked according another model pass


## TODO
- [ ] Import human answers
- [ ] Create full text search db
- [ ] Ranking of answers
- [ ] Test generation of comments for good context for highest rate answers
- [ ] Store answer ranking etc in `???.meta.json`