const https = require('https');

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

function normalizeSnippet(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000);
}

async function searchTopResult(question, options = {}) {
    const apiKey = options.apiKey || process.env.GOOGLE_API_KEY;
    const searchEngineId = options.searchEngineId || process.env.GOOGLE_SEARCH_ENGINE_ID;
    const requestJson = options.requestJson || getJson;

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

    const payload = await requestJson(url);
    if (payload && payload.error) {
        throw new SearchError('API_ERROR', payload.error.message || 'Google reported an API error.');
    }

    const snippet = normalizeSnippet(payload && payload.items && payload.items[0] && payload.items[0].snippet);
    if (!snippet) {
        throw new SearchError('NO_RESULTS', 'No usable Google search result was found.');
    }
    return snippet;
}

module.exports = { SearchError, normalizeSnippet, searchTopResult };
