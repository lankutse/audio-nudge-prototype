require('dotenv').config(); 

const Alexa = require('ask-sdk-core');
const https = require('https');
const util = require('./util.js'); 

const QUESTION_PROMPT = 'What would you like to ask?';
const CONTINUE_PROMPT = 'What else would you like to ask? You can say end query when you are done.';

const search = question => new Promise((resolve, reject) => {
    https.get(`https://serpapi.com/search.json?engine=google&api_key=${process.env.SERPAPI_API_KEY}&q=${encodeURIComponent(question)}`, response => {
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


//takes answer to question & adds audio nudge at the end
const buildQuestionResponse = async (handlerInput) => {
    const question = Alexa.getSlotValue(handlerInput.requestEnvelope, 'question');
    const result = await search(question);
    const source = result.source.replace(/^https?:\/\/(?:www\.)?([^/]+).*$/i, '$1');
    
    //cases can be added here to change the audio nudge based on the type of question asked
    const nudge = escapeSsml(util.getS3PreSignedUrl("Media/sound_nudge_alexa.mp3"));


    const speech = `${escapeSsml(result.answer)} Source: ${escapeSsml(source)}. <audio src="${nudge}"/> ${CONTINUE_PROMPT}`;
    return handlerInput.responseBuilder
        .speak(speech)
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

const AskQuestionIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AskQuestionIntent';
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
 * by defining them above, then also adding them to the request handler chain below 
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
        AskQuestionIntentHandler,
        HelpIntentHandler,
        EndQuestionSessionIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler)
    .addErrorHandlers(ErrorHandler)
    .withCustomUserAgent('audio-nudge-prototype/v1.0')
    .lambda();