const Alexa = require('ask-sdk-core');
const https = require('https');

const QUESTION_PROMPT = 'What would you like to ask?';
const CONTINUE_PROMPT = 'What else would you like to ask? You can say end question session when you are done.';
const NUDGE_MESSAGE = 'An audio nudge would play here.';

class SearchError extends Error {
    constructor(code, message, statusCode) {
        super(message);
        this.name = 'SearchError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

function getJson(url, timeoutMs = 4500) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, { headers: { Accept: 'application/json' } }, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject(new SearchError('HTTP_ERROR', 'Google returned a non-success status.', response.statusCode));
                    return;
                }
                try {
                    resolve(JSON.parse(body));
                } catch (_error) {
                    reject(new SearchError('INVALID_RESPONSE', 'Google returned invalid JSON.'));
                }
            });
        });

        request.setTimeout(timeoutMs, () => {
            request.destroy(new SearchError('TIMEOUT', 'Google search timed out.'));
        });
        request.on('error', (error) => {
            reject(error instanceof SearchError
                ? error
                : new SearchError('NETWORK_ERROR', error.message));
        });
    });
}

async function searchTopResult(question) {
    const apiKey = process.env.GOOGLE_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    if (!apiKey || !searchEngineId) {
        throw new SearchError('CONFIGURATION_ERROR', 'Google search credentials are not configured.');
    }

    const url = new URL('https://customsearch.googleapis.com/customsearch/v1');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', searchEngineId);
    url.searchParams.set('q', question);
    url.searchParams.set('num', '1');
    url.searchParams.set('safe', 'active');
    url.searchParams.set('hl', 'en');

    const payload = await getJson(url);
    if (payload && payload.error) {
        throw new SearchError('API_ERROR', payload.error.message || 'Google reported an API error.');
    }

    const rawSnippet = payload && payload.items && payload.items[0] && payload.items[0].snippet;
    const snippet = typeof rawSnippet === 'string'
        ? rawSnippet.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000)
        : '';
    if (!snippet) throw new SearchError('NO_RESULTS', 'No usable Google search result was found.');
    return snippet;
}

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
