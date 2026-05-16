import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = process.env.SPACE_SOURCE_OUT_DIR || "public";
const MAX_LATEST = 600;
const MAX_HOT = 200;
const MAX_PER_INTEREST = 220;
const TTL_HOURS = Number(process.env.SPACE_SOURCE_TTL_HOURS || 72);

const INTERESTS = {
  acg: ["二次元", "动漫", "动画", "漫画", "番剧", "同人", "谷子", "手办", "cos", "虚拟主播", "国创"],
  games: ["游戏", "手游", "主机", "steam", "电竞", "二游", "独立游戏", "米哈游", "任天堂", "版本", "公测"],
  handmade: ["手作", "手工", "拼豆", "滴胶", "毛毡", "黏土", "痛包", "手帐", "文具", "火漆", "包挂"],
  entertainment: ["娱乐", "明星", "爱豆", "综艺", "追星", "内娱", "韩娱", "日娱", "网红", "主播"],
  social: ["社会热点", "新闻", "民生", "公共议题", "法律", "校园", "热搜", "热榜", "争议"],
  "tech-ai": ["科技", "ai", "人工智能", "数码", "互联网", "工具", "编程", "前端", "开源", "模型"],
  music: ["音乐", "演出", "唱片", "live", "乐队", "歌单", "演唱会", "初音", "歌曲"],
  "music-production": ["音乐制作", "编曲", "混音", "作曲", "录音", "监听耳机", "监听音箱", "声卡", "midi", "daw"],
  "digital-audio": ["耳机", "音箱", "hifi", "相机", "手机", "电脑", "键盘", "智能家居", "数码"],
  pets: ["萌宠", "猫", "狗", "养狗", "养猫", "宠物", "训犬", "猫粮", "狗粮"],
  sports: ["体育", "运动", "健身", "跑步", "篮球", "足球", "羽毛球", "网球", "滑雪", "骑行"],
  food: ["美食", "探店", "烘焙", "咖啡", "茶饮", "料理", "减脂餐", "夜宵"],
  travel: ["旅游", "旅行", "城市", "citywalk", "酒店", "攻略", "露营", "自驾"],
  "fashion-beauty": ["穿搭", "美妆", "护肤", "香水", "美甲", "ootd", "发型", "医美"],
  "home-living": ["家居", "家装", "装修", "收纳", "租房改造", "软装", "花草", "园艺", "绿植"],
  finance: ["财经", "股票", "基金", "理财", "消费", "房产", "经济", "商业"],
  auto: ["汽车", "新能源车", "油车", "车评", "自驾", "通勤", "摩托"],
  aviation: ["航空", "飞机", "民航", "机场", "空乘", "飞行", "航天", "火箭"],
  education: ["学习", "高考", "考研", "考公", "考编", "留学", "雅思", "托福", "证书"],
  career: ["职场", "打工", "面试", "简历", "同事", "副业", "远程办公", "自由职业"],
  parenting: ["母婴", "育儿", "备孕", "亲子", "儿童教育", "奶粉", "家庭"],
  culture: ["读书", "文学", "历史", "曲艺", "戏曲", "相声", "播客", "艺术展览", "话剧", "音乐剧"],
  occult: ["星座", "玄学", "塔罗", "占星", "mbti", "运势", "疗愈"],
  health: ["健康", "医疗", "医院", "睡眠", "减肥", "养生", "牙齿", "体检"],
  outdoor: ["户外", "露营", "徒步", "登山", "骑行", "钓鱼", "滑雪"],
  "local-life": ["本地", "同城", "周末去哪", "市集", "探店", "展会", "活动"],
  general: []
};

const nowIso = () => new Date().toISOString();

function safeString(value, fallback = "") {
  const text = String(value == null ? "" : value).trim();
  return text || fallback;
}

function compactText(value, max = 1200) {
  const text = safeString(value).replace(/\s+/g, " ");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function toNumber(value, fallback = 0) {
  const raw = safeString(value).replace(/,/g, "");
  const match = raw.match(/([\d.]+)\s*([万亿])?/);
  if (match) {
    const base = Number(match[1]);
    if (Number.isFinite(base)) {
      const unit = match[2] === "亿" ? 100000000 : match[2] === "万" ? 10000 : 1;
      return Math.round(base * unit);
    }
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function hashString(input) {
  const text = safeString(input);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizeUrl(url) {
  const text = safeString(url);
  if (!text) return "";
  if (text.startsWith("//")) return `https:${text}`;
  if (text.startsWith("http://i") && text.includes("hdslb.com")) return text.replace(/^http:/, "https:");
  return text;
}

function classify(item) {
  const text = `${item.title || ""} ${item.summary || ""} ${item.content || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
  const tags = [];
  for (const [key, words] of Object.entries(INTERESTS)) {
    if (key === "general") continue;
    if (words.some((word) => text.includes(String(word).toLowerCase()))) tags.push(key);
  }
  if (item.source === "juejin" || item.source === "v2ex") tags.push("tech-ai");
  if (item.source === "bilibili" && /动画|番剧|国创|虚拟|宅舞|手工|音乐|游戏/.test(text)) {
    if (/动画|番剧|国创|虚拟|宅舞/.test(text)) tags.push("acg");
    if (/手工|手作|拼豆|火漆|黏土/.test(text)) tags.push("handmade");
    if (/音乐|演奏|歌|初音|乐队/.test(text)) tags.push("music");
    if (/游戏|公测|pv|版本/.test(text)) tags.push("games");
  }
  if (item.source === "weibo" || item.source === "zhihu" || item.source === "douyin") tags.push("social");
  return Array.from(new Set(tags.length ? tags : ["general"]));
}

function material(input) {
  const source = safeString(input.source, "unknown");
  const title = compactText(input.title || input.word || input.name, 160);
  const summary = compactText(input.summary || input.desc || input.description || input.brief, 900);
  const content = compactText(input.content || input.text || "", 6000);
  if (!title && !summary && !content) return null;
  const url = normalizeUrl(input.url || input.link || input.uri);
  const item = {
    id: safeString(input.id || url || `${source}_${hashString(`${title}:${summary}:${content}`)}`),
    source,
    sourceLabel: input.sourceLabel || source,
    title,
    summary,
    content,
    url,
    image: normalizeUrl(input.image || input.cover || input.pic),
    authorName: safeString(input.authorName || input.author),
    heat: toNumber(input.heat || input.hot || input.view || input.likes, 0),
    likes: toNumber(input.likes || input.like || input.digg, 0),
    comments: toNumber(input.comments || input.reply || input.comment, 0),
    publishedAt: input.publishedAt || input.createdAt || nowIso(),
    fetchedAt: nowIso(),
    tags: Array.isArray(input.tags) ? input.tags : []
  };
  item.tags = Array.from(new Set([...item.tags, ...classify(item)]));
  return item;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.5",
        "User-Agent": "IDIC-Space-Source-Cache/1.0",
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function sourceBilibiliPopular() {
  const data = await fetchJson("https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1");
  return (data?.data?.list || []).map((item) => material({
    source: "bilibili",
    sourceLabel: "B站热门",
    id: item.aid,
    title: item.title,
    summary: item.desc,
    url: item.short_link_v2 || item.short_link || item.uri,
    image: item.pic,
    authorName: item.owner?.name,
    heat: item.stat?.view,
    likes: item.stat?.like,
    comments: item.stat?.reply,
    publishedAt: item.pubdate ? new Date(item.pubdate * 1000).toISOString() : nowIso(),
    tags: [item.tname].filter(Boolean)
  })).filter(Boolean);
}

async function sourceToutiaoHot() {
  const data = await fetchJson("https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc", {
    headers: { Referer: "https://www.toutiao.com/" }
  });
  return (data?.data || []).map((item) => material({
    source: "toutiao",
    sourceLabel: "头条热榜",
    id: item.ClusterId,
    title: item.Title,
    summary: item.Title,
    url: item.Url,
    heat: item.HotValue,
    tags: ["social"]
  })).filter(Boolean);
}

async function sourceDouyinHot() {
  const data = await fetchJson("https://www.douyin.com/aweme/v1/web/hot/search/list/", {
    headers: { Referer: "https://www.douyin.com/hot" }
  });
  const list = data?.data?.word_list || data?.data?.trending_list || [];
  return list.map((item) => material({
    source: "douyin",
    sourceLabel: "抖音热榜",
    id: item.sentence_id || item.group_id || item.word,
    title: item.word,
    summary: item.word,
    image: item.word_cover?.url_list?.[0],
    heat: item.hot_value,
    tags: ["social"]
  })).filter(Boolean);
}

async function sourceJuejinHot() {
  const data = await fetchJson("https://api.juejin.cn/content_api/v1/content/article_rank?category_id=1&type=hot");
  return (data?.data || []).map((item) => {
    const content = item.content || {};
    const counter = item.content_counter || {};
    return material({
      source: "juejin",
      sourceLabel: "掘金",
      id: content.content_id,
      title: content.title,
      summary: content.brief,
      url: content.content_id ? `https://juejin.cn/post/${content.content_id}` : "",
      authorName: item.author?.name,
      heat: counter.hot_rank || counter.view,
      likes: counter.like,
      comments: counter.comment_count,
      tags: ["tech-ai"]
    });
  }).filter(Boolean);
}

async function sourceV2exHot() {
  const data = await fetchJson("https://www.v2ex.com/api/topics/hot.json");
  return (Array.isArray(data) ? data : []).map((item) => material({
    source: "v2ex",
    sourceLabel: "V2EX",
    id: item.id,
    title: item.title,
    summary: item.content_rendered || item.content,
    url: item.url,
    authorName: item.member?.username,
    comments: item.replies,
    tags: ["tech-ai", item.node?.title].filter(Boolean)
  })).filter(Boolean);
}

async function collect() {
  const tasks = [
    ["bilibili", sourceBilibiliPopular],
    ["toutiao", sourceToutiaoHot],
    ["douyin", sourceDouyinHot],
    ["juejin", sourceJuejinHot],
    ["v2ex", sourceV2exHot]
  ];
  const batches = await Promise.all(tasks.map(async ([name, fn]) => {
    try {
      return await fn();
    } catch (error) {
      console.warn(`[source-cache] ${name} failed: ${error.message}`);
      return [];
    }
  }));
  const cutoff = Date.now() - TTL_HOURS * 3600000;
  const seen = new Set();
  return batches.flat()
    .filter((item) => {
      const key = `${item.source}:${item.id || item.url || item.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      const time = new Date(item.publishedAt || item.fetchedAt).getTime();
      return !Number.isFinite(time) || time >= cutoff;
    })
    .sort((a, b) => (b.heat || 0) - (a.heat || 0));
}

async function writeJson(relativePath, payload) {
  const target = path.join(OUT_DIR, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const items = await collect();
  const meta = { ok: true, generatedAt: nowIso(), count: items.length, ttlHours: TTL_HOURS };
  await writeJson("latest.json", { ...meta, items: items.slice(0, MAX_LATEST) });
  await writeJson("hot.json", { ...meta, items: items.slice(0, MAX_HOT) });

  for (const key of Object.keys(INTERESTS)) {
    const list = items.filter((item) => item.tags?.includes(key)).slice(0, MAX_PER_INTEREST);
    await writeJson(`interests/${key}.json`, { ...meta, interest: key, count: list.length, items: list });
  }
  await writeJson("index.json", {
    ...meta,
    interests: Object.keys(INTERESTS),
    files: ["latest.json", "hot.json", ...Object.keys(INTERESTS).map((key) => `interests/${key}.json`)]
  });
  console.log(`[source-cache] wrote ${items.length} items to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
