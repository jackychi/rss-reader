// Default feeds from OPML - 完全导入 follow.opml
export const defaultFeeds = [
  {
    category: "AI 实验室",
    feeds: [
      // Anthropic
      {
        title: "Anthropic News",
        xmlUrl:
          "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml",
      },
      {
        title: "Anthropic Engineering",
        xmlUrl:
          "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_engineering.xml",
      },
      {
        title: "Anthropic Research",
        xmlUrl:
          "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_research.xml",
      },
      {
        title: "Anthropic Frontier Red Team",
        xmlUrl:
          "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_red.xml",
      },
      {
        title: "Claude Blog",
        xmlUrl:
          "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_claude.xml",
      },
      // OpenAI & xAI
      { title: "OpenAI Research", xmlUrl: "https://openai.com/blog/rss.xml" },
      {
        title: "xAI News",
        xmlUrl:
          "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_xainews.xml",
      },
      // Google
      {
        title: "Google DeepMind Blog",
        xmlUrl: "https://deepmind.google/blog/rss.xml",
      },
      {
        title: "Google Developers Blog - AI",
        xmlUrl:
          "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_google_ai.xml",
      },
      // AI 工具
      {
        title: "Cursor Blog",
        xmlUrl:
          "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_cursor.xml",
      },
      {
        title: "Windsurf Blog",
        xmlUrl:
          "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_windsurf_blog.xml",
      },
      {
        title: "Windsurf Changelog",
        xmlUrl:
          "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_windsurf_changelog.xml",
      },
      {
        title: "Ollama Blog",
        xmlUrl:
          "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_ollama.xml",
      },
      { title: "Supabase Blog", xmlUrl: "https://supabase.com/rss.xml" },
      // AI 行业
      {
        title: "The Batch by DeepLearning.AI",
        xmlUrl:
          "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_the_batch.xml",
      },
      {
        title: "Surge AI Blog",
        xmlUrl:
          "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_blogsurgeai.xml",
      },
      {
        title: "Thinking Machines Lab",
        xmlUrl:
          "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_thinkingmachines.xml",
      },
      // 个人
      {
        title: "Paul Graham",
        xmlUrl:
          "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_paulgraham.xml",
      },
      { title: "Hamel Husain", xmlUrl: "https://hamel.dev/index.xml" },
    ],
  },
  {
    category: "AI Voices",
    feeds: [
      { title: "Andrej Karpathy", xmlUrl: "http://localhost:3847/feed/karpathy" },
      { title: "Sam Altman", xmlUrl: "http://localhost:3847/feed/sama" },
      { title: "Andrew Ng", xmlUrl: "http://localhost:3847/feed/AndrewYNg" },
      { title: "Lex Fridman", xmlUrl: "http://localhost:3847/feed/lexfridman" },
      { title: "Josh Miller", xmlUrl: "http://localhost:3847/feed/joshm" },
      { title: "OpenAI", xmlUrl: "http://localhost:3847/feed/OpenAI" },
      { title: "Google AI", xmlUrl: "http://localhost:3847/feed/GoogleAI" },
      { title: "Google AI Developers", xmlUrl: "http://localhost:3847/feed/googleaidevs" },
      { title: "DeepSeek", xmlUrl: "http://localhost:3847/feed/deepseek_ai" },
      { title: "Qwen", xmlUrl: "http://localhost:3847/feed/Alibaba_Qwen" },
      { title: "OpenClaw", xmlUrl: "http://localhost:3847/feed/openclaw" },
      { title: "Paul Graham", xmlUrl: "http://localhost:3847/feed/paulg" },
      { title: "Bindu Reddy", xmlUrl: "http://localhost:3847/feed/bindureddy" },
      { title: "Garry Tan", xmlUrl: "http://localhost:3847/feed/garrytan" },
      { title: "Hasan Toor", xmlUrl: "http://localhost:3847/feed/hasantoxr" },
      { title: "Mike Tang", xmlUrl: "http://localhost:3847/feed/blackanger" },
      { title: "Fenng", xmlUrl: "http://localhost:3847/feed/Fenng" },
      { title: "Anthropic", xmlUrl: "http://localhost:3847/feed/AnthropicAI" },
      { title: "Claude", xmlUrl: "http://localhost:3847/feed/claudeai" },
      { title: "云风", xmlUrl: "http://localhost:3847/feed/cloudwu" },
      { title: "卖桃者", xmlUrl: "http://localhost:3847/feed/sagacity" },
    ],
  },
  {
    category: "技术与工程",
    feeds: [
      {
        title: "simonwillison.net",
        xmlUrl: "https://simonwillison.net/atom/everything/",
      },
      {
        title: "jeffgeerling.com",
        xmlUrl: "https://www.jeffgeerling.com/blog.xml",
      },
      {
        title: "seangoedecke.com",
        xmlUrl: "https://www.seangoedecke.com/rss.xml",
      },
      {
        title: "daringfireball.net",
        xmlUrl: "https://daringfireball.net/feeds/main",
      },
      { title: "ericmigi.com", xmlUrl: "https://ericmigi.com/rss.xml" },
      { title: "antirez.com", xmlUrl: "https://antirez.com/rss" },
      { title: "idiallo.com", xmlUrl: "https://idiallo.com/feed.rss" },
      { title: "maurycyz.com", xmlUrl: "https://maurycyz.com/index.xml" },
      { title: "mitchellh.com", xmlUrl: "https://mitchellh.com/feed.xml" },
      { title: "xeiaso.net", xmlUrl: "https://xeiaso.net/blog.rss" },
      {
        title: "devblogs.microsoft.com/oldnewthing",
        xmlUrl: "https://devblogs.microsoft.com/oldnewthing/feed",
      },
      {
        title: "righto.com",
        xmlUrl: "https://www.righto.com/feeds/posts/default",
      },
      {
        title: "lucumr.pocoo.org",
        xmlUrl: "https://lucumr.pocoo.org/feed.atom",
      },
      { title: "skyfall.dev", xmlUrl: "https://skyfall.dev/rss.xml" },
      {
        title: "rachelbythebay.com",
        xmlUrl: "https://rachelbythebay.com/w/atom.xml",
      },
      { title: "overreacted.io", xmlUrl: "https://overreacted.io/rss.xml" },
      {
        title: "johndcook.com",
        xmlUrl: "https://www.johndcook.com/blog/feed/",
      },
      {
        title: "gilesthomas.com",
        xmlUrl: "https://gilesthomas.com/feed/rss.xml",
      },
      {
        title: "matklad.github.io",
        xmlUrl: "https://matklad.github.io/feed.xml",
      },
      { title: "evanhahn.com", xmlUrl: "https://evanhahn.com/feed.xml" },
      {
        title: "terriblesoftware.org",
        xmlUrl: "https://terriblesoftware.org/feed/",
      },
      {
        title: "rakhim.exotext.com",
        xmlUrl: "https://rakhim.exotext.com/rss.xml",
      },
      { title: "xania.org", xmlUrl: "https://xania.org/feed" },
      { title: "nesbitt.io", xmlUrl: "https://nesbitt.io/feed.xml" },
      { title: "susam.net", xmlUrl: "https://susam.net/feed.xml" },
      {
        title: "entropicthoughts.com",
        xmlUrl: "https://entropicthoughts.com/feed.xml",
      },
      {
        title: "buttondown.com/hillelwayne",
        xmlUrl: "https://buttondown.com/hillelwayne/rss",
      },
      { title: "borretti.me", xmlUrl: "https://borretti.me/feed.xml" },
      { title: "jayd.ml", xmlUrl: "https://jayd.ml/feed.xml" },
      { title: "minimaxir.com", xmlUrl: "https://minimaxir.com/index.xml" },
      {
        title: "geohot.github.io",
        xmlUrl: "https://geohot.github.io/blog/feed.xml",
      },
      {
        title: "blog.jim-nielsen.com",
        xmlUrl: "https://blog.jim-nielsen.com/feed.xml",
      },
      { title: "dfarq.homeip.net", xmlUrl: "https://dfarq.homeip.net/feed/" },
      { title: "jyn.dev", xmlUrl: "https://jyn.dev/atom.xml" },
      {
        title: "geoffreylitt.com",
        xmlUrl: "https://www.geoffreylitt.com/feed.xml",
      },
      {
        title: "downtowndougbrown.com",
        xmlUrl: "https://www.downtowndougbrown.com/feed/",
      },
      { title: "brutecat.com", xmlUrl: "https://brutecat.com/rss.xml" },
      {
        title: "eli.thegreenplace.net",
        xmlUrl: "https://eli.thegreenplace.net/feeds/all.atom.xml",
      },
      { title: "abortretry.fail", xmlUrl: "https://www.abortretry.fail/feed" },
      {
        title: "fabiensanglard.net",
        xmlUrl: "https://fabiensanglard.net/rss.xml",
      },
      {
        title: "oldvcr.blogspot.com",
        xmlUrl: "https://oldvcr.blogspot.com/feeds/posts/default",
      },
      {
        title: "bogdanthegeek.github.io",
        xmlUrl: "https://bogdanthegeek.github.io/blog/index.xml",
      },
      { title: "berthub.eu", xmlUrl: "https://berthub.eu/articles/index.xml" },
      {
        title: "it-notes.dragas.net",
        xmlUrl: "https://it-notes.dragas.net/feed/",
      },
      { title: "beej.us", xmlUrl: "https://beej.us/blog/rss.xml" },
      { title: "danielwirtz.com", xmlUrl: "https://danielwirtz.com/rss.xml" },
      { title: "matduggan.com", xmlUrl: "https://matduggan.com/rss/" },
      {
        title: "refactoringenglish.com",
        xmlUrl: "https://refactoringenglish.com/index.xml",
      },
      {
        title: "worksonmymachine.substack.com",
        xmlUrl: "https://worksonmymachine.substack.com/feed",
      },
      { title: "philiplaine.com", xmlUrl: "https://philiplaine.com/index.xml" },
      {
        title: "bernsteinbear.com",
        xmlUrl: "https://bernsteinbear.com/feed.xml",
      },
      { title: "danieldelaney.net", xmlUrl: "https://danieldelaney.net/feed" },
      {
        title: "herman.bearblog.dev",
        xmlUrl: "https://herman.bearblog.dev/feed/",
      },
      { title: "tomrenner.com", xmlUrl: "https://tomrenner.com/index.xml" },
      {
        title: "blog.pixelmelt.dev",
        xmlUrl: "https://blog.pixelmelt.dev/rss/",
      },
      {
        title: "martinalderson.com",
        xmlUrl: "https://martinalderson.com/feed.xml",
      },
      {
        title: "danielchasehooper.com",
        xmlUrl: "https://danielchasehooper.com/feed.xml",
      },
      {
        title: "chiark.greenend.org.uk/~sgtatham",
        xmlUrl:
          "https://www.chiark.greenend.org.uk/~sgtatham/quasiblog/feed.xml",
      },
      { title: "grantslatton.com", xmlUrl: "https://grantslatton.com/rss.xml" },
      { title: "aresluna.org", xmlUrl: "https://aresluna.org/main.rss" },
      {
        title: "michael.stapelberg.ch",
        xmlUrl: "https://michael.stapelberg.ch/feed.xml",
      },
      {
        title: "miguelgrinberg.com",
        xmlUrl: "https://blog.miguelgrinberg.com/feed",
      },
      { title: "keygen.sh", xmlUrl: "https://keygen.sh/blog/feed.xml" },
      { title: "computer.rip", xmlUrl: "https://computer.rip/rss.xml" },
      {
        title: "krebsonsecurity.com",
        xmlUrl: "https://krebsonsecurity.com/feed/",
      },
      {
        title: "lcamtuf.substack.com",
        xmlUrl: "https://lcamtuf.substack.com/feed",
      },
      { title: "micahflee.com", xmlUrl: "https://micahflee.com/feed/" },
      { title: "troyhunt.com", xmlUrl: "https://www.troyhunt.com/rss/" },
      {
        title: "mjg59.dreamwidth.org",
        xmlUrl: "https://mjg59.dreamwidth.org/data/rss",
      },
      {
        title: "Ahead of AI",
        xmlUrl: "https://magazine.sebastianraschka.com/feed",
      },
      { title: "Calvin French-Owen", xmlUrl: "https://calv.info/atom.xml" },
      {
        title: "GitHub Trending",
        xmlUrl: "https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml",
      },
      { title: "Sam Altman", xmlUrl: "https://blog.samaltman.com/posts.atom" },
    ],
  },
  {
    category: "播客",
    feeds: [
      { title: "游荡集", xmlUrl: "https://feed.xyzfm.space/6m6qmdfmaf6d" },
      { title: "古典不dan调", xmlUrl: "https://feed.xyzfm.space/64xxbj6nmcpe" },
      { title: "不合时宜", xmlUrl: "https://feed.xyzfm.space/ww7cqnybekty" },
      { title: "无人知晓", xmlUrl: "https://feed.xyzfm.space/ypn9dydpbxpc" },
      {
        title: "MacTalk·夜航西飞",
        xmlUrl: "https://feed.xyzfm.space/9mkbwqtmr8ma",
      },
      {
        title: "没折腰FM",
        xmlUrl: "https://www.ximalaya.com/album/43584169.xml",
      },
      { title: "岩中花述", xmlUrl: "https://feed.xyzfm.space/hwen8wf69c6g" },
      {
        title: "银杏树下",
        xmlUrl: "https://www.ximalaya.com/album/51007459.xml",
      },
      {
        title: "蒋方舟·一寸",
        xmlUrl: "https://rsshub.rssforever.com/xiaoyuzhou/podcast/67c7eeb07ac3e30992e75a2f",
      },
      {
        title: "萧泊内",
        xmlUrl: "https://www.ximalaya.com/album/70410212.xml",
      },
      {
        title: "张小珺Jùn｜商业访谈录",
        xmlUrl: "https://feed.xyzfm.space/dk4yh3pkpjp3",
      },
      {
        title: "文化有限",
        xmlUrl: "https://rsshub.rssforever.com/xiaoyuzhou/podcast/5e4515bd418a84a046e2b11a",
      },
      {
        title: "相机夜话",
        xmlUrl: "https://www.ximalaya.com/album/41782767.xml",
      },
      {
        title: "Lex Fridman Podcast Brief",
        xmlUrl: "https://lexfridmanrss.onrender.com/feed.xml",
      },
      {
        title: "TED Talks Daily",
        xmlUrl: "https://feeds.acast.com/public/shows/67587e77c705e441797aff96",
      },
    ],
  },
  {
    category: "视频",
    feeds: [
      {
        title: "汀见(原:大脸撑在小胸上)",
        xmlUrl:
          "https://rsshub-eta-topaz-88.vercel.app/youtube/channel/UCv8djBlOdCZWZ-7Nal-3pJQ",
      },
      {
        title: "王志安",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UCBKDRq35-L8xev4O7ZqBeLg",
      },
      {
        title: "柴静 Chai Jing",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UCjuNibFJ21MiSNpu8LZyV4w",
      },
      {
        title: "Leafy Zhang张叶蕾",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UC5iu9k6AOSEqGzhSXp8TjWg",
      },
      {
        title: "Marques Brownlee",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UCBJycsmduvYEL83R_U4JriQ",
      },
      {
        title: "Andrej Karpathy",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UCXUPKJO5MZQN11PqgIvyuvQ",
      },
      {
        title: "Anthropic - YouTube",
        xmlUrl: "https://rsshub.rssforever.com/youtube/user/%40anthropic-ai",
      },
      {
        title: "googlechrome - YouTube",
        xmlUrl: "https://rsshub.rssforever.com/youtube/user/googlechrome",
      },
      {
        title: "IN核局",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UCh6gAbFmwsoif41t_jow_QQ",
      },
    ],
  },
  {
    category: "科技新闻",
    feeds: [
      {
        title: "Ars Technica",
        xmlUrl: "https://feeds.arstechnica.com/arstechnica/index/",
      },
      { title: "TechCrunch", xmlUrl: "https://techcrunch.com/feed/" },
      { title: "WIRED", xmlUrl: "https://www.wired.com/feed/rss" },
      {
        title: "The Browser Company",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UCT5qXmLacW_a4DE-3EgeOiQ",
      },
      {
        title: "Readhub - 每日早报",
        xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/readhub/daily",
      },
    ],
  },
  {
    category: "商业与创业",
    feeds: [
      {
        title: "晚点 - 长报道",
        xmlUrl: "https://rsshub-eta-topaz-88.vercel.app/latepost/4",
      },
      { title: "Stratechery", xmlUrl: "https://stratechery.com/feed/" },
      { title: "dwarkesh.com", xmlUrl: "https://www.dwarkeshpatel.com/feed" },
      { title: "steveblank.com", xmlUrl: "https://steveblank.com/feed/" },
      {
        title: "A Smart Bear",
        xmlUrl: "https://longform.asmartbear.com/index.xml",
      },
      {
        title: "MicroConf",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UCHoBKQDRkJcOY2BO47q5Ruw",
      },
      {
        title: "Every (sagacity@icloud.com)",
        xmlUrl: "https://every.to/feeds/62e3ebdb41fd0051438d.xml",
      },
      {
        title: "Every",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UCjIMtrzxYc0lblGhmOgC_CA",
      },
      {
        title: "Lenny's Podcast",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UC6t1O76G0jYXOAoYCm153dA",
      },
      {
        title: "Notion",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UCoSvlWS5XcwaSzIcbuJ-Ysg",
      },
    ],
  },
  {
    category: "文化与社会",
    feeds: [
      { title: "pluralistic.net", xmlUrl: "https://pluralistic.net/feed/" },
      { title: "shkspr.mobi", xmlUrl: "https://shkspr.mobi/blog/feed/" },
      { title: "dynomight.net", xmlUrl: "https://dynomight.net/feed.xml" },
      {
        title: "garymarcus.substack.com",
        xmlUrl: "https://garymarcus.substack.com/feed",
      },
      { title: "timsh.org", xmlUrl: "https://timsh.org/rss/" },
      {
        title: "derekthompson.org",
        xmlUrl: "https://www.theatlantic.com/feed/author/derek-thompson/",
      },
      { title: "joanwestenberg.com", xmlUrl: "https://joanwestenberg.com/rss" },
      {
        title: "construction-physics.com",
        xmlUrl: "https://www.construction-physics.com/feed",
      },
      { title: "tedium.co", xmlUrl: "https://feed.tedium.co/" },
      { title: "wheresyoured.at", xmlUrl: "https://www.wheresyoured.at/rss/" },
      { title: "filfre.net", xmlUrl: "https://www.filfre.net/feed/" },
      { title: "hugotunius.se", xmlUrl: "https://hugotunius.se/feed.xml" },
      { title: "gwern.net", xmlUrl: "https://gwern.substack.com/feed" },
      { title: "simone.org", xmlUrl: "https://simone.org/feed/" },
      { title: "hey.paris", xmlUrl: "https://hey.paris/index.xml" },
      {
        title: "experimental-history.com",
        xmlUrl: "https://www.experimental-history.com/feed",
      },
      { title: "anildash.com", xmlUrl: "https://anildash.com/feed.xml" },
      { title: "Wait But Why", xmlUrl: "https://waitbutwhy.com/feed" },
      { title: "Farnam Street", xmlUrl: "https://fs.blog/feed/" },
    ],
  },
  {
    category: "设计、摄影与视觉",
    feeds: [
      {
        title: "Smashing Magazine",
        xmlUrl: "https://www.smashingmagazine.com/feed/",
      },
      { title: "A List Apart", xmlUrl: "https://alistapart.com/main/feed/" },
      {
        title: "Art21",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UC6Z_Gbfo7xwSMs6Ahkv-m3Q",
      },
      {
        title: "Nat Geo Photo of the Day",
        xmlUrl: "https://rsshub.rssforever.com/natgeo/dailyphoto",
      },
      {
        title: "东胶影厂",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UCc7UU0Pd6sZKzYkC-NRvdlw",
      },
      {
        title: "过片Thumb Action",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UCNhMSkTefqXoQjwIdAwi5Gw",
      },
      {
        title: "Bobby Tonelli",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UC0Vjgs42ZJ9E9HiILq2D9Yw",
      },
      {
        title: "Chris in Photography",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UCewPGlHNXWRlC5zcD_I8YdA",
      },
      {
        title: "Kyle McDougall",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UCJQcBYfgescGRJUzU6IMCMw",
      },
      {
        title: "Peter McKinnon",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UC3DkFux8Iv-aYnTRWzwaiBA",
      },
      {
        title: "The Art of Photography",
        xmlUrl:
          "https://www.youtube.com/feeds/videos.xml?channel_id=UC7T8roVtC_3afWKTOGtLlBA",
      },
    ],
  },
  {
    category: "个人成长与生活",
    feeds: [
      {
        title: "Gretchen Rubin",
        xmlUrl: "https://feeds.feedburner.com/GretchenRubin",
      },
      { title: "Derek Sivers", xmlUrl: "https://sive.rs/en.atom" },
      { title: "Austin Kleon", xmlUrl: "https://austinkleon.com/feed/" },
      { title: "Cal Newport", xmlUrl: "https://calnewport.com/feed/" },
      { title: "James Clear", xmlUrl: "https://jamesclear.com/feed" },
    ],
  },
  {
    category: "中文阅读",
    feeds: [
      {
        title: "阮一峰的网络日志",
        xmlUrl: "https://feeds.feedburner.com/ruanyifeng",
      },
      { title: "云风的 BLOG", xmlUrl: "https://blog.codingnow.com/atom.xml" },
      { title: "尺宅杂记", xmlUrl: "http://www.qncd.com/?feed=rss2" },
      { title: "土木坛子", xmlUrl: "https://tumutanzi.com/feed" },
      { title: "可能吧", xmlUrl: "https://feeds.feedburner.com/kenengbarss" },
      { title: "DBA Notes | 闲思录", xmlUrl: "https://dbanotes.net/feed" },
      { title: "酷壳 – CoolShell", xmlUrl: "https://coolshell.cn/feed" },
      { title: "Airing 的博客", xmlUrl: "https://blog.ursb.me/feed.xml" },
      {
        title: "MacTalk-池建强的随想录",
        xmlUrl: "https://macshuo.com/?feed=rss2",
      },
      {
        title: "MacTalk",
        xmlUrl: "https://plink.anyfeeder.com/weixin/sagacity-mac",
      },
      {
        title: "Fenng 的收藏",
        xmlUrl: "https://www.douban.com/feed/people/fenng/interests",
      },
    ],
  },
];
