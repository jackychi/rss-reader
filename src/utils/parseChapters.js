function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

export function parseChapters(content) {
  if (!content) return []
  const plainText = stripHtml(content).replace(/\r\n/g, '\n')
  const chapterRegex = /\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?/g
  const chapters = []
  const matches = Array.from(plainText.matchAll(chapterRegex))

  matches.forEach((match, index) => {
    const hours = parseInt(match[1], 10)
    const minutes = parseInt(match[2], 10)
    const seconds = match[3] ? parseInt(match[3], 10) : 0

    let totalSeconds
    if (hours < 60) {
      totalSeconds = hours * 60 + minutes
      if (match[3]) {
        totalSeconds = hours * 3600 + minutes * 60 + seconds
      }
    } else {
      totalSeconds = hours * 60 + minutes
    }

    const currentEnd = (match.index ?? 0) + match[0].length
    const nextStart = matches[index + 1]?.index ?? plainText.length
    const rawTitle = plainText
      .slice(currentEnd, nextStart)
      .replace(/\s+/g, ' ')
      .replace(/^[\s\-.:，,|]+/, '')
      .trim()
    const title = rawTitle.slice(0, 60)

    chapters.push({
      time: totalSeconds,
      label: match[0].replace(/\[|\]/g, ''),
      title: title || '章节 ' + (chapters.length + 1)
    })
  })

  return chapters.filter((c, i, arr) =>
    i === 0 || c.time !== arr[i - 1].time
  ).sort((a, b) => a.time - b.time)
}
