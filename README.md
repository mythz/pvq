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
 - ~~starcoder2:15b~~
 - deepseek-coder:6.7b
 - mixtral

Format:

    /000/000/009.json - question
    /000/000/009.a.gemma-2b.json - Answer from Gemma 2B
    /000/000/009.a.mistral.json - Answer from Mistral 7B
    /000/000/009.h.accepted.json - Accepted Answer
    /000/000/009.h.most-voted.json - Most Voted Answer
    /000/000/009.meta.json - answers ranked according another model pass


## TODO

DR

- [x] Ranking of answers
- [ ] Test generation of comments for good context for highest rate answers
- [x] Store answer ranking etc in `???.meta.json`
- [x] Add string? `CreatedBy`, `ModifiedBy` and `RefId` Column to Post
- [x] Rename stackoverflow-shootout bucket to pvq - Keeping stackoverflow-shootout for dev
- [x] Create pvq-build bucket, move all /sql, app.db + other non-data to it
- [x] Meta prompt for enhancing answers
- [x] Scripts to populate ModelVotes in DB
- [x] Scripts to calculate Leaderboard Page
- [x] Leaderboard Page and Blog Post
- [x] Setup Worker Scripts
- [x] Create Best ServiceStack Discourse Questions Use ?refId=[discourse post id]
- [x] Fix Missing and Undefined Separate step to extract votes from full validation response
- [x] Fix User Missing Avatar (Leaderboard)
- [x] Win Rate only what they participate in
- [ ] Min 50 votes for total score and Take only models we have generated answers for
- [ ] Create workflow to handle rank response missing votes for answers, should be the same as ranking a new answer
- [ ] Investigate use of framework DSPy for more reliable prompting, and option for future RAG solution for docs


DB

- [ ] API to update all user passwords
- [ ] API to retrieve FS/R2 question.json
- [ ] Delete Questions
- [ ] About BlogPost and Page
- [ ] Add Human Answer
- [ ] Edit Question/Answers

