# Audio Nudge Alexa skill

Audio Nudge is an Alexa custom skill that reads the top snippet from Google Programmable Search and then says, “An audio nudge would play here.” It continues prompting for questions until the user says “end question session,” “stop,” or “cancel.”

## Configuration

1. Create a Programmable Search Engine and enable the Custom Search JSON API in Google Cloud.
2. Configure these environment variables on every Lambda endpoint used by the skill:
   - `GOOGLE_API_KEY`: the Google Cloud API key with access restricted to the Custom Search JSON API.
   - `GOOGLE_SEARCH_ENGINE_ID`: the Programmable Search Engine identifier (`cx`).
3. Deploy the contents of `lambda/`, then build and deploy `interactionModels/custom/en-US.json` and `skill.json` with the ASK CLI or Alexa developer console.

Do not add either credential to this repository. The skill requests one SafeSearch-enabled English result and imposes a 4.5-second search timeout so Alexa can return a useful retry prompt.

## Test

From `lambda/`, install dependencies and run:

```sh
npm install
npm test
```

The tests use injected search responses and do not contact Google or require credentials.
