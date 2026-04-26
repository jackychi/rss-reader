import { getArticleKey } from './articleKey'

export function getFeedIntroFingerprint(articles) {
  return [...articles]
    .sort((a, b) => new Date(b.pubDate || b.isoDate || 0) - new Date(a.pubDate || a.isoDate || 0))
    .slice(0, 12)
    .map((article) => [
      getArticleKey(article),
      article.pubDate || article.isoDate || '',
      article.title || '',
    ].join('|'))
    .join('||')
}

export function getLLMConfigFingerprint(config) {
  return JSON.stringify({
    baseUrl: config?.baseUrl || '',
    apiKey: config?.apiKey || '',
    model: config?.model || '',
    contextSize: config?.contextSize || '',
  })
}

export function isFeedIntroCacheValid(cachedIntro, articles, config) {
  if (!cachedIntro?.content) return false
  return cachedIntro.fingerprint === getFeedIntroFingerprint(articles) &&
    cachedIntro.configFingerprint === getLLMConfigFingerprint(config)
}
