/**
 * 文章主键生成
 *
 * 所有需要"以文章为 key"的场景(readStatus / readPositions / audioPositions /
 * reading list / article list UI)统一走这里。分隔符保留 "-" 与 IDB articles.id
 * 格式一致,不破坏已有数据。
 */
export function getArticleKey(article) {
  return `${article.feedUrl}-${article.guid || article.link}`
}
