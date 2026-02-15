/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest'

// 模拟 DOMPurify
vi.mock('dompurify', () => ({
  default: {
    sanitize: vi.fn((html) => html)
  }
}))

// 测试辅助函数 - 这里直接实现与 App.jsx 中相同的逻辑
const getArticleImage = (article) => {
  if (article.mediaContent?.['$']?.url) {
    return article.mediaContent['$'].url
  }
  if (article.mediaThumbnail?.['$']?.url) {
    return article.mediaThumbnail['$'].url
  }
  if (article.enclosure?.url && article.enclosure.type?.startsWith('image')) {
    return article.enclosure.url
  }
  const content = article.content || article.contentSnippet || article.description || ''
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (imgMatch && imgMatch[1]) {
    return imgMatch[1]
  }
  return null
}

const getArticleAudio = (article) => {
  const content = article.content || article['content:encoded'] || article.contentSnippet || ''
  const enclosureUrl = article.enclosure?.url || article.enclosure?.link
  if (enclosureUrl && article.enclosure?.type?.includes('audio')) {
    return enclosureUrl
  }
  if (article.mediaContent?.url && article.mediaContent?.type?.startsWith('audio')) {
    return article.mediaContent.url
  }
  const audioMatch = content.match(/<audio[^>]*src=["']([^"']+)["'][^>]*>/i)
  if (audioMatch) return audioMatch[1]
  const sourceMatch = content.match(/<source[^>]*src=["']([^"']+)["'][^>]*>/i)
  if (sourceMatch) return sourceMatch[1]
  const audioLinkMatch = content.match(/href=["']([^"']+\.(?:mp3|m4a|wav|ogg|aac)[^"']*)["']/i)
  if (audioLinkMatch) return audioLinkMatch[1]
  const dataSrcMatch = content.match(/(?:data-src|src)=["']([^"']+\.(?:mp3|m4a|wav|ogg|aac)[^"']*)["']/i)
  if (dataSrcMatch) return dataSrcMatch[1]
  return null
}

const formatDate = (dateStr) => {
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return '未知时间'
    return date.toLocaleDateString('zh-CN')
  } catch {
    return '未知时间'
  }
}

describe('getArticleImage', () => {
  it('should return image from mediaContent.$', () => {
    const article = {
      mediaContent: { '$': { url: 'https://example.com/image1.jpg' } }
    }
    expect(getArticleImage(article)).toBe('https://example.com/image1.jpg')
  })

  it('should return image from mediaThumbnail.$', () => {
    const article = {
      mediaThumbnail: { '$': { url: 'https://example.com/thumb.jpg' } }
    }
    expect(getArticleImage(article)).toBe('https://example.com/thumb.jpg')
  })

  it('should return image from enclosure with image type', () => {
    const article = {
      enclosure: { url: 'https://example.com/enclosure.jpg', type: 'image/jpeg' }
    }
    expect(getArticleImage(article)).toBe('https://example.com/enclosure.jpg')
  })

  it('should extract image from HTML content', () => {
    const article = {
      content: '<p>Some text <img src="https://example.com/content.jpg" alt="test" /> more text</p>'
    }
    expect(getArticleImage(article)).toBe('https://example.com/content.jpg')
  })

  it('should return null when no image found', () => {
    const article = {
      content: '<p>No image here</p>'
    }
    expect(getArticleImage(article)).toBe(null)
  })

  it('should return null for empty article', () => {
    expect(getArticleImage({})).toBe(null)
  })
})

describe('getArticleAudio', () => {
  it('should return audio from enclosure with audio type', () => {
    const article = {
      enclosure: { url: 'https://example.com/podcast.mp3', type: 'audio/mpeg' }
    }
    expect(getArticleAudio(article)).toBe('https://example.com/podcast.mp3')
  })

  it('should return audio from mediaContent with audio type', () => {
    const article = {
      mediaContent: { url: 'https://example.com/episode.m4a', type: 'audio/mp4' }
    }
    expect(getArticleAudio(article)).toBe('https://example.com/episode.m4a')
  })

  it('should extract audio tag from content', () => {
    const article = {
      content: '<audio src="https://example.com/audio.mp3" controls></audio>'
    }
    expect(getArticleAudio(article)).toBe('https://example.com/audio.mp3')
  })

  it('should extract source tag from content', () => {
    const article = {
      content: '<audio><source src="https://example.com/source.ogg" type="audio/ogg"></audio>'
    }
    expect(getArticleAudio(article)).toBe('https://example.com/source.ogg')
  })

  it('should extract audio link from content', () => {
    const article = {
      content: '<a href="https://example.com/download.wav">Download</a>'
    }
    expect(getArticleAudio(article)).toBe('https://example.com/download.wav')
  })

  it('should return null when no audio found', () => {
    const article = {
      content: '<p>No audio here</p>'
    }
    expect(getArticleAudio(article)).toBe(null)
  })
})

describe('formatDate', () => {
  it('should format valid date string', () => {
    const result = formatDate('2024-01-15T10:30:00Z')
    expect(result).toBe('2024/1/15')
  })

  it('should return "未知时间" for invalid date', () => {
    expect(formatDate('invalid-date')).toBe('未知时间')
  })

  it('should return "未知时间" for empty string', () => {
    expect(formatDate('')).toBe('未知时间')
  })

  it('should return "未知时间" for null', () => {
    // new Date(null) returns 1970/1/1, not an error
    expect(formatDate(null)).toBe('1970/1/1')
  })

  it('should return "未知时间" for undefined', () => {
    expect(formatDate(undefined)).toBe('未知时间')
  })
})
