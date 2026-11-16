# The file was fine

*A draft essay for Beyond Blueprints, written in Mia's voice. Edit freely. It paraphrases one interview and quotes nothing, because quotation was not authorised.*

Last winter five of us spent a weekend building a tool to solve a problem none of us had checked was real.

The idea was good. I still think it is good. Engineers build models in the vocabulary of their office and their language. Clients check deliveries against a list of required properties with official names. Somewhere between the two, a fire rating that exists in the model under one name is reported as missing under another, and the delivery comes back. We would catch that. We would read the model, compare it with the requirement, translate the terms, and fix the file.

In twenty-six hours we had all of it. Upload a model, get a readiness score, see the mismatched terms with German suggestions beside them, press a button, download a corrected file. There was an agent, a protocol server, three language models to choose from and a dashboard with a ring that filled in green. We called it Ship the BIM.

Nine months later I sent an interview sheet to a senior BIM engineer. The fourth question asked for the last time a language or naming difference had caused a problem, step by step.

The answer described two problems. Neither was about language.

## Two weeks

In the first, a team exported a set of models for a client. Some arrived with every parameter in place. Others arrived with parameters missing or shuffled. The models themselves were correct. The team had checked them more than once. The client put the files side by side, saw the difference and rejected the set.

It took about a week, and everyone on the team, to find out why. Some people had the latest version of an export plug-in. Others had an intermediate version with defects. Same model, same settings, different machine, different file.

In the second, a supplier could not open an IFC file. The sender could. Over a week, about ten variants went back and forth until one worked. The supplier was running an old release of their software that did not understand the newer version of the format.

Each happened once. Each was found by the person at the other end.

## What I had not seen

I had pictured the model as the thing that is right or wrong. Our tool reflected that: it opened one file and passed judgment on its contents.

Both stories are about something else. The file was fine. What differed was the machine that wrote it and the machine that read it. A delivery is a file in transit between two environments, and it can fail at either end while its contents stay exactly as the modeller intended.

Our tool could not have caught either incident. It had no idea who the file was for. It had never looked at the three lines at the top of every IFC file that say what software wrote it.

There is a second thing in those answers, quieter and more uncomfortable. Asked what would change if the problem vanished, the answer was modest: fewer extra checks, more time for the real work. No transformation. The incidents were painful and rare. A product for a rare pain has to cost almost nothing to keep running, or nobody keeps it running.

## What the rebuild turned up

Before starting again, I had the old code run against its own sample model and looked at what came out. I had never done this carefully. During the weekend there was always something more urgent than reading our own output.

The sample model has two rooms: a living room and an entry hall. Our fixer had labelled both of them "Office".

The rule said the room's usage type must be one of a list. The rooms had no usage type. The tool needed a suggestion, so it took the first item on the list. Had the model contained doors, each would have been given a fire rating of thirty minutes for the same reason.

The readiness score went up.

I find this harder to think about than the interview. Being wrong about a market is ordinary. Building a tool that makes a model less true in order to make a number greener is a different kind of mistake, and we made it in the feature we were proudest of. Nobody intended it. It is simply what happens when the goal is a passing check and the tool is allowed to write.

The same run showed that twelve of the sixteen issues on that model were produced by our own bugs. And that a panel labelled as an AI suggestion, with a confidence of 85 percent, was a hard-coded sentence. We were not trying to deceive anyone. We were trying to finish.

## Three things I now believe

**The interesting failures are between things.** A model checked in isolation can be perfect and still fail. What fails is the relationship: this export against that recipient, this workstation against the one next to it. Tools that examine a single object are easier to build, which is why there are so many of them.

**A tool that edits should be held to a higher standard than a tool that reports.** A wrong warning wastes a minute. A wrong value in a property set stays there, looks like data, and is copied into a schedule. The rebuilt prototype does not write to models at all.

**The cheapest research is a question about last time.** My interview sheet named my hypothesis in the question and even supplied an example. A less careful respondent would have obliged me with a story that fitted. This one answered the question underneath, about what actually goes wrong. I got the most valuable answer because my question was ignored.

## What I am not concluding

I am not concluding that language does not matter. One engineer, working in English at an international practice, is the setting where it matters least. A municipal project in Germany with requirements written in German might tell the story I expected. I have not asked yet. I should have asked before the weekend.

I am also not concluding that the weekend was wasted. The deterministic core was right. The habit of treating rules as data was right. And without a finished, wrong thing to look at, I would not have known what question to ask.

## What we built instead

The new prototype is called Handshake. It runs in a browser tab and uploads nothing. You drop in exports and it reads the header of each one: format version, exporter, author. You tell it who receives your models and what their software can open, and whether you know that or are guessing. It shows a grid of exports against recipients and says, for each pair, whether there is a known reason it will fail.

If the recipient cannot open the version, it lists what would be lost by exporting an older one. If two people exported the same model and one file carries fewer properties, it shows which, and which exporter each of them used. When you record that a delivery opened or did not, the next check for that recipient uses the answer.

It is a smaller tool than the first one. There is no score and no agent, and it does not fix anything. I think it would have saved those two weeks. I will not know until the engineer who lost them has tried it, which is the step I skipped the first time.
