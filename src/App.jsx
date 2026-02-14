import { useState, useEffect } from 'react'
import DOMPurify from 'dompurify'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  Rss,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  RefreshCw,
  Upload,
  X,
  ExternalLink,
  PanelLeft,
  Loader2,
  AlertCircle,
  Sun,
  Moon
} from 'lucide-react'

// Default feeds from OPML - 完全导入 follow.opml
const defaultFeeds = [
  {
    category: "Blogs",
    feeds: [
      { title: "simonwillison.net", xmlUrl: "https://simonwillison.net/atom/everything/" },
      { title: "jeffgeerling.com", xmlUrl: "https://www.jeffgeerling.com/blog.xml" },
      { title: "seangoedecke.com", xmlUrl: "https://www.seangoedecke.com/rss.xml" },
      { title: "krebsonsecurity.com", xmlUrl: "https://krebsonsecurity.com/feed/" },
      { title: "daringfireball.net", xmlUrl: "https://daringfireball.net/feeds/main" },
      { title: "ericmigi.com", xmlUrl: "https://ericmigi.com/rss.xml" },
      { title: "antirez.com", xmlUrl: "https://antirez.com/rss" },
      { title: "idiallo.com", xmlUrl: "https://idiallo.com/feed.rss" },
      { title: "maurycyz.com", xmlUrl: "https://maurycyz.com/index.xml" },
      { title: "pluralistic.net", xmlUrl: "https://pluralistic.net/feed/" },
      { title: "shkspr.mobi", xmlUrl: "https://shkspr.mobi/blog/feed/" },
      { title: "lcamtuf.substack.com", xmlUrl: "https://lcamtuf.substack.com/feed" },
      { title: "mitchellh.com", xmlUrl: "https://mitchellh.com/feed.xml" },
      { title: "dynomight.net", xmlUrl: "https://dynomight.net/feed.xml" },
      { title: "utcc.utoronto.ca/~cks", xmlUrl: "https://utcc.utoronto.ca/~cks/space/blog/?atom" },
      { title: "xeiaso.net", xmlUrl: "https://xeiaso.net/blog.rss" },
      { title: "devblogs.microsoft.com/oldnewthing", xmlUrl: "https://devblogs.microsoft.com/oldnewthing/feed" },
      { title: "righto.com", xmlUrl: "https://www.righto.com/feeds/posts/default" },
      { title: "lucumr.pocoo.org", xmlUrl: "https://lucumr.pocoo.org/feed.atom" },
      { title: "skyfall.dev", xmlUrl: "https://skyfall.dev/rss.xml" },
      { title: "garymarcus.substack.com", xmlUrl: "https://garymarcus.substack.com/feed" },
      { title: "rachelbythebay.com", xmlUrl: "https://rachelbythebay.com/w/atom.xml" },
      { title: "overreacted.io", xmlUrl: "https://overreacted.io/rss.xml" },
      { title: "timsh.org", xmlUrl: "https://timsh.org/rss/" },
      { title: "johndcook.com", xmlUrl: "https://www.johndcook.com/blog/feed/" },
      { title: "gilesthomas.com", xmlUrl: "https://gilesthomas.com/feed/rss.xml" },
      { title: "matklad.github.io", xmlUrl: "https://matklad.github.io/feed.xml" },
      { title: "derekthompson.org", xmlUrl: "https://www.theatlantic.com/feed/author/derek-thompson/" },
      { title: "evanhahn.com", xmlUrl: "https://evanhahn.com/feed.xml" },
      { title: "terriblesoftware.org", xmlUrl: "https://terriblesoftware.org/feed/" },
      { title: "rakhim.exotext.com", xmlUrl: "https://rakhim.exotext.com/rss.xml" },
      { title: "joanwestenberg.com", xmlUrl: "https://joanwestenberg.com/rss" },
      { title: "xania.org", xmlUrl: "https://xania.org/feed" },
      { title: "micahflee.com", xmlUrl: "https://micahflee.com/feed/" },
      { title: "nesbitt.io", xmlUrl: "https://nesbitt.io/feed.xml" },
      { title: "construction-physics.com", xmlUrl: "https://www.construction-physics.com/feed" },
      { title: "tedium.co", xmlUrl: "https://feed.tedium.co/" },
      { title: "susam.net", xmlUrl: "https://susam.net/feed.xml" },
      { title: "entropicthoughts.com", xmlUrl: "https://entropicthoughts.com/feed.xml" },
      { title: "buttondown.com/hillelwayne", xmlUrl: "https://buttondown.com/hillelwayne/rss" },
      { title: "dwarkesh.com", xmlUrl: "https://www.dwarkeshpatel.com/feed" },
      { title: "borretti.me", xmlUrl: "https://borretti.me/feed.xml" },
      { title: "wheresyoured.at", xmlUrl: "https://www.wheresyoured.at/rss/" },
      { title: "jayd.ml", xmlUrl: "https://jayd.ml/feed.xml" },
      { title: "minimaxir.com", xmlUrl: "https://minimaxir.com/index.xml" },
      { title: "geohot.github.io", xmlUrl: "https://geohot.github.io/blog/feed.xml" },
      { title: "paulgraham.com", xmlUrl: "http://www.aaronsw.com/2002/feeds/pgessays.rss" },
      { title: "filfre.net", xmlUrl: "https://www.filfre.net/feed/" },
      { title: "blog.jim-nielsen.com", xmlUrl: "https://blog.jim-nielsen.com/feed.xml" },
      { title: "dfarq.homeip.net", xmlUrl: "https://dfarq.homeip.net/feed/" },
      { title: "jyn.dev", xmlUrl: "https://jyn.dev/atom.xml" },
      { title: "geoffreylitt.com", xmlUrl: "https://www.geoffreylitt.com/feed.xml" },
      { title: "downtowndougbrown.com", xmlUrl: "https://www.downtowndougbrown.com/feed/" },
      { title: "brutecat.com", xmlUrl: "https://brutecat.com/rss.xml" },
      { title: "eli.thegreenplace.net", xmlUrl: "https://eli.thegreenplace.net/feeds/all.atom.xml" },
      { title: "abortretry.fail", xmlUrl: "https://www.abortretry.fail/feed" },
      { title: "fabiensanglard.net", xmlUrl: "https://fabiensanglard.net/rss.xml" },
      { title: "oldvcr.blogspot.com", xmlUrl: "https://oldvcr.blogspot.com/feeds/posts/default" },
      { title: "bogdanthegeek.github.io", xmlUrl: "https://bogdanthegeek.github.io/blog/index.xml" },
      { title: "hugotunius.se", xmlUrl: "https://hugotunius.se/feed.xml" },
      { title: "gwern.net", xmlUrl: "https://gwern.substack.com/feed" },
      { title: "berthub.eu", xmlUrl: "https://berthub.eu/articles/index.xml" },
      { title: "chadnauseam.com", xmlUrl: "https://chadnauseam.com/rss.xml" },
      { title: "simone.org", xmlUrl: "https://simone.org/feed/" },
      { title: "it-notes.dragas.net", xmlUrl: "https://it-notes.dragas.net/feed/" },
      { title: "beej.us", xmlUrl: "https://beej.us/blog/rss.xml" },
      { title: "hey.paris", xmlUrl: "https://hey.paris/index.xml" },
      { title: "danielwirtz.com", xmlUrl: "https://danielwirtz.com/rss.xml" },
      { title: "matduggan.com", xmlUrl: "https://matduggan.com/rss/" },
      { title: "refactoringenglish.com", xmlUrl: "https://refactoringenglish.com/index.xml" },
      { title: "worksonmymachine.substack.com", xmlUrl: "https://worksonmymachine.substack.com/feed" },
      { title: "philiplaine.com", xmlUrl: "https://philiplaine.com/index.xml" },
      { title: "steveblank.com", xmlUrl: "https://steveblank.com/feed/" },
      { title: "bernsteinbear.com", xmlUrl: "https://bernsteinbear.com/feed.xml" },
      { title: "danieldelaney.net", xmlUrl: "https://danieldelaney.net/feed" },
      { title: "troyhunt.com", xmlUrl: "https://www.troyhunt.com/rss/" },
      { title: "herman.bearblog.dev", xmlUrl: "https://herman.bearblog.dev/feed/" },
      { title: "tomrenner.com", xmlUrl: "https://tomrenner.com/index.xml" },
      { title: "blog.pixelmelt.dev", xmlUrl: "https://blog.pixelmelt.dev/rss/" },
      { title: "martinalderson.com", xmlUrl: "https://martinalderson.com/feed.xml" },
      { title: "danielchasehooper.com", xmlUrl: "https://danielchasehooper.com/feed.xml" },
      { title: "chiark.greenend.org.uk/~sgtatham", xmlUrl: "https://www.chiark.greenend.org.uk/~sgtatham/quasiblog/feed.xml" },
      { title: "grantslatton.com", xmlUrl: "https://grantslatton.com/rss.xml" },
      { title: "experimental-history.com", xmlUrl: "https://www.experimental-history.com/feed" },
      { title: "anildash.com", xmlUrl: "https://anildash.com/feed.xml" },
      { title: "aresluna.org", xmlUrl: "https://aresluna.org/main.rss" },
      { title: "michael.stapelberg.ch", xmlUrl: "https://michael.stapelberg.ch/feed.xml" },
      { title: "miguelgrinberg.com", xmlUrl: "https://blog.miguelgrinberg.com/feed" },
      { title: "keygen.sh", xmlUrl: "https://keygen.sh/blog/feed.xml" },
      { title: "mjg59.dreamwidth.org", xmlUrl: "https://mjg59.dreamwidth.org/data/rss" },
      { title: "computer.rip", xmlUrl: "https://computer.rip/rss.xml" },
      { title: "tedunangst.com", xmlUrl: "https://www.tedunangst.com/flak/rss" },
    ]
  },
  {
    category: "Articles",
    feeds: [
      { title: "阮一峰的网络日志", xmlUrl: "http://feeds.feedburner.com/ruanyifeng" },
      { title: "大脸撑在小胸上", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UCv8djBlOdCZWZ-7Nal-3pJQ" },
      { title: "王志安", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UCBKDRq35-L8xev4O7ZqBeLg" },
      { title: "蒋方舟·一寸", xmlUrl: "https://api.vistopia.com.cn/rss/program/403.xml" },
      { title: "MacTalk·夜航西飞", xmlUrl: "https://feed.xyzfm.space/9mkbwqtmr8ma" },
      { title: "没折腰FM", xmlUrl: "http://www.ximalaya.com/album/43584169.xml" },
      { title: "岩中花述", xmlUrl: "https://feed.xyzfm.space/hwen8wf69c6g" },
      { title: "银杏树下", xmlUrl: "http://www.ximalaya.com/album/51007459.xml" },
      { title: "柴静 Chai Jing", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UCjuNibFJ21MiSNpu8LZyV4w" },
      { title: "萧泊内", xmlUrl: "https://www.ximalaya.com/album/70410212.xml" },
      { title: "张小珺Jùn｜商业访谈录", xmlUrl: "https://feed.xyzfm.space/dk4yh3pkpjp3" },
      { title: "文化有限", xmlUrl: "https://s1.proxy.wavpub.com/weknownothing.xml" },
      { title: "Leafy Zhang张叶蕾", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UC5iu9k6AOSEqGzhSXp8TjWg" },
      { title: "Notion", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UCoSvlWS5XcwaSzIcbuJ-Ysg" },
      { title: "云风的 BLOG", xmlUrl: "https://blog.codingnow.com/atom.xml" },
      { title: "尺宅杂记", xmlUrl: "http://www.qncd.com/?feed=rss2" },
      { title: "MicroConf", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UCHoBKQDRkJcOY2BO47q5Ruw" },
      { title: "Every (sagacity@icloud.com)", xmlUrl: "https://every.to/feeds/62e3ebdb41fd0051438d.xml" },
      { title: "Every", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UCjIMtrzxYc0lblGhmOgC_CA" },
      { title: "Art21", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UC6Z_Gbfo7xwSMs6Ahkv-m3Q" },
      { title: "The Browser Company", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UCT5qXmLacW_a4DE-3EgeOiQ" },
      { title: "IN核局", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UCh6gAbFmwsoif41t_jow_QQ" },
    ]
  },
  {
    category: "科技 (Technology)",
    feeds: [
      { title: "Ars Technica", xmlUrl: "http://feeds.arstechnica.com/arstechnica/index/" },
      { title: "TechCrunch", xmlUrl: "https://techcrunch.com/feed/" },
      { title: "WIRED", xmlUrl: "https://www.wired.com/feed/rss" },
      { title: "Marques Brownlee", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UCBJycsmduvYEL83R_U4JriQ" },
      { title: "Lex Fridman Podcast Brief", xmlUrl: "https://lexfridmanrss.onrender.com/feed.xml" },
    ]
  },
  {
    category: "设计 (Design)",
    feeds: [
      { title: "Smashing Magazine", xmlUrl: "https://www.smashingmagazine.com/feed/" },
      { title: "A List Apart", xmlUrl: "https://alistapart.com/main/feed/" },
    ]
  },
  {
    category: "英文个人 Blog",
    feeds: [
      { title: "Gretchen Rubin", xmlUrl: "http://feeds.feedburner.com/GretchenRubin" },
      { title: "Derek Sivers", xmlUrl: "https://sive.rs/en.atom" },
      { title: "Wait But Why", xmlUrl: "https://waitbutwhy.com/feed" },
      { title: "Stratechery", xmlUrl: "https://stratechery.com/feed/" },
      { title: "Paul Graham: Essays", xmlUrl: "http://www.aaronsw.com/2002/feeds/pgessays.rss" },
      { title: "Austin Kleon", xmlUrl: "https://austinkleon.com/feed/" },
      { title: "Cal Newport", xmlUrl: "https://calnewport.com/feed/" },
    ]
  },
  {
    category: "中文个人 Blog",
    feeds: [
      { title: "土木坛子", xmlUrl: "https://tumutanzi.com/feed" },
      { title: "可能吧", xmlUrl: "https://feeds.feedburner.com/kenengbarss" },
      { title: "DBA Notes | 闲思录", xmlUrl: "https://dbanotes.net/feed" },
      { title: "酷壳 – CoolShell", xmlUrl: "https://coolshell.cn/feed" },
      { title: "Airing 的博客", xmlUrl: "https://blog.ursb.me/feed.xml" },
      { title: "MacTalk-池建强的随想录", xmlUrl: "https://macshuo.com/?feed=rss2" },
    ]
  },
  {
    category: "摄影",
    feeds: [
      { title: "相机夜话", xmlUrl: "http://www.ximalaya.com/album/41782767.xml" },
      { title: "东胶影厂", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UCc7UU0Pd6sZKzYkC-NRvdlw" },
      { title: "过片Thumb Action", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UCNhMSkTefqXoQjwIdAwi5Gw" },
      { title: "Bobby Tonelli", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UC0Vjgs42ZJ9E9HiILq2D9Yw" },
      { title: "Chris in Photography", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UCewPGlHNXWRlC5zcD_I8YdA" },
      { title: "Kyle McDougall", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UCJQcBYfgescGRJUzU6IMCMw" },
      { title: "Peter McKinnon", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UC3DkFux8Iv-aYnTRWzwaiBA" },
      { title: "The Art of Photography", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UC7T8roVtC_3afWKTOGtLlBA" },
    ]
  },
  {
    category: "晚点 - 长报道",
    feeds: [
      { title: "晚点 - 长报道", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/latepost/4" },
    ]
  },
  {
    category: "Sam Altman",
    feeds: [
      { title: "Sam Altman", xmlUrl: "https://blog.samaltman.com/posts.atom" },
    ]
  },
  {
    category: "A常读",
    feeds: [
      { title: "Ahead of AI", xmlUrl: "https://magazine.sebastianraschka.com/feed" },
      { title: "Farnam Street", xmlUrl: "https://fs.blog/feed/" },
      { title: "A Smart Bear", xmlUrl: "https://longform.asmartbear.com/index.xml" },
      { title: "Andrej Karpathy", xmlUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UCXUPKJO5MZQN11PqgIvyuvQ" },
      { title: "James Clear", xmlUrl: "https://jamesclear.com/feed" },
      { title: "Calvin French-Owen", xmlUrl: "https://calv.info/atom.xml" },
      { title: "宝玉(@dotey)", xmlUrl: "https://api.xgo.ing/rss/user/97f1484ae48c430fbbf3438099743674" },
      { title: "Fenng 的收藏", xmlUrl: "https://www.douban.com/feed/people/fenng/interests" },
      { title: "MacTalk", xmlUrl: "https://plink.anyfeeder.com/weixin/sagacity-mac" },
      { title: "Google Gemini(@GeminiApp)", xmlUrl: "https://api.xgo.ing/rss/user/6fb337feeec44ca38b79491b971d868d" },
      { title: "Google AI(@GoogleAI)", xmlUrl: "https://api.xgo.ing/rss/user/4de0bd2d5cef4333a0260dc8157054a7" },
      { title: "Google AI Developers(@googleaidevs)", xmlUrl: "https://api.xgo.ing/rss/user/69d925d4a8d44221b03eecbe07bd0f74" },
      { title: "GitHub Trending", xmlUrl: "https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml" },
      { title: "Readhub - 每日早报", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/readhub/daily" },
      { title: "Lex Fridman(@lexfridman)", xmlUrl: "https://api.xgo.ing/rss/user/adf65931519340f795e2336910b4cd15" },
    ]
  },
  {
    category: "SocialMedia",
    feeds: [
      { title: "Twitter @OpenAI", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/twitter/user/OpenAI" },
      { title: "Twitter @Josh Miller", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/twitter/user/joshm" },
      { title: "Twitter @Tom Huang", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/twitter/user/tuturetom" },
      { title: "Twitter @硅谷王川 Chuan", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/twitter/user/Svwang1" },
      { title: "Twitter @DeepSeek", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/twitter/user/deepseek_ai" },
      { title: "Twitter @池建强", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/twitter/user/sagacity" },
      { title: "Twitter @Qwen", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/twitter/user/Alibaba_Qwen" },
      { title: "Twitter @Sam Altman", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/twitter/user/sama" },
      { title: "Twitter @Fenng", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/twitter/user/Fenng" },
      { title: "Fenng的微博", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/weibo/user/1577826897" }, 
      { title: "Twitter @Google AI", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/twitter/user/GoogleAI" },
      { title: "Twitter @Google AI Developers", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/twitter/user/googleaidevs" }, 
      { title: "Twitter @宝玉", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/twitter/user/dotey" },
      { title: "Twitter @Carlos Gong", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/twitter/user/Carlos_Gong" },
      { title: "Twitter @Lex Fridman", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/twitter/user/lexfridman" },
      { title: "Twitter @Andrew Ng", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/twitter/user/AndrewYNg" },
      { title: "Twitter @Frank Wang 玉伯", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/twitter/user/lifesinger" },
      { title: "Twitter @Orange AI", xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/twitter/user/oran_ge" },
    ]
  },
  {
    category: "Pictures",
    feeds: [
      { title: "Nat Geo Photo of the Day", xmlUrl: "https://rsshub.rssforever.com/natgeo/dailyphoto" },
    ]
  },
  {
    category: "Videos",
    feeds: [
      { title: "Anthropic - YouTube", xmlUrl: "https://rsshub.rssforever.com/youtube/user/%40anthropic-ai" },
      { title: "googlechrome - YouTube", xmlUrl: "https://rsshub.rssforever.com/youtube/user/googlechrome" },
    ]
  },
  {
    category: "Audios",
    feeds: [
      { title: "TED Talks Daily", xmlUrl: "https://feeds.acast.com/public/shows/67587e77c705e441797aff96" },
    ]
  }
]

function App() {
  const [feeds, setFeeds] = useState(defaultFeeds)
  const [selectedFeed, setSelectedFeed] = useState(null)
  const [articles, setArticles] = useState([])
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState({})
  const [loading, setLoading] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [readerVisible, setReaderVisible] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    const initialExpanded = {}
    feeds.forEach((cat, idx) => {
      initialExpanded[cat.category] = false
    })
    setExpandedCategories(initialExpanded)
  }, [])

  useEffect(() => {
    const savedTheme = localStorage.getItem('rss-reader-theme')
    if (savedTheme) {
      setTheme(savedTheme)
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('rss-reader-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }))
  }

  const fetchFeed = async (feed, isRefresh = false) => {
    try {
      if (isRefresh) setIsRefreshing(true)
      console.log('Fetching feed:', feed.title)

      // Try multiple proxy services
      const isXgoIng = feed.xmlUrl.includes('api.xgo.ing')
      const rsshubBase = 'https://rsshub-eta-topaz-88.vercel.app'

      const proxies = isXgoIng
        ? [
            // For xgo.ing URLs, use RSSHub directly
            `${rsshubBase}/${feed.xmlUrl.replace(/^https?:\/\//, '')}`,
          ]
        : [
            // Try direct first (for CORS-friendly feeds)
            { url: feed.xmlUrl, isDirect: true },
            // RSS2JSON with rate limit handling
            { url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.xmlUrl)}`, isRss2Json: true },
            // Various CORS proxies
            `https://corsproxy.io/?${encodeURIComponent(feed.xmlUrl)}`,
            `https://api.allorigins.win/get?url=${encodeURIComponent(feed.xmlUrl)}`,
            `https://cors-anywhere.herokuapp.com/${feed.xmlUrl}`,
            // Fallback to RSSHub
            `${rsshubBase}/${feed.xmlUrl.replace(/^https?:\/\//, '')}`,
          ]

      let articlesWithFeed = null

      for (const proxy of proxies) {
        try {
          const proxyUrl = typeof proxy === 'string' ? proxy : proxy.url

          // Handle RSS2JSON
          if (proxy.isRss2Json || proxyUrl.includes('rss2json')) {
            const jsonRes = await fetch(proxyUrl)
            if (jsonRes.status === 429) {
              console.log('rss2json rate limited, trying next proxy')
              continue
            }
            const jsonData = await jsonRes.json()
            if (jsonData.status === 'ok' && jsonData.items) {
              articlesWithFeed = jsonData.items.map(item => ({
                ...item,
                feedTitle: jsonData.feed.title || feed.title,
                feedUrl: feed.xmlUrl,
                content: item.content || item['content:encoded'] || item.description || '',
                contentSnippet: (item.content || item.description || '')?.replace(/<[^>]*>/g, '').slice(0, 200) || '',
                isoDate: item.pubDate,
              }))
              console.log('Articles loaded from rss2json:', articlesWithFeed.length)
              break
            }
          }

          // Handle allorigins JSON response
          if (proxyUrl.includes('allorigins.win/get')) {
            const response = await fetch(proxyUrl)
            const data = await response.json()
            if (!data.contents) continue
            const xmlText = data.contents
            const domParser = new DOMParser()
            const xml = domParser.parseFromString(xmlText, 'text/xml')
            const items = xml.querySelectorAll('item, entry')
            const title = xml.querySelector('channel > title, feed > title')?.textContent || feed.title
            const articles = Array.from(items).map(item => ({
              title: item.querySelector('title')?.textContent || '',
              link: item.querySelector('link')?.textContent || item.querySelector('link')?.getAttribute('href') || '',
              content: item.querySelector('content\\:encoded, content, description, summary')?.textContent || '',
              contentSnippet: item.querySelector('content\\:encoded, content, description, summary')?.textContent?.replace(/<[^>]*>/g, '').slice(0, 200) || '',
              pubDate: item.querySelector('pubDate, published, updated')?.textContent || new Date().toISOString(),
              isoDate: item.querySelector('pubDate, published, updated')?.textContent || new Date().toISOString(),
              guid: item.querySelector('id')?.textContent || item.querySelector('link')?.textContent || '',
            }))
            articlesWithFeed = articles.map(item => ({
              ...item,
              feedTitle: title,
              feedUrl: feed.xmlUrl,
            }))
            console.log('Articles loaded from allorigins:', articlesWithFeed.length)
            break
          }

          // Handle direct fetch or other proxies
          const response = await fetch(proxyUrl)
          if (!response.ok) {
            console.log(`Proxy ${proxyUrl.substring(0, 50)}... returned ${response.status}`)
            continue
          }
          const xmlText = await response.text()

          const domParser = new DOMParser()
          const xml = domParser.parseFromString(xmlText, 'text/xml')
          const items = xml.querySelectorAll('item, entry')
          const title = xml.querySelector('channel > title, feed > title')?.textContent || feed.title

          const articles = Array.from(items).map(item => {
            const titleEl = item.querySelector('title')?.textContent || ''
            const linkEl = item.querySelector('link')?.textContent ||
              item.querySelector('link')?.getAttribute('href') || ''
            // Try to get full content from content:encoded, then content, then description
            const fullContentEl = item.querySelector('content\\:encoded, content')?.textContent ||
              item.querySelector('description, summary')?.textContent || ''
            const dateEl = item.querySelector('pubDate, published, updated')?.textContent || new Date().toISOString()

            return {
              title: titleEl,
              link: linkEl,
              content: fullContentEl,
              contentSnippet: fullContentEl.replace(/<[^>]*>/g, '').slice(0, 200),
              pubDate: dateEl,
              isoDate: dateEl,
              guid: item.querySelector('id')?.textContent || linkEl,
            }
          })

          articlesWithFeed = articles.map(item => ({
            ...item,
            feedTitle: title,
            feedUrl: feed.xmlUrl,
          }))
          console.log('Articles loaded:', articlesWithFeed.length)
          break
        } catch (e) {
          console.log('Proxy failed, trying next:', e.message)
          continue
        }
      }

      if (articlesWithFeed && articlesWithFeed.length > 0) {
        return { feed, articles: articlesWithFeed }
      }

      throw new Error('All proxies failed')
    } catch (error) {
      console.error(`Error fetching ${feed.title}:`, error)
      return { feed, articles: [], error: error.message }
    }
  }

  const fetchAllFeeds = async (feedList) => {
    setLoading(true)
    setError(null)
    try {
      const results = await Promise.all(feedList.map(feed => fetchFeed(feed)))
      const errors = results.filter(r => r.error)
      if (errors.length > 0) {
        setError(`Failed to load ${errors.length} feed(s): ${errors.map(e => e.feed.title).join(', ')}`)
      }
      const allArticles = results
        .filter(r => r.articles.length > 0)
        .flatMap(r => r.articles)
        .sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate))
      setArticles(allArticles)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  const handleSelectFeed = async (category, feed) => {
    setSelectedFeed(feed)
    setSelectedArticle(null)
    await fetchAllFeeds([feed])
  }

  const handleSelectAll = async () => {
    setSelectedFeed({ title: 'All Articles', xmlUrl: 'all' })
    setSelectedArticle(null)
    const allFeeds = feeds.flatMap(f => f.feeds)
    await fetchAllFeeds(allFeeds)
  }

  const handleRefresh = async () => {
    if (selectedFeed) {
      await handleSelectFeed(null, selectedFeed)
    }
  }

  const handleImportOPML = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    const text = await file.text()
    const parserDOM = new DOMParser()
    const xml = parserDOM.parseFromString(text, 'text/xml')

    const outlines = xml.querySelectorAll('outline[type="rss"], outline[xmlUrl]')
    const newFeeds = {}

    outlines.forEach(outline => {
      const xmlUrl = outline.getAttribute('xmlUrl')
      const text = outline.getAttribute('title') || outline.getAttribute('text')
      const parent = outline.parentElement
      let category = 'Uncategorized'

      if (parent && parent.getAttribute) {
        const parentText = parent.getAttribute('title') || parent.getAttribute('text')
        if (parentText && parentText !== 'Feeds') {
          category = parentText
        }
      }

      if (xmlUrl && text) {
        if (!newFeeds[category]) {
          newFeeds[category] = []
        }
        newFeeds[category].push({ title: text, xmlUrl })
      }
    })

    const mergedFeeds = Object.entries(newFeeds).map(([category, feeds]) => ({
      category,
      feeds
    }))

    if (mergedFeeds.length > 0) {
      setFeeds(prev => [...prev, ...mergedFeeds])
    }
  }

  const getArticleImage = (article) => {
    // Check media content first
    if (article.mediaContent?.['$']?.url) {
      return article.mediaContent['$'].url
    }
    if (article.mediaThumbnail?.['$']?.url) {
      return article.mediaThumbnail['$'].url
    }
    if (article.enclosure?.url && article.enclosure.type?.startsWith('image')) {
      return article.enclosure.url
    }
    // Try to extract first image from content
    const content = article.content || article.contentSnippet || article.description || ''
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i)
    if (imgMatch && imgMatch[1]) {
      return imgMatch[1]
    }
    return null
  }

  const getArticleContent = (article) => {
    if (article['content:encoded']) {
      return DOMPurify.sanitize(article['content:encoded'])
    }
    if (article.content) {
      return DOMPurify.sanitize(article.content)
    }
    return article.contentSnippet ? DOMPurify.sanitize(`<p>${article.contentSnippet}</p>`) : ''
  }

  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr)
      return formatDistanceToNow(date, { addSuffix: true, locale: zhCN })
    } catch {
      return ''
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="h-12 header flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarVisible(!sidebarVisible)}
            style={{ padding: '6px', borderRadius: '6px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
            title={sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar'}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <PanelLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <Rss size={18} style={{ color: '#ff9500' }} />
            <span style={{ fontWeight: 600, fontSize: '15px' }}>CatReader</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={!selectedFeed || isRefreshing}
            style={{ padding: '6px', borderRadius: '6px', opacity: !selectedFeed ? 0.5 : 1, backgroundColor: 'transparent', border: 'none', cursor: !selectedFeed ? 'default' : 'pointer' }}
            title="Refresh"
            onMouseEnter={(e) => { if (selectedFeed) e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
          <label style={{ padding: '6px', borderRadius: '6px', cursor: 'pointer', backgroundColor: 'transparent' }} title="Import OPML"
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Upload size={18} />
            <input
              type="file"
              accept=".opml,.xml"
              onChange={handleImportOPML}
              className="hidden"
            />
          </label>
          <button
            onClick={toggleTheme}
            style={{ padding: '6px 10px', borderRadius: '6px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            <span style={{ fontSize: '12px' }}>{theme === 'light' ? '深色' : '浅色'}</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {sidebarVisible && (
          <aside className="sidebar w-64 overflow-y-auto shrink-0" style={{ borderRight: '1px solid var(--border-color)' }}>
            <div style={{ padding: '12px' }}>
              <div
                onClick={handleSelectAll}
                className={`sidebar-item ${!selectedFeed || selectedFeed.xmlUrl === 'all' ? 'active' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '6px' }}
              >
                <FileText size={16} />
                <span>All Articles</span>
              </div>
            </div>

            <div style={{ padding: '0 8px' }}>
              {feeds.map((category) => (
                <div key={category.category} style={{ marginBottom: '4px' }}>
                  <div
                    onClick={() => toggleCategory(category.category)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderRadius: '6px'
                    }}
                  >
                    {expandedCategories[category.category] ? (
                      <ChevronDown size={14} style={{ color: 'var(--text-secondary)' }} />
                    ) : (
                      <ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} />
                    )}
                    {expandedCategories[category.category] ? (
                      <FolderOpen size={16} style={{ color: 'var(--text-secondary)' }} />
                    ) : (
                      <Folder size={16} style={{ color: 'var(--text-secondary)' }} />
                    )}
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{category.category}</span>
                  </div>

                  {expandedCategories[category.category] && (
                    <div style={{ paddingLeft: '24px' }}>
                      {category.feeds.map((feed) => (
                        <div
                          key={feed.xmlUrl}
                          onClick={() => handleSelectFeed(category.category, feed)}
                          className={`sidebar-item ${selectedFeed?.xmlUrl === feed.xmlUrl ? 'active' : ''}`}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '6px', fontSize: '14px' }}
                        >
                          <Rss size={12} style={{ color: '#ff9500', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{feed.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* Article List */}
        <main className="article-list w-[380px] flex flex-col overflow-hidden shrink-0">
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
            <h2 style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedFeed?.title || 'All Articles'}
            </h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {articles.length} articles
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {error && (
              <div className="p-3 bg-red-50 border-b border-red-100 flex items-start gap-2">
                <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 size={24} className="animate-spin text-gray-400" />
              </div>
            ) : articles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <FileText size={48} className="mb-3 opacity-30" />
                <p className="text-sm">Select a feed to start reading</p>
              </div>
            ) : (
              articles.map((article, idx) => (
                <div
                  key={`${article.feedUrl}-${article.guid || article.link}-${idx}`}
                  onClick={() => setSelectedArticle(article)}
                  className={`article-item animate-fadeIn ${
                    selectedArticle?.guid === article.guid ? 'active' : ''
                  }`}
                  style={{ animationDelay: `${Math.min(idx * 0.02, 0.3)}ms` }}
                >
                  <div className="article-meta">
                    <span className="article-source">{article.feedTitle}</span>
                    <span>·</span>
                    <span>{formatDate(article.isoDate)}</span>
                  </div>
                  <h3 className="article-title">
                    {article.title}
                  </h3>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {article.contentSnippet && (
                      <p className="article-snippet" style={{ flex: 1 }}>{article.contentSnippet}</p>
                    )}
                    {getArticleImage(article) && (
                      <img
                        src={getArticleImage(article)}
                        alt=""
                        style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', flexShrink: 0 }}
                        onError={(e) => e.target.style.display = 'none'}
                      />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </main>

        {/* Article Reader */}
        {readerVisible && (
          <section className="reader flex-1 overflow-hidden flex flex-col">
            {selectedArticle ? (
              <>
                <div className="reader-header p-4 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    {showOriginal ? (
                      <button
                        onClick={() => setShowOriginal(false)}
                        style={{ padding: '6px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        <ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} />
                      </button>
                    ) : (
                      <button
                        onClick={() => setReaderVisible(false)}
                        style={{ padding: '6px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        <X size={18} />
                      </button>
                    )}
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{selectedArticle.feedTitle}</span>
                  </div>
                  <a
                    href={selectedArticle.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="original-link"
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    Original
                    <ExternalLink size={14} />
                  </a>
                </div>
                <div className="flex-1 overflow-hidden">
                  {showOriginal && selectedArticle.link ? (
                    <iframe
                      src={selectedArticle.link}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      title="Original Article"
                    />
                  ) : (
                    <div className="overflow-y-auto" style={{ height: '100%' }}>
                      <article style={{ maxWidth: '720px', margin: '0 auto', padding: '32px' }}>
                        <h1
                          className="reader-title"
                          style={{ cursor: 'pointer' }}
                          onClick={() => selectedArticle.link && setShowOriginal(true)}
                          title="Click to open original article"
                        >
                          {selectedArticle.title}
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #e5e5e5' }}>
                          <span className="reader-date">{formatDistanceToNow(new Date(selectedArticle.isoDate), { addSuffix: true, locale: zhCN })}</span>
                          {selectedArticle.link && (
                            <button
                              onClick={() => setShowOriginal(true)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--accent-color)',
                                cursor: 'pointer',
                                fontSize: '13px',
                                padding: '4px 8px',
                                borderRadius: '4px',
                              }}
                            >
                              查看原文
                            </button>
                          )}
                        </div>
                        <div
                          className="reader-content"
                          dangerouslySetInnerHTML={{ __html: getArticleContent(selectedArticle) }}
                        />
                      </article>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                <FileText size={64} style={{ opacity: 0.2, marginBottom: '16px' }} />
                <p style={{ color: 'var(--text-muted)' }}>Select an article to read</p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

export default App
