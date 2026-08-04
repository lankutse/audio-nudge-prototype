const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('./index');

function envelope(request) {
    return {
        version: '1.0',
        context: {
            System: {
                application: { applicationId: 'test' },
                user: { userId: 'test' },
                device: { deviceId: 'test', supportedInterfaces: {} },
                apiEndpoint: 'https://api.amazonalexa.com'
            }
        },
        session: { new: false, sessionId: 'test', application: { applicationId: 'test' }, user: { userId: 'test' } },
        request
    };
}

function invoke(handler, request) {
    return new Promise((resolve, reject) => {
        handler(envelope(request), {}, (error, response) => {
            if (error) reject(error);
            else resolve(response);
        });
    });
}

function intentRequest(name, question) {
    const slots = question === undefined ? {} : { question: { name: 'question', value: question } };
    return { type: 'IntentRequest', requestId: 'test', timestamp: new Date(0).toISOString(), locale: 'en-US', intent: { name, confirmationStatus: 'NONE', slots } };
}

test('launch prompts for a question and keeps the session open', async () => {
    const response = await invoke(createHandler(), { type: 'LaunchRequest', requestId: 'test', timestamp: new Date(0).toISOString(), locale: 'en-US' });
    assert.match(response.response.outputSpeech.ssml, /What would you like to ask/);
    assert.equal(response.response.shouldEndSession, false);
    assert.ok(response.response.reprompt);
});

test('a successful answer includes escaped snippet and nudge message', async () => {
    const handler = createHandler({ search: async () => 'Fish & chips <history>' });
    const response = await invoke(handler, intentRequest('AskQuestionIntent', 'food history'));
    assert.match(response.response.outputSpeech.ssml, /Fish &amp; chips &lt;history&gt;/);
    assert.match(response.response.outputSpeech.ssml, /An audio nudge would play here/);
    assert.equal(response.response.shouldEndSession, false);
});

test('no results prompt for another question without the nudge message', async () => {
    const handler = createHandler({ search: async () => { throw new SearchFailure('NO_RESULTS'); } });
    const response = await invoke(handler, intentRequest('AskQuestionIntent', 'unknown'));
    assert.match(response.response.outputSpeech.ssml, /could not find a good result/);
    assert.doesNotMatch(response.response.outputSpeech.ssml, /audio nudge would play here/);
    assert.equal(response.response.shouldEndSession, false);
});

test('end question session closes the session', async () => {
    const response = await invoke(createHandler(), intentRequest('EndQuestionSessionIntent'));
    assert.match(response.response.outputSpeech.ssml, /Question session ended/);
    assert.equal(response.response.shouldEndSession, undefined);
    assert.equal(response.response.reprompt, undefined);
});

function SearchFailure(code) {
    this.code = code;
    this.message = code;
}
