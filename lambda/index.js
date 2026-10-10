require('dotenv').config();

const Alexa = require('ask-sdk-core');
const https = require('https');
const util = require('./util.js');

//connects to amazon provided AWS account to save information between sessions
const AWS = require('aws-sdk');
const ddbAdapter = require('ask-sdk-dynamodb-persistence-adapter');

const persistenceAdapter = new ddbAdapter.DynamoDbPersistenceAdapter({
    tableName: process.env.DYNAMODB_PERSISTENCE_TABLE_NAME,
    createTable: false,
    dynamoDBClient: new AWS.DynamoDB({
        apiVersion: 'latest',
        region: process.env.DYNAMODB_PERSISTENCE_REGION
    })
});

//if desired, specify search sources below.
const sources = [
];

const sourceFilter = sources
  .map(domain => `site:${domain}`)
  .join(' OR ');

const QUESTION_PREFIXES = {
  WhatQuestionIntent: 'what',
  WhoQuestionIntent: 'who',
  WhyQuestionIntent: 'why',
  WhereQuestionIntent: 'where',
  HowQuestionIntent: 'how',
  CanQuestionIntent: 'can',
  ShouldQuestionIntent: 'should',
  WhenQuestionIntent: 'when'
};

//change audio nudge options below
const NUDGES = {
    sound1: {
        type: 'audio',
        value: 'Media/sound_nudge_alexa.mp3'
    },
    sound2: {
        type: 'audio',
        value: 'Media/sound_nudge_2.mp3'
    },
    voice1: {
        type: 'voice',
        value: 'What do you think about that?'
    },
    voice2: {
        type: 'voice',
        value: 'The information I looked up online relates to a health topic.'
    }
};

const QUESTION_PROMPT = 'What would you like to ask?';
const CONTINUE_PROMPT = 'What else would you like to ask? You can say end query when you are done.';

//uses serpAPI to search web, builds question response
const search = question => new Promise((resolve, reject) => {
 const searchQuery = sourceFilter
    ? `${question} (${sourceFilter})`
    : question;
  https.get(`https://serpapi.com/search.json?engine=google&api_key=${process.env.SERPAPI_API_KEY}&q=${encodeURIComponent(searchQuery)}&hl=en`,response => {
      let body = '';
      response.on('data', chunk => body += chunk);
      response.on('end', () => {
          try {
              const data = JSON.parse(body);

              //uses ai overview unless unavailable; then uses first organic search result
              const organicResult = data.organic_results && data.organic_results[0];
              const aiOverview = data.ai_overview && data.ai_overview.text_blocks
                                      && data.ai_overview.text_blocks.find(block => block.snippet);
              if (aiOverview) {
                  const refrence = data.ai_overview.references && data.ai_overview.references[0];
                  resolve({
                      answer: aiOverview.snippet,
                      source: refrence && refrence.link
                          ? refrence.link
                          : 'Google AI Overview'
                  });
                  } else if (organicResult && organicResult.snippet) {
                      resolve({
                          answer: organicResult.snippet,
                          source: organicResult.link
                      });
                  } else {
                      reject(new Error('No answer found'));
                  }
          } catch (error) {
              reject(error);
          }
      });
  }
  ).on('error', reject);
});


const escapeSsml = text => text.replace(/[&<>]/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]);
  
//helper function for the settings mode; makes nudges preview before the user selects them
const buildNudgePreview = nudge => {
      if (nudge.type === 'audio') {
          const url = util.getS3PreSignedUrl(nudge.value);
          return `<audio src="${escapeSsml(url)}"/>`;
      }

      return escapeSsml(nudge.value);
  };

//answers question and plays audio or voice nudge
const buildQuestionResponse = async (handlerInput) => {
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    const slotValue = Alexa.getSlotValue(
        handlerInput.requestEnvelope,
        'question'
    );

    const prefix = QUESTION_PREFIXES[intentName];
    const question = prefix ? `${prefix} ${slotValue}` : slotValue;
    const result = await search(question);

    const source = result.source.replace(
        /^https?:\/\/(?:www\.)?([^/]+).*$/i,
        '$1'
    );

    const persistentAttributes =
        await handlerInput.attributesManager.getPersistentAttributes() || {};

    const selectedNudge =
        NUDGES[persistentAttributes.nudge] || NUDGES.sound1;

    const answerSpeech =
        `${escapeSsml(result.answer)} Source: ${escapeSsml(source)}.`;

    if (selectedNudge.type === 'audio') {
        const nudge = `<audio src="${escapeSsml(
            util.getS3PreSignedUrl(selectedNudge.value)
        )}"/>`;

        const speech =
            `${answerSpeech} ${nudge} ${CONTINUE_PROMPT}`;

        return handlerInput.responseBuilder
            .speak(speech)
            .reprompt(CONTINUE_PROMPT)
            .getResponse();
    }

    const speech =
        `${answerSpeech} `
        + `<break time="2s"/> `
        + `${escapeSsml(selectedNudge.value)} `
        + `<break time="3s"/> `
        + CONTINUE_PROMPT;

    return handlerInput.responseBuilder
      .speak(`${answerSpeech} <break time="1s"/> ${escapeSsml(selectedNudge.value)}`)
      .reprompt(CONTINUE_PROMPT)
      .getResponse();
};

//triggered with 'alexa, open query nudge'
const LaunchRequestHandler = {
  canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  //runs when canhandle is true
  handle(handlerInput) {
      const speakOutput = `Welcome to Query Nudge. ${QUESTION_PROMPT}`;
      return handlerInput.responseBuilder
          .speak(speakOutput)
          .reprompt(speakOutput) //keeps microphone active for 8 seconds; if the user doesnt speak alexa repeats prompt
          .getResponse();
  }
};


const SettingsIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SettingsIntent';
    },

    async handle(handlerInput) {
        const attributesManager = handlerInput.attributesManager;
        const sessionAttributes = attributesManager.getSessionAttributes();

        const requestedType = (
            Alexa.getSlotValue(handlerInput.requestEnvelope, 'nudgeType') || ''
        ).toLowerCase();

        const requestedNumber = (
            Alexa.getSlotValue(handlerInput.requestEnvelope, 'nudgeNumber') || ''
        ).toLowerCase();

        const category = requestedType || sessionAttributes.settingsCategory;
        const number = {
            one: '1',
            two: '2',
            1: '1',
            2: '2'
        }[requestedNumber];

        if (category !== 'sound' && category !== 'voice') {
            sessionAttributes.settingsCategory = null;
            attributesManager.setSessionAttributes(sessionAttributes);

            const prompt =
                'Would you like a sound nudge or a voice nudge?';

            return handlerInput.responseBuilder
                .speak(prompt)
                .reprompt(prompt)
                .getResponse();
        }

         if (!number) {
      sessionAttributes.settingsCategory = category;
      attributesManager.setSessionAttributes(sessionAttributes);

      const nudgeOne = buildNudgePreview(NUDGES[`${category}1`]);
      const nudgeTwo = buildNudgePreview(NUDGES[`${category}2`]);

      const prompt =
          `Here is ${category} one. ${nudgeOne} `
          + `Here is ${category} two. ${nudgeTwo} `
          + `Would you like ${category} one or ${category} two?`;

      return handlerInput.responseBuilder
          .speak(prompt)
          .reprompt(prompt)
          .getResponse();
  }

        const selectedNudge = `${category}${number}`;

        const persistentAttributes =
            await attributesManager.getPersistentAttributes() || {};

        attributesManager.setPersistentAttributes(
          Object.assign({}, persistentAttributes, { nudge: selectedNudge })
          );


        await attributesManager.savePersistentAttributes();

        delete sessionAttributes.settingsCategory;
        attributesManager.setSessionAttributes(sessionAttributes);

        const spokenNumber = number === '1' ? 'one' : 'two';

        return handlerInput.responseBuilder
            .speak(
                `Your default nudge is now ${category} ${spokenNumber}. `
                + QUESTION_PROMPT
            )
            .reprompt(QUESTION_PROMPT)
            .getResponse();
    }
};

const AskQuestionIntentHandler = {
  canHandle(handlerInput) {
      if (Alexa.getRequestType(handlerInput.requestEnvelope) !== 'IntentRequest') {
          return false;
      }

      const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
      return intentName === 'AskQuestionIntent' || Boolean(QUESTION_PREFIXES[intentName]);
  },
  handle: buildQuestionResponse
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
          && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
      const speakOutput = `You can ask me any question, or say end query if you are done. ${QUESTION_PROMPT}`;
      return handlerInput.responseBuilder
          .speak(speakOutput)
          .reprompt(speakOutput)
          .getResponse();
  }
};

const EndQuestionSessionIntentHandler = {
  canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
          && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
              || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent'
              || Alexa.getIntentName(handlerInput.requestEnvelope) === 'EndQuestionSessionIntent');
  },
  handle(handlerInput) {
      const speakOutput = 'Query Session Ended. Goodbye!';
      return handlerInput.responseBuilder
          .speak(speakOutput)
          .getResponse();
  }
};


//CODE BELOW IS DIRECTLY FROM AMAZON:
/* *
* FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
* It must also be defined in the language model (if the locale supports it)
* This handler can be safely added but will be ingnored in locales that do not support it yet
* */
const FallbackIntentHandler = {
  canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
          && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
  },
  handle(handlerInput) {
      const speakOutput = 'Sorry, I don\'t know about that. Please try again.';

      return handlerInput.responseBuilder
          .speak(speakOutput)
          .reprompt(speakOutput)
          .getResponse();
  }
};
/* *
* SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open
* session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not
* respond or says something that does not match an intent defined in your voice model. 3) An error occurs
* */
const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
      console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
      // Any cleanup logic goes here.
      return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
  }
};
/* *
* The intent reflector is used for interaction model testing and debugging.
* It will simply repeat the intent the user said. You can create custom handlers for your intents
* by defining them above, then also adding them to the skill builder below
* */
const IntentReflectorHandler = {
  canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
  },
  handle(handlerInput) {
      const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
      const speakOutput = `You just triggered ${intentName}`;

      return handlerInput.responseBuilder
          .speak(speakOutput)
          //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
          .getResponse();
  }
};
/**
* Generic error handling to capture any syntax or routing errors. If you receive an error
* stating the request handler chain is not found, you have not implemented a handler for
* the intent being invoked or included it in the skill builder below
* */
const ErrorHandler = {
  canHandle() {
      return true;
  },
  handle(handlerInput, error) {
      const speakOutput = 'Sorry, I had trouble doing what you asked. Please try again.';
      console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

      return handlerInput.responseBuilder
          .speak(speakOutput)
          .reprompt(speakOutput)
          .getResponse();
  }
};

//translate skill into standard AWS lambda handler signature
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        SettingsIntentHandler,
        AskQuestionIntentHandler,
        HelpIntentHandler,
        EndQuestionSessionIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler)
    .addErrorHandlers(ErrorHandler)
    .withPersistenceAdapter(persistenceAdapter)
    .withCustomUserAgent('audio-nudge-prototype/v1.0')
    .lambda();