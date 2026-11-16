# Carousel: things I experimented with Claude this week

Eight slides, 1080 × 1350 px (4:5), `slide-01.png` to `slide-08.png`. Source: `slides.html`.

## Caption

Last winter five of us built a BIM model checker in a weekend. This week I handed the code to Claude, along with one interview that disagreed with the whole idea, and asked for an honest audit.

What came back:
→ our "auto-fix" had labelled a living room as an office to make a score go up
→ 12 of the 16 issues our tool reported were our own bugs
→ the engineer I interviewed did not have a language problem. They had a software version problem, twice, a week each time

So we rebuilt it. The new prototype checks every export against the person who has to open it. It runs in the browser, uploads nothing and fixes nothing.

One interview is a direction, not proof. Next step: showing it to the engineer who lost those two weeks.

Full write-up on Beyond Blueprints soon.

#BIM #IFC #openBIM #AEC #ConstructionTech #BuildInPublic #ProductDiscovery #Claude

## Alt text

1. Title: things I experimented with Claude this week.
2. Claude re-ran our old code; the tool had labelled a living room and an entry hall as "Office".
3. 12 of 16 reported issues were produced by our own bugs.
4. An engineer described two software version incidents, about a week each.
5. Table comparing what I assumed with what I heard.
6. Grid of three model exports against three recipients with verdicts. Demo data.
7. Tests came before the interface: 49 automated checks.
8. Three rules from the week.

## Before posting

The interview is paraphrased and anonymous on these slides. The respondent did not tick the box allowing quotation, so do not add quotes or identifying details without asking them.
