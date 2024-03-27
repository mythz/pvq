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

- [ ] Ranking of answers
- [ ] Test generation of comments for good context for highest rate answers
- [ ] Store answer ranking etc in `???.meta.json`
- [x] Add string? `CreatedBy`, `ModifiedBy` and `RefId` Column to Post
- [ ] Rename stackoverflow-shootout bucket to pvq
- [x] Create pvq-build bucket, move all /sql, app.db + other non-data to it
- [x] Meta prompt for enhancing answers
- [ ] Scripts to populate ModelVotes in DB
- [ ] Scripts to calculate Leaderboard Page
- [ ] Leaderboard Page and Blog Post
- [ ] Setup Worker Scripts
- [ ] Create Best ServiceStack Discourse Questions Use ?refId=[discourse post id]

DB

- [ ] API to update all user passwords
- [ ] API to retrieve FS/R2 question.json
- [ ] Delete Questions
- [ ] About BlogPost and Page
- [ ] Add Human Answer
- [ ] Edit Question/Answers

