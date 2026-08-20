# Query Nudge Alexa Skill
Query Nudge is an Alexa skill that answers questions with results from Google via [SerpAPI](https://serpapi.com/). After answering the question and stating its source, the skill plays a short audio nudge and keeps the session open for another question. The session ends after the user says “end query”. 


## Repository Structure
```text
.
├── interactionModels/custom/en-US.json   # Alexa intents and sample utterances
├── lambda/index.js                       # Skill handlers and SerpAPI request
├── lambda/util.js                        # S3 presigned URL helper
├── lambda/package.json                   # Lambda dependencies
├── skill.json                            # Alexa skill manifest
└── sound_nudge_alexa.mp3                 # Example Audio nudge source file
```

## Configure Skill in Amazon Developer Console: 
1. Go to [Amazon Developer Services](https://developer.amazon.com/) and make an account. ***Note:*** To register, you will need to verify your identity with a government issued ID
2. Go to [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) and select "Create Skill"
    + Select "Other" for type of experience, "Custom" for the model type, and "Alexa-hosted (Node.js)" for hosting services
    + Under templates, select "Import Skill" and copy and paste the following link: 
    ```text 
    https://github.com/lankutse/audio-nudge-prototype.git
    ```

3. Once the skill is built, change the invocation name to "query nudge", save, and build the skill
<img width="1279" height="369" alt="image" src="https://github.com/user-attachments/assets/d64c60c9-f858-4361-974b-e098a1a5c3f8" />

4. Go to [SerpAPI](https://serpapi.com/) and sign up. Once your email and phone number have been verified, copy your private SerpAPI key from your dashboard.
<img width="1283" height="192" alt="image" src="https://github.com/user-attachments/assets/c12577b8-e7d2-4b89-b53d-6ca9a252fbd4" />

5. In the Alexa Developer Console, go to the "Code" tab & create a new file in the lambda folder titled ".env"
   <img width="1332" height="684" alt="image" src="https://github.com/user-attachments/assets/a801560c-6ef5-49cb-8afe-d4baf8d36fe9" />

6. Paste the following line into the .env file, and paste your SerpAPI key inside the quotes
```text
SERPAPI_API_KEY="<yourkeyhere>"
```

7. Download the sound_nudge_alexa.mp3 from this repository, and upload it to your S3 storage as shown below:
<img width="1192" height="730" alt="image" src="https://github.com/user-attachments/assets/896ebe16-6cf7-4882-981f-8787beee8871" />

8. After saving and deploying the skill, navigate to the "Test" tab and put the skill in development mode to interact with it.
<img width="1267" height="237" alt="image" src="https://github.com/user-attachments/assets/81e9800e-e7bf-40fe-bd03-8424fd62542d" />


## Add a New Audio Nudge Sound: 
[TO DO]


## Using The Skill: 
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

The question must be well formed without the prefix "Alexa, ask query nudge" to ensure proper web searching. For example, "Alexa, ask query nudge who was the first president" is well formed, but "Alexa, ask query nudge who the first president was" is not. 
```test 
"Alexa, ask query nudge who was the first president" -> "who was the first president" is searched
"Alexa, ask query nudge who the first president was" -> "who the first president was" is searched
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
