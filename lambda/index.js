const Alexa = require('ask-sdk-core');
const { searchTopResult } = require('./google-search');

const QUESTION_PROMPT = 'What would you like to ask?';
const CONTINUE_PROMPT = 'What else would you like to ask? You can say end question session when you are done.';
const NUDGE_MESSAGE = 'An audio nudge would play here.';

function escapeForSsml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function createHandler({ search = searchTopResult } = {}) {
    const LaunchRequestHandler = {
        canHandle(handlerInput) {
            return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
        },
        handle(handlerInput) {
            const speech = `Welcome to Audio Nudge. ${QUESTION_PROMPT}`;
            return handlerInput.responseBuilder.speak(speech).reprompt(QUESTION_PROMPT).getResponse();
        }
    };

    const AskQuestionIntentHandler = {
        canHandle(handlerInput) {
            return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
                && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AskQuestionIntent';
        },
        async handle(handlerInput) {
            const question = Alexa.getSlotValue(handlerInput.requestEnvelope, 'question');
            if (!question || !question.trim()) {
                const speech = `I did not hear a question. ${QUESTION_PROMPT}`;
                return handlerInput.responseBuilder.speak(speech).reprompt(QUESTION_PROMPT).getResponse();
            }

            try {
                const snippet = await search(question.trim());
                const speech = `${escapeForSsml(snippet)} ${NUDGE_MESSAGE} ${CONTINUE_PROMPT}`;
                return handlerInput.responseBuilder.speak(speech).reprompt(CONTINUE_PROMPT).getResponse();
            } catch (error) {
                const noResult = error && error.code === 'NO_RESULTS';
                console.error('Google search failed', {
                    code: error && error.code,
                    statusCode: error && error.statusCode,
                    message: error && error.message
                });
                const speech = noResult
                    ? `I could not find a good result for that question. ${CONTINUE_PROMPT}`
                    : `Search is unavailable right now. ${CONTINUE_PROMPT}`;
                return handlerInput.responseBuilder.speak(speech).reprompt(CONTINUE_PROMPT).getResponse();
            }
        }
    };

    const EndQuestionSessionIntentHandler = {
        canHandle(handlerInput) {
            if (Alexa.getRequestType(handlerInput.requestEnvelope) !== 'IntentRequest') return false;
            const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
            return intentName === 'EndQuestionSessionIntent'
                || intentName === 'AMAZON.CancelIntent'
                || intentName === 'AMAZON.StopIntent';
        },
        handle(handlerInput) {
            return handlerInput.responseBuilder.speak('Question session ended. Goodbye.').getResponse();
        }
    };

    const HelpIntentHandler = {
        canHandle(handlerInput) {
            return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
                && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
        },
        handle(handlerInput) {
            const speech = `Ask me any question and I will search for an answer. ${CONTINUE_PROMPT}`;
            return handlerInput.responseBuilder.speak(speech).reprompt(CONTINUE_PROMPT).getResponse();
        }
    };

    const FallbackIntentHandler = {
        canHandle(handlerInput) {
            return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
                && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
        },
        handle(handlerInput) {
            const speech = `I did not understand that. Please ask a question, or say end question session.`;
            return handlerInput.responseBuilder.speak(speech).reprompt(CONTINUE_PROMPT).getResponse();
        }
    };

    const SessionEndedRequestHandler = {
        canHandle(handlerInput) {
            return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
        },
        handle(handlerInput) {
            console.log(`Session ended: ${JSON.stringify(handlerInput.requestEnvelope.request.reason)}`);
            return handlerInput.responseBuilder.getResponse();
        }
    };

    const ErrorHandler = {
        canHandle() {
            return true;
        },
        handle(handlerInput, error) {
            console.error('Unhandled skill error', error);
            const speech = `Sorry, I had trouble with that. ${CONTINUE_PROMPT}`;
            return handlerInput.responseBuilder.speak(speech).reprompt(CONTINUE_PROMPT).getResponse();
        }
    };

    return Alexa.SkillBuilders.custom()
        .addRequestHandlers(
            LaunchRequestHandler,
            EndQuestionSessionIntentHandler,
            AskQuestionIntentHandler,
            HelpIntentHandler,
            FallbackIntentHandler,
            SessionEndedRequestHandler
        )
        .addErrorHandlers(ErrorHandler)
        .withCustomUserAgent('audio-nudge/v1.0')
        .lambda();
}

exports.createHandler = createHandler;
exports.handler = createHandler();
