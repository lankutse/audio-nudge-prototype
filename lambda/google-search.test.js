const test = require('node:test');
const assert = require('node:assert/strict');
const { SearchError, normalizeSnippet, searchTopResult } = require('./google-search');

test('searchTopResult requests and returns the first snippet', async () => {
    let requestedUrl;
    const result = await searchTopResult('why is the sky blue?', {
        apiKey: 'test-key',
        searchEngineId: 'test-engine',
        requestJson: async (url) => {
            requestedUrl = url;
            return { items: [{ snippet: '  Because   molecules scatter blue light.  ' }] };
        }
    });

    assert.equal(result, 'Because molecules scatter blue light.');
    assert.equal(requestedUrl.searchParams.get('q'), 'why is the sky blue?');
    assert.equal(requestedUrl.searchParams.get('num'), '1');
    assert.equal(requestedUrl.searchParams.get('safe'), 'active');
});

test('searchTopResult reports no usable results', async () => {
    await assert.rejects(
        searchTopResult('unknown', {
            apiKey: 'test-key',
            searchEngineId: 'test-engine',
            requestJson: async () => ({ items: [] })
        }),
        (error) => error instanceof SearchError && error.code === 'NO_RESULTS'
    );
});

test('searchTopResult requires both credentials', async () => {
    await assert.rejects(
        searchTopResult('question', { apiKey: '', searchEngineId: '' }),
        (error) => error instanceof SearchError && error.code === 'CONFIGURATION_ERROR'
    );
});

test('normalizeSnippet removes control characters and limits length', () => {
    assert.equal(normalizeSnippet('one\n\t two'), 'one two');
    assert.equal(normalizeSnippet('x'.repeat(1100)).length, 1000);
});
