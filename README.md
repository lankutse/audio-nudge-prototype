# Query Nudge Alexa Skill
Query Nudge is an Alexa skill that answers questions with results from
Google via [SerpAPI](https://serpapi.com/). After answering the question and stating its source, the skill plays a short audio nudge and keeps the session open for another question. The session ends after the user says “end query”. 


## Repository structure
```text
.
├── interactionModels/custom/en-US.json   # Alexa intents and sample utterances
├── lambda/index.js                       # Skill handlers and SerpAPI request
├── lambda/util.js                        # S3 presigned URL helper
├── lambda/package.json                   # Lambda dependencies
├── skill.json                            # Alexa skill manifest
└── sound_nudge_alexa.mp3                 # Example Audio nudge source file
```

## Configure skill in Amazon Dev Console: 
[TO DO] 


## Add a New Audio Nudge Sound: 
[TO DO]


## Using the skill: 
The skill supports a two-step conversation:
```text
User: Alexa, open query nudge.
Alexa: Welcome to Query Nudge. What would you like to ask?
User: Why is the sky blue?
```

It also supports asking the question in the invocation:
```text
Alexa, ask query nudge why is the sky blue.
```

Questions can begin with `what`, `who`, `why`, `where`, `how`, or `can`: 
```text
what causes an eclipse
who was Marie Curie
why is the sky blue
where is the Eiffel Tower
how does photosynthesis work
can I freeze milk
```

The following 4 command-style utterances are also supported:
```text
<explain> quantum computing
<find information about> Saturn
<tell me about> blue whales
<search for> iron supplements
```
Say `end query`, `stop`, or `cancel` to end the session. Say `help` for usage
guidance.


## Notes: 
+ The skill uses a Google AI Overview when available, otherwise it uses the first organic result & its snippet as the answer. 
+  Alexa speaks the answer followed by the source hostname. For example, a source such as `https://en.wikipedia.org/wiki/University_of_Michigan` is spoken as `wikipedia.org`
+ The SerpAPI HTTP request has no explicit timeout. If it takes longer than Alexa or Lambda allows, Alexa may report that the skill did not respond.
+ The interaction model currently targets US English (`en-US`).