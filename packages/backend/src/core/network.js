import fetch from 'node-fetch';
import { AbortController } from 'abort-controller';

/**
 * ✅ FINAL VERSION: Initializes a session and correctly handles CSRF tokens.
 */
export async function initializeSession(siteConfig) {
    const sessionHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
    };
    
    // ✅ Skip session initialization for Greenhouse and Ashby
    if (siteConfig.siteName === "Greenhouse Jobs" || siteConfig.siteName === "Ashby Jobs") {
        return sessionHeaders;
    }
    
    if (!siteConfig.needsSession) return sessionHeaders;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
        console.log(`[${siteConfig.siteName}] Initializing session...`);
        const res = await fetch(siteConfig.baseUrl, { headers: sessionHeaders, signal: controller.signal });
        
        const cookies = res.headers.raw()['set-cookie'];
        if (cookies) {
            sessionHeaders['Cookie'] = cookies.join('; ');

            const xsrfCookie = cookies.find(c => c.startsWith('XSRF-TOKEN='));
            if (xsrfCookie) {
                const token = xsrfCookie.split(';')[0].split('=')[1];
                sessionHeaders['X-XSRF-TOKEN'] = decodeURIComponent(token);
            }
        }
    } catch (error) {
        console.error(`[${siteConfig.siteName}] FAILED to initialize session: ${error.message}. Aborting.`);
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
    return sessionHeaders;
}

/**
 * Fetches a single page of job listings from an API.
 */
export async function fetchJobsPage(siteConfig, offset, limit, sessionHeaders) {
    // ✅ Special handling for configs with custom fetchPage method
    if (typeof siteConfig.fetchPage === 'function') {
        return await siteConfig.fetchPage(offset, limit);
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const fetchOptions = {
            method: siteConfig.method,
            headers: {
                ...sessionHeaders,
                ...(siteConfig.customHeaders || {})
            },
            signal: controller.signal
        };

        let currentApiUrl = siteConfig.apiUrl;

        if (siteConfig.method === 'POST') {
            const bodyData = siteConfig.getBody(offset, limit, siteConfig.filterKeywords);
            
            if (typeof siteConfig.buildPageUrl === 'function') {
                currentApiUrl = siteConfig.buildPageUrl(offset, limit);
            }

            if (siteConfig.bodyType === 'form') {
                fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                fetchOptions.body = new URLSearchParams(bodyData).toString();
            } else {
                fetchOptions.headers['Content-Type'] = 'application/json';
                fetchOptions.body = JSON.stringify(bodyData);
            }
        } else if (siteConfig.method === 'GET') {
            if (typeof siteConfig.buildPageUrl === 'function') {
                currentApiUrl = siteConfig.buildPageUrl(offset, limit, siteConfig.filterKeywords);
            }
        }

        const res = await fetch(currentApiUrl, fetchOptions);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        
        return await res.json();
    } finally {
        clearTimeout(timeoutId);
    }
}