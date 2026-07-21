const STORAGE_KEY = "fukuoka-hiroshima-trip-v1";
const SYNC_STORAGE_KEY = "travel-app-cloud-sync-v1";
const TRIP_EDIT_DRAFTS_KEY = "travel-app-trip-edit-drafts-v1";
const SCHEMA_VERSION = 6;
const PHRASE_CATEGORIES = ["restaurant", "hotel", "transport", "shopping", "emergency", "general"];
let storageWarning = "";
const debouncedExchangeSave = debounce(saveTrip, 200);
const debouncedPreviewFetch = debounce((input) => fetchLinkPreviewForInput(input), 450);
let deferredInstallPrompt = null;
let serviceWorkerRegistration = null;
let pwaReloadPending = false;
let applyingRemote = false;
let syncUploadTimer = null;
let syncInFlight = false;
let tripDraftSaveTimer = null;

const transportModes = [
  { value: "", label: "未設定", icon: "" },
  { value: "walk", label: "步行", icon: "🚶" },
  { value: "transit", label: "大眾運輸", icon: "🚇" },
  { value: "drive", label: "開車", icon: "🚗" },
  { value: "taxi", label: "計程車", icon: "🚕" },
  { value: "bicycle", label: "自行車", icon: "🚲" },
  { value: "flight", label: "飛機", icon: "✈️" },
  { value: "other", label: "其他", icon: "➡" },
];

const dayFood = {
  1: [
    ["晚餐", "中洲/川端商店街彈性覓食", "拉麵、居酒屋或商店街小店", "現場候位"],
    ["宵夜", "中洲屋台", "視體力與天候短暫體驗", "現場候位"],
  ],
  2: [
    ["早餐", "&LOCALS 大濠公園", "日式飯糰、八女茶", "現場候位"],
    ["晚餐", "串焼き八兵衛 天神店", "博多串燒、蔬菜捲", "建議預約"],
    ["晚餐備案", "華味鳥", "水炊雞鍋", "建議預約"],
    ["甜點1", "I'm donut? 福岡店", "看到隊伍可接受再排", "現場候位"],
  ],
  3: [
    ["點心", "太宰府參道梅枝餅", "邊走邊補充體力", "現場購買"],
    ["午餐", "太宰府周邊蕎麥/定食", "避開尖峰排隊", "現場候位"],
    ["晚餐", "博多站美食街", "拉麵、定食、居酒屋選項多", "現場候位"],
  ],
  4: [
    ["午餐", "博多站美食街", "移動日前選擇交通方便店家", "現場候位"],
    ["晚餐", "牡蠣船かなわ", "廣島牡蠣料理", "建議預約"],
    ["晚餐備案", "八丁堀/流川周邊廣島燒", "抵達後彈性用餐", "現場候位"],
  ],
  5: [
    ["午餐", "あなごめし うえの便當", "宮島口名物，可減少排隊", "建議預訂"],
    ["點心", "宮島表參道烤牡蠣/紅葉饅頭", "邊走邊吃", "現場購買"],
    ["晚餐", "廣島市區廣島燒", "回市區後再用餐較彈性", "現場候位"],
  ],
  6: [
    ["午餐", "本通/紙屋町定食或咖啡", "交通方便、選項集中", "現場候位"],
    ["晚餐", "牡蠣船かなわ", "廣島牡蠣料理", "建議預約"],
    ["甜點", "市區咖啡店", "下午休息用", "現場候位"],
  ],
  7: [
    ["早餐", "飯店早餐或附近咖啡", "以省時穩定為主", "現場"],
    ["午餐", "廣島機場或市區簡餐", "依巴士時間調整", "現場"],
  ],
};

const initialTrip = {
  schemaVersion: SCHEMA_VERSION,
  meta: {
    name: "2026 福岡進 廣島出7天6夜自由行",
    startDate: "2026-09-20",
    endDate: "2026-09-26",
    alert:
      "連假提醒：2026/9/21 為敬老日、9/22為國民休日、9/23為秋分日。9/20-9/23是日本連假高峰，太宰府、新幹線與熱門餐廳容易客滿。",
  },
  accommodations: [
    {
      id: "hotel-vista-fukuoka",
      name: "Hotel Vista Fukuoka Nakasu-Kawabata",
      dates: "9/20 - 9/23 退房",
      address: "福岡縣福岡市博多區上川端町 14-28",
      notes: "中洲川端站步行圈；靠近川端商店街、中洲與櫛田神社",
      dayIds: [1, 2, 3, 4],
    },
    {
      id: "hiroshima-washington",
      name: "廣島華盛頓酒店 (Hiroshima Washington Hotel)",
      dates: "9/23 - 9/26 退房",
      address: "廣島縣廣島市中區新天地2-7",
      notes: "八丁堀電停步行約3分鐘；廣島巴士中心步行約10分鐘",
      dayIds: [4, 5, 6, 7],
    },
  ],
  bookings: [
    { priority: "最高", item: "博多→廣島新幹線指定席", date: "9/23", done: true, notes: "博多 16:54 出發、廣島 18:37 抵達；一般指定席。" },
    { priority: "最高", item: "廣島和平紀念資料館", date: "9/25", done: false, notes: "時段開放後預訂，建議 09:00左右入場。" },
    { priority: "高", item: "廣島華盛頓酒店", date: "9/23-9/26", done: true, notes: "確認早餐、取消條款與房型。" },
    { priority: "高", item: "串焼き八兵衛/華味鳥", date: "福岡晚餐", done: false, notes: "出發前3-6週預訂，連假晚餐容易客滿。" },
    { priority: "高", item: "牡蠣船かなわ", date: "9/23或9/25", done: false, notes: "出發前3-6週選定其中一晚即可。" },
    { priority: "中", item: "あなごめし うえの便當", date: "9/24", done: false, notes: "出發前數日至1週預訂，可減少宮島口排隊。" },
    { priority: "中", item: "彌山纜車", date: "9/24", done: false, notes: "出發前1-2週再查，依指定預約日與天候決定。" },
    { priority: "低", item: "福岡地鐵/西鐵/廣島路面電車/JR宮島口", date: "各日", done: true, notes: "不需預購，使用交通 IC卡即可。" },
    { priority: "低", item: "廣島機場巴士", date: "9/26", done: false, notes: "出發前1週確認班表，通常不劃位，提早排隊。" },
  ],
  packing: [
    {
      category: "重要證件與財務",
      items: ["護照", "手機", "錢包", "實體日圓現金（部分屋台/小店/寺社專用）", "交通IC卡（Suica/ICOCA/nimoca）"].map(makePackingItem),
    },
    {
      category: "電子產品",
      items: ["手機充電線", "行動電源（重要！每日必備）", "日本插頭轉接頭（如需要）"].map(makePackingItem),
    },
    {
      category: "衣物與配件",
      items: ["透氣衣物", "薄外套（因應9月下旬氣候）", "防滑鞋底的走路鞋（宮島日走大聖院與搭纜車必備）", "折傘/雨具（防曬兼防雨）"].map(makePackingItem),
    },
    { category: "個人藥品", items: ["常用個人藥品"].map(makePackingItem) },
  ],
  days: [
    makeDay(1, "9/20 日", "抵達福岡、入住與中洲夜間散步", "福岡機場－中洲川端", "福岡市區可直接使用 Suica、ICOCA、nimoca 等交通 IC 卡。國際線航廈沒有直接連接地鐵，需先搭免費接駁巴士至國內線。", "", [
      ["14:40", "華航自桃園機場起飛", "桃園國際機場", "建議起飛前約2.5-3小時抵達機場。", "", null, ""],
      ["18:05", "抵達福岡機場國際線航廈", "福岡機場國際線航廈", "入境、領行李預留約45-75分鐘。", "other", 75, "完成入境與領行李後前往 1F 接駁巴士站。"],
      ["19:05", "國際線1F搭免費接駁巴士前往國內線", "福岡機場國際線航廈", "尖峰可能較久。", "transit", 10, "搭免費接駁巴士至國內線，轉乘地鐵空港線。"],
      ["19:25", "福岡機場站搭地鐵空港線至中洲川端站", "中洲川端站", "下車後步行至飯店約3-6分鐘。", "transit", 10, "搭地鐵空港線至中洲川端站。"],
      ["19:45", "Hotel Vista 辦理入住", "福岡縣福岡市博多區上川端町 14-28", "若入境較慢，整體時間順延。", "walk", 6, "由中洲川端站步行至 Hotel Vista Fukuoka Nakasu-Kawabata。"],
      ["20:15", "晚餐：中洲/川端商店街", "川端通商店街", "第一晚不排高取消費套餐，以彈性為主。", "walk", 5, "飯店周邊步行覓食。"],
      ["21:30", "中洲河畔、川端商店街、櫛田神社外圍散步", "櫛田神社", "約30-45分鐘；視體力決定。", "walk", 10, "沿中洲與川端商店街步行。"],
    ]),
    makeDay(2, "9/21 一", "公園、美術館、選物店與天神購物", "大濠公園－赤坂/藥院－天神", "市區移動以地鐵與步行為主；連假期間天神商圈人潮較多，保留排隊時間。", "", [
      ["08:30", "早餐：大濠公園周邊", "大濠公園", "從中洲川端搭地鐵至大濠公園約8-10分鐘。", "transit", 10, "搭地鐵空港線至大濠公園站。"],
      ["09:30", "大濠公園散步", "福岡縣福岡市中央區大濠公園", "環湖慢走約60-90分鐘，天氣熱可縮短。", "walk", 60, "沿湖區慢走。"],
      ["11:00", "福岡市美術館或周邊咖啡", "福岡市美術館", "依展覽與體力擇一安排。", "walk", 10, "大濠公園內步行前往。"],
      ["13:00", "赤坂/藥院選物店散策", "福岡市中央區赤坂", "以步行、地鐵或計程車彈性串接。", "transit", 20, "視店家位置搭地鐵或計程車移動。"],
      ["16:00", "天神購物", "天神站", "百貨、地下街與藥妝採買。", "transit", 15, "由赤坂或藥院移動至天神商圈。"],
      ["19:00", "晚餐：串焼き八兵衛或華味鳥", "天神", "連假晚餐建議事先訂位。", "walk", 10, "天神商圈內步行前往餐廳。"],
    ]),
    makeDay(3, "9/22 二", "太宰府、博多舊城與博多站", "太宰府－櫛田神社－博多站", "敬老日連假區間太宰府人潮高，早出發並避開中午主街尖峰。", "", [
      ["08:00", "出發前往西鐵福岡（天神）站", "西鐵福岡（天神）站", "預留轉乘與購票時間。", "transit", 15, "由中洲川端移動至天神。"],
      ["08:45", "搭西鐵前往太宰府", "太宰府站", "視班次於二日市轉乘；全程約35-45分鐘。", "transit", 45, "西鐵天神大牟田線至二日市轉太宰府線。"],
      ["09:40", "太宰府天滿宮與參道", "福岡縣太宰府市宰府4丁目7-1", "梅枝餅、伴手禮與參拜，連假請放慢節奏。", "walk", 10, "太宰府站步行前往參道與天滿宮。"],
      ["12:30", "午餐：太宰府或返回市區", "太宰府天滿宮參道", "熱門店可能排隊，保留備案。", "walk", 10, "參道周邊用餐。"],
      ["15:00", "博多舊城、櫛田神社與川端商店街", "櫛田神社", "從飯店步行圈可彈性調整。", "transit", 50, "由太宰府返回福岡市區後步行串接。"],
      ["17:30", "博多站採買與晚餐", "博多站", "確認隔日新幹線月台動線。", "transit", 10, "中洲川端搭地鐵至博多站。"],
    ]),
    makeDay(4, "9/23 三", "福岡最後半日、傍晚新幹線移動與廣島晚餐", "中洲川端－博多站－八丁堀", "新幹線指定席已完成；連假收假移動日，建議提早到博多站並避免壓線。", "本次攜帶 26 吋行李箱，通常三邊總和低於 160 公分，不需預訂「特大行李放置處座位」。", [
      ["09:00", "Hotel Vista 早餐或周邊早餐", "福岡縣福岡市博多區上川端町 14-28", "整理行李並確認退房物品。", "walk", 5, "飯店周邊用餐。"],
      ["10:00", "退房並寄放行李", "福岡縣福岡市博多區上川端町 14-28", "可向飯店確認當日寄放。", "walk", 0, "向櫃台詢問寄放行李。"],
      ["10:30", "中洲川端、博多舊城最後散步", "川端通商店街", "避開太遠景點，保留回飯店取行李時間。", "walk", 10, "以飯店步行圈為主。"],
      ["13:00", "午餐與伴手禮採買", "博多站", "建議在博多站周邊完成。", "transit", 10, "中洲川端搭地鐵至博多站。"],
      ["15:30", "取行李並前往博多站", "博多站", "連假移動日預留較寬裕時間。", "transit", 20, "先回飯店取行李，再搭地鐵至博多站。"],
      ["16:54", "博多→廣島 (已預訂指定席)", "廣島站", "預計 18:37 抵達；車程約 1 小時 43 分鐘。", "transit", 103, "搭乘已預訂指定席新幹線。"],
      ["18:37", "抵達廣島站，轉路面電車至八丁堀", "八丁堀電停", "下車與轉乘預留約 20-30 分鐘；電車約 10 分鐘。", "transit", 30, "廣島站轉乘路面電車至八丁堀。"],
      ["19:20", "廣島華盛頓酒店辦理入住", "廣島縣廣島市中區新天地2-7", "八丁堀電停步行約 3 分鐘。", "walk", 3, "由八丁堀電停步行至飯店。"],
      ["20:00", "晚餐：八丁堀/流川周邊", "八丁堀", "若安排牡蠣船かなわ，請確認訂位與交通。", "walk", 10, "飯店周邊步行覓食。"],
    ]),
    makeDay(5, "9/24 四", "宮島一日遊", "嚴島神社－大聖院－紅葉谷/彌山", "從廣島市區至宮島口可用 JR 或路面電車；渡輪與市區交通保留排隊時間。", "當日建議輕裝出門，穿防滑好走的鞋，雨具與行動電源放隨身包。", [
      ["08:00", "從八丁堀出發前往宮島口", "宮島口站", "JR較快，路面電車較直覺但時間較長。", "transit", 55, "由市區搭電車或 JR 前往宮島口。"],
      ["09:15", "宮島口搭渡輪", "宮島棧橋", "下船後步行前往嚴島神社。", "transit", 15, "搭渡輪前往宮島。"],
      ["10:00", "嚴島神社參拜", "廣島縣廿日市市宮島町1-1", "依潮汐與人潮調整拍照時間。", "walk", 12, "宮島棧橋步行前往。"],
      ["11:30", "表參道商店街與午餐", "宮島表參道商店街", "可安排あなごめし便當或現場用餐。", "walk", 10, "嚴島神社周邊步行。"],
      ["13:00", "大聖院", "廣島縣廿日市市宮島町210", "坡道與階梯較多，注意體力。", "walk", 15, "由表參道或嚴島神社步行。"],
      ["14:30", "紅葉谷公園或彌山纜車", "宮島纜車紅葉谷站", "是否上山依天候與纜車營運決定。", "walk", 20, "步行或接駁前往紅葉谷纜車站。"],
      ["17:30", "返回廣島市區", "八丁堀", "晚餐回八丁堀或本通周邊。", "transit", 70, "渡輪回宮島口後轉乘返回市區。"],
    ]),
    makeDay(6, "9/25 五", "和平紀念公園與市區散策", "和平公園－本通－八丁堀", "市區以路面電車與步行串接；和平紀念資料館建議早場入場。", "", [
      ["08:30", "早餐後前往和平紀念公園", "廣島和平紀念公園", "從八丁堀搭路面電車或步行視天候決定。", "transit", 15, "由八丁堀搭路面電車或步行前往。"],
      ["09:00", "廣島和平紀念資料館", "廣島縣廣島市中區中島町1-2", "待時段開放後預訂，建議早入場。", "walk", 5, "和平紀念公園內步行。"],
      ["11:00", "原爆圓頂館與和平紀念公園散策", "原爆圓頂館", "保留安靜參觀時間。", "walk", 10, "沿和平紀念公園步行。"],
      ["12:30", "午餐：本通/紙屋町", "本通商店街", "商店街選項多，適合彈性安排。", "walk", 15, "由和平公園步行或搭電車至本通。"],
      ["14:00", "本通商店街、市區咖啡與採買", "本通商店街", "可穿插休息。", "walk", 0, "商店街內步行。"],
      ["18:30", "晚餐：牡蠣船かなわ或市區餐廳", "牡蠣船かなわ", "若 Day 4 未安排，可放在今晚。", "transit", 20, "由本通或八丁堀前往餐廳。"],
    ]),
    makeDay(7, "9/26 六", "廣島機場返台", "八丁堀－廣島巴士中心－機場", "廣島機場巴士通常不劃位，出發前1週確認班表，當日提早排隊。", "退房前再次檢查護照、錢包、手機、行動電源與購買品；液體與刀剪類放托運。", [
      ["08:30", "飯店早餐與整理行李", "廣島縣廣島市中區新天地2-7", "確認航班、巴士班次與機場報到時間。", "walk", 0, "飯店內或周邊用餐。"],
      ["10:00", "廣島華盛頓酒店退房", "廣島縣廣島市中區新天地2-7", "依航班時間可寄放行李短暫採買。", "walk", 0, "櫃台辦理退房。"],
      ["10:30", "八丁堀/本通最後採買", "八丁堀", "避免跑太遠，保留前往巴士中心時間。", "walk", 10, "飯店周邊短距離採買。"],
      ["12:30", "前往廣島巴士中心", "廣島巴士中心", "從飯店步行約10分鐘。", "walk", 10, "由八丁堀步行至巴士中心。"],
      ["13:00", "搭乘廣島機場巴士", "廣島機場", "依實際航班回推；尖峰預留更寬裕。", "transit", 60, "搭機場巴士前往廣島機場。"],
      ["14:00", "抵達廣島機場", "廣島機場", "辦理報到、托運與安檢。", "walk", 0, "依航空公司櫃台辦理。"],
    ]),
  ],
  tools: {
    phrases: [
      { id: "phrase-restaurant-1", category: "restaurant", zh: "請給我這個。", ja: "これをください。" },
      { id: "phrase-hotel-1", category: "hotel", zh: "可以幫我寄放行李嗎？", ja: "荷物を預かっていただけますか。" },
      { id: "phrase-transport-1", category: "transport", zh: "請問博多/廣島新幹線的月台在哪裡？", ja: "博多・広島行きの新幹線のホームはどこですか。" },
      { id: "phrase-transport-2", category: "transport", zh: "請問去廣島機場的巴士在哪裡搭乘？", ja: "広島空港行きのバスはどこから乗れますか。" },
    ],
  },
  toolbox: {
    exchange: {
      baseCurrency: "TWD",
      rates: { JPY: 0.215, USD: 32.5, KRW: 0.024 },
      selectedCurrency: "JPY",
      locked: true,
      direction: "foreign-to-base",
      amount: "10000",
      lastModifiedAt: "",
    },
  },
};

function makeDay(id, date, title, area, transportTip, luggageTip, timeline) {
  return {
    id,
    date,
    title,
    area,
    transportTip,
    luggageTip,
    flights: [],
    references: [],
    timeline: timeline.map(([time, itemTitle, address, note, mode, durationMinutes, suggestion]) =>
      makeTimelineItem({ time, title: itemTitle, address, note, transport: { mode, durationMinutes, suggestion } })
    ),
    food: dayFood[id].map(([category, name, content, booking]) => ({ category, name, content, booking })),
  };
}

function makePackingItem(name) {
  return { id: createId(), name, done: false };
}

function makeTimelineItem(item = {}) {
  return {
    id: item.id || createId(),
    time: item.time || "",
    title: item.title || "",
    address: item.address || "",
    note: item.note || "",
    transport: {
      mode: item.transport?.mode || "",
      durationMinutes: normalizeDuration(item.transport?.durationMinutes),
      suggestion: item.transport?.suggestion || "",
    },
  };
}

function makeFlight(item = {}) {
  return {
    id: item.id || createId(),
    timelineItemId: item.timelineItemId ?? null,
    airline: item.airline || "",
    flightNumber: item.flightNumber || "",
    departureAirport: item.departureAirport || "",
    departureCode: item.departureCode || "",
    departureTerminal: item.departureTerminal || item.terminal || "",
    arrivalAirport: item.arrivalAirport || "",
    arrivalCode: item.arrivalCode || "",
    arrivalTerminal: item.arrivalTerminal || "",
    departureTime: item.departureTime || "",
    arrivalTime: item.arrivalTime || "",
    terminal: item.terminal || "",
    bookingReference: item.bookingReference || "",
    note: item.note || "",
    status: item.status || "",
    websiteUrl: isHttpUrl(item.websiteUrl) ? item.websiteUrl : "",
  };
}

function makeReference(item = {}) {
  return {
    id: item.id || createId(),
    timelineItemId: item.timelineItemId ?? null,
    name: item.name || "",
    url: isHttpUrl(item.url) ? item.url : "",
    description: item.description || "",
    siteName: item.siteName || "",
    previewImageUrl: isHttpUrl(item.previewImageUrl) ? item.previewImageUrl : "",
    note: item.note || "",
  };
}

function normalizeBooking(item = {}) {
  return { priority: item.priority || "中", item: item.item || "", date: item.date || "", notes: item.notes || "", done: item.done === true, id: item.id || createId() };
}

function normalizePhrase(phrase = {}) {
  const text = `${phrase.zh || ""} ${phrase.ja || ""}`;
  let category = phrase.category;
  if ((phrase.zh || "").trim() === "請給我這個。" || (phrase.ja || "").trim() === "これをください。") category = "restaurant";
  else if (!PHRASE_CATEGORIES.includes(category)) {
    if (/飯店|行李|ホテル|荷物/.test(text)) category = "hotel";
    else if (/車|巴士|機場|月台|新幹線|駅|バス|空港/.test(text)) category = "transport";
    else if (/餐|菜單|レストラン|メニュー/.test(text)) category = "restaurant";
    else if (/購物|買東西|ショッピング/.test(text)) category = "shopping";
    else if (/救命|警察|醫院|病院|緊急/.test(text)) category = "emergency";
    else category = "general";
  }
  return { ...phrase, id: phrase.id || createId(), category };
}

function createId() {
  return globalThis.crypto?.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeDuration(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function normalizeTripEditDay(day = {}) {
  return {
    ...day,
    id: day.id ?? createId(),
    date: day.date ?? "",
    area: day.area ?? day.region ?? day.location ?? "",
    title: day.title ?? day.description ?? day.summary ?? "",
    transportTip: day.transportTip ?? "",
    luggageTip: day.luggageTip ?? "",
    timeline: Array.isArray(day.timeline) ? day.timeline : [],
    flights: Array.isArray(day.flights) ? day.flights : [],
    references: Array.isArray(day.references) ? day.references : [],
    lodgings: Array.isArray(day.lodgings) ? day.lodgings : [],
    dining: Array.isArray(day.dining) ? day.dining : [],
  };
}

function makeTripEditDraft(trip) {
  const draft = clone(trip);
  draft.days = (draft.days || []).map(normalizeTripEditDay);
  return draft;
}

function normalizeTimelineItem(item) {
  if (Array.isArray(item)) {
    return makeTimelineItem({ time: item[0], title: item[1], note: item[2] });
  }
  return makeTimelineItem(item || {});
}

function normalizeTripV6(rawTrip) {
  const fallback = clone(initialTrip);
  const trip = { ...fallback, ...rawTrip };
  delete trip.schemaVersion;
  trip.id = rawTrip.id || createId();
  trip.title = rawTrip.title || rawTrip.meta?.name || fallback.meta.name;
  trip.startDate = rawTrip.startDate || rawTrip.meta?.startDate || fallback.meta.startDate;
  trip.endDate = rawTrip.endDate || rawTrip.meta?.endDate || fallback.meta.endDate;
  trip.notice = rawTrip.notice ?? rawTrip.meta?.alert ?? "";
  trip.days = (rawTrip.days || fallback.days).map((day, index) => {
    const fallbackDay = fallback.days[index] || {};
    const dining = (day.dining || day.food || fallbackDay.food || []).map((entry) => ({ id: entry.id || createId(), name: entry.name || "", category: entry.category || "", address: entry.address || "", reservationTime: entry.reservationTime || "", phone: entry.phone || "", url: isHttpUrl(entry.url) ? entry.url : "", description: entry.description || entry.content || "", previewImageUrl: isHttpUrl(entry.previewImageUrl) ? entry.previewImageUrl : "", note: entry.note || entry.booking || "" }));
    const lodgings = (day.lodgings || (rawTrip.accommodations || []).filter((entry) => entry.dayIds?.includes(day.id))).map((entry) => ({ id: entry.id || createId(), name: entry.name || "", address: entry.address || "", checkIn: entry.checkIn || entry.dates || "", checkOut: entry.checkOut || "", phone: entry.phone || "", bookingReference: entry.bookingReference || "", url: isHttpUrl(entry.url) ? entry.url : "", description: entry.description || entry.notes || "", previewImageUrl: isHttpUrl(entry.previewImageUrl) ? entry.previewImageUrl : "", note: entry.note || "" }));
    return {
      ...fallbackDay,
      ...day,
      flights: (day.flights || fallbackDay.flights || []).map(makeFlight),
      references: (day.references || fallbackDay.references || []).map(makeReference),
      timeline: (day.timeline || fallbackDay.timeline || []).map(normalizeTimelineItem),
      lodgings,
      dining,
      food: (day.food || fallbackDay.food || []).map((food) =>
        Array.isArray(food)
          ? { category: food[0], name: food[1], content: food[2], booking: food[3] }
          : food
      ),
    };
  });
  trip.bookings = (rawTrip.bookings || fallback.bookings || []).map(normalizeBooking);
  trip.toolbox = normalizeToolbox(rawTrip.toolbox || rawTrip.tools || fallback.toolbox);
  trip.tools = { ...fallback.tools, ...(rawTrip.tools || {}) };
  trip.tools.phrases = (rawTrip.tools?.phrases || fallback.tools.phrases).map(normalizePhrase);
  return trip;
}

function migrateTrip(raw) {
  const sourceTrips = Array.isArray(raw?.trips) ? raw.trips : [raw || initialTrip];
  const trips = sourceTrips.map(normalizeTripV6);
  const activeTripId = trips.some((trip) => trip.id === raw?.activeTripId) ? raw.activeTripId : trips[0].id;
  return { schemaVersion: SCHEMA_VERSION, activeTripId, trips };
}

function normalizeToolbox(toolbox) {
  const exchange = toolbox.exchange || {};
  const rates = sanitizeRates(exchange.rates || { JPY: exchange.exchangeRate || 0.215, USD: 32.5, KRW: 0.024 });
  const selectedCurrency = rates[exchange.selectedCurrency] ? exchange.selectedCurrency : Object.keys(rates)[0] || "JPY";
  return {
    exchange: {
      baseCurrency: sanitizeCurrency(exchange.baseCurrency || "TWD") || "TWD",
      rates,
      selectedCurrency,
      locked: exchange.locked !== false,
      direction: exchange.direction === "base-to-foreign" ? "base-to-foreign" : "foreign-to-base",
      amount: sanitizeAmount(exchange.amount || "10000"),
      lastModifiedAt: exchange.lastModifiedAt || "",
    },
  };
}

function sanitizeRates(rates) {
  const sanitized = Object.entries(rates).reduce((next, [currency, rate]) => {
    const cleanCurrency = sanitizeCurrency(currency);
    const cleanRate = parsePositiveNumber(rate);
    if (cleanCurrency && cleanRate) next[cleanCurrency] = cleanRate;
    return next;
  }, {});
  return Object.keys(sanitized).length ? sanitized : { JPY: 0.215 };
}

function loadTrip() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    const seeded = migrateTrip(initialTrip);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }

  try {
    const migrated = migrateTrip(JSON.parse(saved));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    const backupKey = `${STORAGE_KEY}-backup-${Date.now()}`;
    try {
      localStorage.setItem(backupKey, saved);
      storageWarning = `偵測到資料異常，已保留備份 ${backupKey} 並載入預設資料。`;
    } catch {
      storageWarning = "偵測到資料異常，但瀏覽器無法寫入備份；已載入預設資料。";
    }
    const seeded = migrateTrip(initialTrip);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function saveTrip() {
  state.root.schemaVersion = SCHEMA_VERSION;
  state.root.activeTripId = state.trip.id;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.root));
  if (!applyingRemote) scheduleSyncUpload();
}

const loadedRoot = loadTrip();
const state = {
  root: loadedRoot,
  trip: loadedRoot.trips.find((trip) => trip.id === loadedRoot.activeTripId) || loadedRoot.trips[0],
  tab: "itinerary",
  selectedDayId: loadedRoot.trips.find((trip) => trip.id === loadedRoot.activeTripId)?.days[0]?.id || loadedRoot.trips[0]?.days[0]?.id,
  modal: null,
  openMenuId: null,
  undoDelete: null,
  addFor: null,
  phraseCategory: "all",
  speechMessage: "",
  speechRequestId: 0,
  voiceLoadTimer: null,
  voicesChangedHandler: null,
  flightDetailId: null,
  editFlightId: null,
  editReferenceId: null,
  focusTimelineId: null,
  editModal: null,
  linkPreviewCache: new Map(),
  previewRequestId: 0,
  previewStatus: "",
  collectionDetail: null,
  collectionPanel: null,
  tripSelectorOpen: false,
  tripEditDraft: null,
  expandedOverviewDayId: null,
  tripEditScrollTop: 0,
  tripEditComposing: false,
  tripEditBaseRevision: null,
  pendingRemoteUpdate: null,
  tripDraftDialog: null,
  installDialogOpen: false,
  pwaUpdateReady: false,
  packingDialog: null,
  syncSettings: loadSyncSettings(),
  syncStatus: loadSyncSettings() ? "idle" : "local",
  syncDialog: null,
  syncConflict: null,
  syncMessage: "",
  syncDirty: false,
};

const app = document.querySelector("#app");
let modalRoot = document.querySelector("#modal-root");
if (!modalRoot) {
  modalRoot = document.createElement("div");
  modalRoot.id = "modal-root";
  document.body.append(modalRoot);
}
[app, modalRoot].forEach((root) => {
  root.addEventListener("pointerdown", (event) => {
    if (event.target.closest("[data-packing-action], [data-menu-packing-manager], [data-menu-packing-category-id], [data-close-packing-dialog]")) event.stopPropagation();
  });
  root.addEventListener("click", handlePackingManagementClick);
});
modalRoot.addEventListener("submit", handlePackingDialogSubmit);
modalRoot.addEventListener("input", handleTripEditorInput);
modalRoot.addEventListener("change", handleTripEditorInput);
modalRoot.addEventListener("compositionstart", handleTripEditorCompositionStart);
modalRoot.addEventListener("compositionend", handleTripEditorCompositionEnd);
modalRoot.addEventListener("click", handleTripEditorMovement);
modalRoot.addEventListener("click", handleTripDraftChoice);
app.addEventListener("change", handlePackingChange);

function readTripEditDraftStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRIP_EDIT_DRAFTS_KEY) || "{}");
    return parsed && typeof parsed === "object" && parsed.drafts && typeof parsed.drafts === "object" ? parsed : { drafts: {} };
  } catch { return { drafts: {} }; }
}

function getStoredTripEditDraft(tripId) {
  return readTripEditDraftStore().drafts[String(tripId)] || null;
}

function captureTripEditorSnapshot() {
  if (!isTripEditing()) return;
  syncTripDraftFromForm();
  const body = document.querySelector('#edit-modal-form[data-edit-type="trip"] .modal-body');
  if (body) state.tripEditScrollTop = body.scrollTop;
}

function persistTripEditDraft() {
  if (!isTripEditing()) return false;
  clearTimeout(tripDraftSaveTimer); tripDraftSaveTimer = null;
  try {
    captureTripEditorSnapshot();
    const store = readTripEditDraftStore();
    store.drafts[String(state.trip.id)] = {
      tripId: state.trip.id,
      draft: structuredClone(state.tripEditDraft),
      expandedTripDayId: state.expandedOverviewDayId,
      scrollTop: state.tripEditScrollTop,
      savedAt: new Date().toISOString(),
      baseRevision: state.tripEditBaseRevision,
      baseUpdatedAt: state.syncSettings?.lastSyncedAt ?? null,
    };
    localStorage.setItem(TRIP_EDIT_DRAFTS_KEY, JSON.stringify(store));
    return true;
  } catch { return false; }
}

function scheduleTripEditDraftSave() {
  if (!isTripEditing()) return;
  clearTimeout(tripDraftSaveTimer);
  tripDraftSaveTimer = setTimeout(persistTripEditDraft, 300);
}

function flushTripEditDraft() { return persistTripEditDraft(); }

function deleteStoredTripEditDraft(tripId) {
  try {
    const store = readTripEditDraftStore();
    delete store.drafts[String(tripId)];
    localStorage.setItem(TRIP_EDIT_DRAFTS_KEY, JSON.stringify(store));
    return true;
  } catch { return false; }
}

function render() {
  commitActiveEdit();
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="topbar-inner">
          <div class="trip-heading-card"><button class="trip-title-button" type="button" id="open-trip-selector"><span>${escapeHtml(state.trip.title)}</span><span aria-hidden="true">⌄</span></button><div class="trip-title-menu"><button class="menu-button" type="button" data-menu-trip-manager aria-label="旅行管理">⋯</button>${state.openMenuId === "trip-manager" ? `<div class="menu-popover trip-manager-popover">${renderTripManagerActions()}</div>` : ""}</div><p class="trip-dates">${escapeHtml(state.trip.startDate)} - ${escapeHtml(state.trip.endDate)}</p></div>
          <nav class="tabs" aria-label="主要頁籤">
            ${tabButton("itinerary", "行程")}
            ${tabButton("bookings", "待辦")}
            ${tabButton("packing", "打包")}
            ${tabButton("tools", "工具箱")}
          </nav>
        </div>
      </header>
      <main class="main">
        ${storageWarning ? `<div class="alert">${escapeHtml(storageWarning)}</div>` : ""}
        ${state.tab === "itinerary" ? renderItinerary() : ""}
        ${state.tab === "bookings" ? renderBookings() : ""}
        ${state.tab === "packing" ? renderPacking() : ""}
        ${state.tab === "tools" ? renderTools() : ""}
      </main>
      ${renderUndoToast()}
      ${renderPwaUpdateToast()}
      ${renderSyncStatus()}
    </div>
  `;
  modalRoot.innerHTML = `${renderModal()}${renderFlightDetailModal()}${renderCollectionDetailModal()}${renderCollectionPanel()}${renderTripSelectorDialog()}${renderEditModal()}${renderTripDraftDialog()}${renderMobileActionSheet()}${renderPackingDialog()}${renderInstallDialog()}${renderSyncDialog()}<input type="file" id="trip-backup-input" accept="application/json,.json" hidden />`;
  bindEvents();
  openRootDialogs();
  openMobileActionSheet();
  adjustDesktopPopovers();
  if (state.focusTimelineId) {
    const id = state.focusTimelineId;
    state.focusTimelineId = null;
    requestAnimationFrame(() => { const input = document.querySelector(`[data-row-id="${cssEscape(id)}"] .timeline-time`); input?.focus(); input?.scrollIntoView({ block: "center" }); });
  }
}

function tabButton(id, label) {
  return `<button class="tab-button ${state.tab === id ? "active" : ""}" data-tab="${id}">${label}</button>`;
}

function isStandaloneMode() {
  return globalThis.matchMedia?.("(display-mode: standalone)")?.matches || globalThis.navigator?.standalone === true;
}

function isIosDevice() {
  const navigatorRef = globalThis.navigator || {};
  return /iphone|ipad|ipod/i.test(navigatorRef.userAgent || "") || (navigatorRef.platform === "MacIntel" && navigatorRef.maxTouchPoints > 1);
}

function renderTripManagerActions() {
  return `
    <button type="button" data-edit-trip>編輯目前旅行</button>
    <button type="button" id="new-trip">新增旅行</button>
    <button type="button" id="delete-trip" ${state.root.trips.length <= 1 ? "disabled" : ""}>刪除目前旅行</button>
    ${isStandaloneMode() ? "" : '<button type="button" data-install-app>安裝到手機</button>'}
    <button type="button" data-export-trip-data>備份資料</button>
    <button type="button" data-import-trip-data>匯入備份</button>
    ${state.syncSettings ? '<button type="button" data-sync-now>立即同步</button><button type="button" data-sync-info>顯示同步資訊</button><button type="button" data-sync-stop>停止此裝置同步</button>' : '<button type="button" data-sync-enable>啟用跨裝置同步</button><button type="button" data-sync-join>加入既有同步</button>'}
    <button type="button" data-close-trip-menu>取消</button>
  `;
}

function renderInstallDialog() {
  if (!state.installDialogOpen) return "";
  const secureContextNote = globalThis.isSecureContext === false
    ? '<p class="pwa-install-note">目前是一般 HTTP 網址。要使用完整安裝與離線功能，請改用 HTTPS 正式網址。</p>'
    : "";
  const instructions = isIosDevice()
    ? '<ol><li>使用 Safari 開啟此網址。</li><li>點下方「分享」按鈕。</li><li>選擇「加入主畫面」，再按「新增」。</li></ol>'
    : '<ol><li>開啟瀏覽器選單。</li><li>選擇「安裝應用程式」或「加到主畫面」。</li><li>確認安裝。</li></ol>';
  return `<dialog class="pwa-install-dialog" id="pwa-install-dialog" aria-labelledby="pwa-install-title"><div class="modal-header"><h2 id="pwa-install-title">安裝旅遊行程</h2><button class="secondary-button" type="button" data-close-install-dialog>關閉</button></div><div class="modal-body"><p>安裝後可從手機主畫面開啟，畫面會更接近一般 APP。</p>${instructions}${secureContextNote}</div></dialog>`;
}

function renderPwaUpdateToast() {
  if (!state.pwaUpdateReady) return "";
  return `<div class="pwa-update-toast" role="status"><span>旅遊 APP 有新版可用</span><button type="button" data-apply-pwa-update>重新載入</button></div>`;
}

function loadSyncSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(SYNC_STORAGE_KEY) || "null");
    return value?.syncId && value?.syncSecret && Number.isInteger(value.revision) ? value : null;
  } catch { return null; }
}

function saveSyncSettings(settings) {
  state.syncSettings = settings;
  if (settings) localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(settings));
  else localStorage.removeItem(SYNC_STORAGE_KEY);
}

function syncStatusText() {
  return { local: "僅儲存在此裝置", syncing: "正在同步", synced: "已同步", offline: "離線，稍後同步", conflict: "雲端有衝突", failed: "同步失敗", idle: "已同步" }[state.syncStatus] || "僅儲存在此裝置";
}

function renderSyncStatus() {
  return `<div class="sync-status sync-${escapeAttr(state.syncStatus)}" role="status"><span aria-hidden="true"></span>${escapeHtml(syncStatusText())}</div>`;
}

function encodeSyncCredentials(settings) {
  const bytes = new TextEncoder().encode(JSON.stringify({ syncId: settings.syncId, syncSecret: settings.syncSecret }));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeSyncCredentials(value) {
  const input = String(value || "").trim();
  let encoded = input;
  try { encoded = new URL(input, location.href).searchParams.get("sync") || input; } catch {}
  const padded = encoded.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((encoded.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function currentSyncLink() {
  if (!state.syncSettings) return "";
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("sync", encodeSyncCredentials(state.syncSettings));
  return url.href;
}

function renderSyncDialog() {
  if (state.syncConflict) return `<div class="modal-backdrop"><section class="modal sync-dialog" role="dialog" aria-modal="true"><div class="modal-header"><h2>另一部裝置已有較新的修改</h2></div><div class="modal-body"><p>請選擇要保留哪一份資料。系統不會自動覆蓋。</p><div class="form-actions sync-actions"><button class="primary-button" type="button" data-conflict-remote>使用雲端版本</button><button class="danger-button" type="button" data-conflict-local>以此裝置版本覆蓋雲端</button><button class="secondary-button" type="button" data-conflict-cancel>取消，稍後處理</button></div></div></section></div>`;
  if (!state.syncDialog) return "";
  if (state.syncDialog === "join") return `<div class="modal-backdrop"><form class="modal sync-dialog" id="sync-join-form"><div class="modal-header"><h2>加入既有同步</h2><button class="secondary-button" type="button" data-sync-close>取消</button></div><div class="modal-body edit-form-grid"><label>同步連結<textarea class="text-input" name="link" placeholder="貼上含有 ?sync= 的同步連結"></textarea></label><p class="placeholder">或輸入同步代碼和同步密鑰</p><label>同步代碼<input class="text-input" name="syncId" autocomplete="off"></label><label>同步密鑰<input class="text-input" name="syncSecret" type="password" autocomplete="off"></label><div class="form-actions"><button class="primary-button" type="submit">先下載並加入</button><button class="secondary-button" type="button" data-sync-close>取消</button></div></div></form></div>`;
  const link = currentSyncLink();
  return `<div class="modal-backdrop"><section class="modal sync-dialog" role="dialog" aria-modal="true"><div class="modal-header"><h2>跨裝置同步資訊</h2><button class="secondary-button" type="button" data-sync-close>關閉</button></div><div class="modal-body"><p class="sync-warning">取得此連結的人可以查看及修改行程，請勿公開分享。</p><label>同步連結<textarea class="text-input sync-link" readonly>${escapeHtml(link)}</textarea></label><div class="form-actions"><button class="primary-button" type="button" data-copy-sync-link>複製同步連結</button><button class="secondary-button" type="button" data-sync-close>關閉</button></div><p class="placeholder">同步代碼：${escapeHtml(state.syncSettings?.syncId || "")}</p></div></section></div>`;
}

async function syncFetch(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) }, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function scheduleSyncUpload() {
  if (!state?.syncSettings || applyingRemote) return;
  state.syncDirty = true;
  clearTimeout(syncUploadTimer);
  syncUploadTimer = setTimeout(() => uploadSync(), 800);
}

function updateSyncRevision(revision, updatedAt) {
  saveSyncSettings({ ...state.syncSettings, revision, lastSyncedAt: updatedAt || new Date().toISOString() });
}

async function enableCloudSync() {
  state.openMenuId = null;
  if (!confirm("將此手機的目前行程建立為雲端版本")) { render(); return; }
  state.syncStatus = "syncing"; render();
  try {
    const status = await syncFetch("/api/sync/status");
    if (!status.body.enabled) throw new Error("伺服器尚未啟用同步");
    const { response, body } = await syncFetch("/api/sync/create", { method: "POST", body: JSON.stringify({ payload: state.root }) });
    if (!response.ok) throw new Error("無法建立同步");
    saveSyncSettings({ syncId: body.syncId, syncSecret: body.syncSecret, revision: body.revision, lastSyncedAt: body.updatedAt });
    state.syncDirty = false; state.syncStatus = "synced"; state.syncDialog = "info"; render();
  } catch (error) { state.syncStatus = navigator.onLine === false ? "offline" : "failed"; alert(error.message || "無法建立同步"); render(); }
}

function applyRemotePayload(payload, revision, updatedAt) {
  if (!payload || payload.schemaVersion !== 6 || !Array.isArray(payload.trips)) throw new Error("雲端資料格式不正確");
  if (isTripEditing()) {
    state.pendingRemoteUpdate = { remoteRevision: revision, remotePayload: payload, updatedAt };
    state.syncStatus = "conflict";
    return false;
  }
  applyingRemote = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    state.root = payload;
    state.trip = payload.trips.find((trip) => trip.id === payload.activeTripId) || payload.trips[0];
    state.selectedDayId = state.trip?.days?.[0]?.id || null;
    updateSyncRevision(revision, updatedAt);
    state.syncDirty = false;
  } finally { applyingRemote = false; }
  return true;
}

function releasePendingRemoteUpdate() {
  if (!state.pendingRemoteUpdate) return false;
  state.syncConflict = state.pendingRemoteUpdate;
  state.pendingRemoteUpdate = null;
  state.syncStatus = "conflict";
  return true;
}

async function downloadSync({ joining = false, credentials = state.syncSettings } = {}) {
  if (!credentials || syncInFlight) return;
  syncInFlight = true; state.syncStatus = "syncing"; if (!isTripEditing()) render();
  try {
    const { response, body } = await syncFetch(`/api/sync/${encodeURIComponent(credentials.syncId)}`, { headers: { Authorization: `Bearer ${credentials.syncSecret}` } });
    if (!response.ok) throw new Error(response.status === 404 ? "同步代碼或密鑰不正確" : "下載同步資料失敗");
    if (joining) {
      if (!confirm("此裝置已有行程。要使用雲端資料並先自動備份本機資料嗎？")) { state.syncStatus = state.syncSettings ? "idle" : "local"; render(); return; }
      localStorage.setItem(`${STORAGE_KEY}-before-cloud-${Date.now()}`, JSON.stringify(state.root));
      saveSyncSettings({ syncId: credentials.syncId, syncSecret: credentials.syncSecret, revision: body.revision, lastSyncedAt: body.updatedAt });
    } else if (body.revision <= credentials.revision) { state.syncStatus = "synced"; return; }
    else if (isTripEditing()) { state.pendingRemoteUpdate = { remoteRevision: body.revision, remotePayload: body.payload, updatedAt: body.updatedAt }; state.syncStatus = "conflict"; return; }
    else if (state.syncDirty) { state.syncConflict = { remoteRevision: body.revision, remotePayload: body.payload, updatedAt: body.updatedAt }; state.syncStatus = "conflict"; render(); return; }
    applyRemotePayload(body.payload, body.revision, body.updatedAt);
    state.syncDialog = null; state.syncStatus = "synced"; render();
  } catch (error) { state.syncStatus = navigator.onLine === false ? "offline" : "failed"; if (joining) alert(error.message); if (!isTripEditing()) render(); }
  finally { syncInFlight = false; }
}

async function uploadSync(baseRevision = state.syncSettings?.revision, forced = false) {
  if (!state.syncSettings || syncInFlight || (!state.syncDirty && !forced)) return;
  syncInFlight = true; state.syncStatus = "syncing"; if (!isTripEditing()) render();
  try {
    const { response, body } = await syncFetch(`/api/sync/${encodeURIComponent(state.syncSettings.syncId)}`, { method: "PUT", headers: { Authorization: `Bearer ${state.syncSettings.syncSecret}` }, body: JSON.stringify({ payload: state.root, baseRevision }) });
    if (response.status === 409) {
      if (isTripEditing()) state.pendingRemoteUpdate = body;
      else state.syncConflict = body;
      state.syncStatus = "conflict";
      if (!isTripEditing()) render();
      return;
    }
    if (!response.ok) throw new Error("上傳同步資料失敗");
    updateSyncRevision(body.revision, body.updatedAt); state.syncDirty = false; state.syncConflict = null; state.syncStatus = "synced"; if (!isTripEditing()) render();
  } catch { state.syncStatus = navigator.onLine === false ? "offline" : "failed"; if (!isTripEditing()) render(); }
  finally { syncInFlight = false; }
}

async function joinCloudSync(form) {
  const data = new FormData(form);
  try {
    const credentials = data.get("link")?.trim() ? decodeSyncCredentials(data.get("link")) : { syncId: data.get("syncId")?.trim(), syncSecret: data.get("syncSecret")?.trim() };
    await downloadSync({ joining: true, credentials });
  } catch { alert("同步連結格式不正確"); }
}

async function syncNow() {
  await downloadSync();
  if (!state.syncConflict) await uploadSync();
}

function stopCloudSync() {
  if (!confirm("停止後，此裝置仍會保留目前行程與離線資料。確定停止同步？")) return;
  clearTimeout(syncUploadTimer);
  saveSyncSettings(null);
  state.syncDirty = false; state.syncStatus = "local"; state.syncDialog = null; state.openMenuId = null; render();
}

function useRemoteConflict() {
  const conflict = state.syncConflict;
  if (!conflict) return;
  applyRemotePayload(conflict.remotePayload, conflict.remoteRevision, conflict.updatedAt);
  state.syncConflict = null; state.syncStatus = "synced"; render();
}

async function overwriteRemoteConflict() {
  const conflict = state.syncConflict;
  if (!conflict || !confirm("確定要以此裝置版本覆蓋另一部裝置的新版行程？")) return;
  state.syncConflict = null;
  state.syncDirty = true;
  await uploadSync(conflict.remoteRevision, true);
}

async function requestAppInstall() {
  state.openMenuId = null;
  if (!deferredInstallPrompt) {
    state.installDialogOpen = true;
    render();
    return;
  }
  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await promptEvent.prompt();
  await promptEvent.userChoice.catch(() => null);
  render();
}

function exportTripData() {
  const payload = {
    app: "travel-itinerary-pwa",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: state.root,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = objectUrl;
  link.download = `travel-itinerary-backup-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
  state.openMenuId = null;
  render();
}

async function importTripData(file) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const raw = parsed?.data ?? parsed;
    if (!raw || typeof raw !== "object" || (!Array.isArray(raw.trips) && !Array.isArray(raw.days))) {
      throw new Error("這不是可辨識的旅遊行程備份檔。");
    }
    if (!confirm("匯入後會以備份內容取代目前畫面資料。系統會先保留目前資料的安全備份，是否繼續？")) return;
    const migrated = migrateTrip(raw);
    const backupKey = `${STORAGE_KEY}-before-import-${Date.now()}`;
    localStorage.setItem(backupKey, JSON.stringify(state.root));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    state.root = migrated;
    state.trip = migrated.trips.find((trip) => trip.id === migrated.activeTripId) || migrated.trips[0];
    state.selectedDayId = state.trip.days[0]?.id || null;
    state.openMenuId = null;
    state.tab = "itinerary";
    render();
    alert(`匯入完成。原資料已保存在 ${backupKey}。`);
  } catch (error) {
    alert(error?.message || "無法匯入備份檔。");
  }
}

function applyPwaUpdate() {
  const worker = serviceWorkerRegistration?.waiting;
  if (worker) worker.postMessage({ type: "SKIP_WAITING" });
  else globalThis.location?.reload?.();
}

function renderItinerary() {
  const selected = getSelectedDay();
  return `
    <section aria-labelledby="summary-title">
      <h2 class="section-title" id="summary-title">行程總覽</h2>
      <div class="summary-grid">
        ${state.trip.days
          .map(
            (day, dayIndex) => `
              <button class="day-card ${day.id === selected.id ? "active" : ""}" data-day="${day.id}">
                <strong>Day ${dayIndex + 1} (${escapeHtml(formatTripDate(day.date))})</strong>
                ${escapeHtml(day.title)}
                <span>${escapeHtml(day.area)}</span>
              </button>
            `
          )
          .join("")}
      </div>
    </section>
    <section class="day-detail" aria-labelledby="detail-title">
      <div class="day-switcher-wrap">
        <nav class="day-switcher" aria-label="天數切換">
          ${state.trip.days.map((day, dayIndex) => `<button class="day-button ${day.id === selected.id ? "active" : ""}" data-day="${day.id}">D${dayIndex + 1}</button>`).join("")}
        </nav>
      </div>
      <div class="detail-header">
        <div>
          <h2 id="detail-title">Day ${state.trip.days.indexOf(selected) + 1} ${escapeHtml(formatTripDate(selected.date))}｜${escapeHtml(selected.title)}</h2>
          <p class="trip-dates">${escapeHtml(selected.area)}</p>
        </div>
      </div>
      <div class="timeline">
        ${selected.timeline.map((item, itemIndex) => renderTimelineItem(item, itemIndex, selected.timeline[itemIndex - 1])).join("")}
      </div>
      ${renderUnassigned(selected)}
      ${renderDayNotice(selected)}
      ${renderDayCollectionEntries(selected)}
    </section>
    <section class="notice-card"><div><h2>注意事項</h2><button class="mini-edit-button" type="button" data-edit-notice>編輯</button></div><p>${escapeHtml(state.trip.notice || "尚未設定注意事項")}</p></section>
  `;
}

function renderTimelineItem(item, itemIndex, previousItem) {
  const day = getSelectedDay();
  const attachedFlights = day.flights.filter((entry) => entry.timelineItemId === item.id).map((entry) => renderFlight(entry, day)).join("");
  const attachedReferences = day.references.filter((entry) => entry.timelineItemId === item.id).map((entry) => renderReference(entry, day)).join("");
  const attached = `${attachedFlights}${attachedReferences ? `<div class="reference-card-list">${attachedReferences}</div>` : ""}`;
  return `
    <div class="timeline-row color-${itemIndex % 5}" data-row-id="${escapeAttr(item.id)}">
      <article class="timeline-card" data-timeline-id="${escapeAttr(item.id)}">
        <div class="timeline-main">
          <div class="timeline-time readonly-time" tabindex="-1">${escapeHtml(item.time || "未定")}</div>
          <div class="timeline-content">
            <div class="timeline-title">${escapeHtml(item.title || "未命名行程")}</div>
            ${item.address ? `<div class="readonly-address">${escapeHtml(item.address)}</div>` : ""}
            <div class="transport-badge">${renderTransportSummary(item)}</div>
            ${item.transport.suggestion ? `<div class="timeline-suggestion">${escapeHtml(item.transport.suggestion)}</div>` : ""}
            ${item.note ? `<div class="timeline-note">${escapeHtml(item.note)}</div>` : ""}
            <div class="map-actions" data-map-actions>${renderMapActions(item, previousItem)}</div>
          </div>
          <div class="timeline-menu">
            <button class="menu-button" type="button" data-menu-timeline-id="${escapeAttr(item.id)}" aria-label="更多操作：${escapeAttr(item.title || "未命名行程")}">⋯</button>
            ${state.openMenuId === `timeline:${item.id}` ? `<div class="menu-popover"><button type="button" data-edit-timeline-id="${escapeAttr(item.id)}">編輯行程</button><button type="button" data-insert-timeline-above="${escapeAttr(item.id)}">在上方新增行程</button><button type="button" data-add-flight-for="${escapeAttr(item.id)}">新增航班資訊</button><button type="button" data-add-reference-for="${escapeAttr(item.id)}">新增旅遊網址</button><button type="button" data-delete-timeline-id="${escapeAttr(item.id)}">刪除行程</button></div>` : ""}
          </div>
        </div>
        <div class="attached-list">${attached}${renderAttachedAddForm(item.id)}</div>
      </article>
    </div>
  `;
}

function renderAttachedAddForm(timelineItemId) {
  if (state.addFor?.timelineItemId !== timelineItemId) return "";
  if (state.addFor.type === "flight") return `<div class="panel flight-add-row"><h4>新增航班資料</h4><input class="text-input" id="new-flight-airline" placeholder="航空公司"><input class="text-input" id="new-flight-number" placeholder="航班號碼"><input class="text-input" id="new-flight-departure" placeholder="出發機場名稱"><input class="text-input" id="new-flight-departure-code" placeholder="出發機場代碼"><input class="text-input" id="new-flight-departure-terminal" placeholder="出發航廈"><input class="text-input" id="new-flight-arrival" placeholder="抵達機場名稱"><input class="text-input" id="new-flight-arrival-code" placeholder="抵達機場代碼"><input class="text-input" id="new-flight-arrival-terminal" placeholder="抵達航廈"><input class="text-input" id="new-flight-departure-time" placeholder="出發日期時間"><input class="text-input" id="new-flight-arrival-time" placeholder="抵達日期時間"><input class="text-input" id="new-flight-booking" placeholder="訂位代號"><input class="text-input" id="new-flight-status" placeholder="狀態（使用者輸入）"><input class="text-input" id="new-flight-url" placeholder="航空公司網址 http/https"><input class="text-input" id="new-flight-note" placeholder="備註"><div class="form-actions"><button class="primary-button" id="add-flight">新增航班</button><button class="secondary-button" id="cancel-attached-add" type="button">取消</button></div></div>`;
  return `<div class="panel reference-add-row"><h4>新增旅遊參考網址</h4><input class="text-input" id="new-reference-url" placeholder="貼上 URL（http/https）"><p class="preview-fetch-status" id="new-reference-preview-status" role="status"></p><input class="text-input" id="new-reference-name" placeholder="網站標題"><input class="text-input" id="new-reference-description" placeholder="簡短說明"><input class="text-input" id="new-reference-site-name" placeholder="網站名稱"><input class="text-input" id="new-reference-image" placeholder="縮圖 URL http/https"><input class="text-input" id="new-reference-note" placeholder="備註"><div class="form-actions"><button class="primary-button" id="add-reference">新增網址</button><button class="secondary-button" id="cancel-attached-add" type="button">取消</button></div></div>`;
}

function renderUnassigned(day) {
  const flights = day.flights.filter((entry) => entry.timelineItemId === null);
  const references = day.references.filter((entry) => entry.timelineItemId === null);
  if (!flights.length && !references.length) return "";
  return `<section class="inline-module unassigned"><h3>未指定行程的航班與網址</h3><p class="placeholder">可在編輯時選擇所屬行程。</p><div class="inline-list">${flights.map((entry) => renderFlight(entry, day)).join("")}${references.length ? `<div class="reference-card-list">${references.map((entry) => renderReference(entry, day)).join("")}</div>` : ""}</div></section>`;
}

function renderDayCollectionEntries(day) {
  const countText = (count) => count ? `${count} 筆` : "尚未新增";
  return `<div class="collection-entry-grid day-resource-links"><button class="collection-entry" type="button" data-open-collection-panel="lodging"><span>查看住宿資訊</span><small>${countText(day.lodgings.length)}</small></button><button class="collection-entry" type="button" data-open-collection-panel="dining"><span>查看今日推薦餐飲</span><small>${countText(day.dining.length)}</small></button></div>`;
}

function renderDayNotice(day) {
  if (!day.transportTip && !day.luggageTip) return "";
  return `<section class="day-notice"><h3>當日注意事項</h3>${day.transportTip ? `<div><b>交通</b><p>${escapeHtml(day.transportTip)}</p></div>` : ""}${day.luggageTip ? `<div><b>行李</b><p>${escapeHtml(day.luggageTip)}</p></div>` : ""}</section>`;
}

function renderCollectionPanel() {
  if (!state.collectionPanel || state.editModal || state.collectionDetail) return "";
  const day = getSelectedDay();
  const type = state.collectionPanel;
  const lodging = type === "lodging";
  const list = lodging ? day.lodgings : day.dining;
  return `<dialog class="collection-dialog" id="collection-dialog" aria-labelledby="collection-dialog-title"><div class="modal-header"><h2 id="collection-dialog-title">${lodging ? "住宿資訊" : "今日推薦餐飲"}</h2><button class="secondary-button" type="button" data-close-collection-panel>關閉</button></div><div class="modal-body collection-dialog-body"><button class="primary-button collection-add-button" type="button" data-add-collection="${type}">${lodging ? "新增住宿" : "新增餐飲推薦"}</button><div class="collection-list">${list.map((item) => renderCollectionCard(type, item)).join("") || `<p class="placeholder">尚未新增。</p>`}</div></div></dialog>`;
}

function renderTripSelectorDialog() {
  if (!state.tripSelectorOpen) return "";
  return `<dialog class="trip-selector-dialog" id="trip-selector-dialog" aria-labelledby="trip-selector-title"><div class="modal-header"><h2 id="trip-selector-title">選擇旅行</h2><button class="secondary-button" type="button" data-close-trip-selector>取消</button></div><div class="modal-body trip-selector-list">${state.root.trips.map((trip) => `<button type="button" class="trip-selector-option ${trip.id === state.trip.id ? "active" : ""}" data-switch-trip="${escapeAttr(trip.id)}"><span>${escapeHtml(trip.title)}</span>${trip.id === state.trip.id ? `<small>目前旅行</small>` : ""}</button>`).join("")}</div></dialog>`;
}

function renderCollectionCard(type, item, live = false) {
  const isLodging = type === "lodging";
  const checkInTime = isLodging ? formatClock(item.checkIn) : "";
  const subtitle = !isLodging && item.reservationTime ? `預約 ${item.reservationTime}` : "";
  const colorIndex = stableColorIndex(item.id || item.url || item.name);
  const cardContent = `<div class="reference-preview-main"><div class="reference-copy"><div class="collection-title-line"><b ${live ? `data-live-preview="name"` : ""}>${escapeHtml(item.name || (isLodging ? "住宿資訊" : "餐飲推薦"))}</b>${checkInTime ? `<small class="lodging-checkin">入住 ${escapeHtml(checkInTime)}</small>` : ""}</div>${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ""}${item.description ? `<span ${live ? `data-live-preview="description"` : ""}>${escapeHtml(item.description)}</span>` : ""}</div><div class="preview-media">${item.previewImageUrl ? `<img src="${escapeAttr(item.previewImageUrl)}" alt="" ${live ? "data-live-preview-image" : "data-preview-image"}><span class="preview-fallback" ${item.previewImageUrl ? "hidden" : ""}></span>` : `<span class="preview-fallback"></span>`}</div></div>`;
  return `<article class="inline-card reference-card preview-card-shell collection-card preview-color-${colorIndex}" ${item.url ? "" : `data-open-collection-detail="${escapeAttr(item.id)}" data-collection-type="${type}"`}><div class="reference-preview-surface">${item.url ? `<a class="reference-hit-area" href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="開啟 ${escapeAttr(item.name || "網站")}"></a>` : ""}${cardContent}</div><div class="card-corner-actions"><button class="menu-button" type="button" data-menu-${type}-id="${escapeAttr(item.id)}" aria-label="更多操作">⋯</button>${state.openMenuId === `${type}:${item.id}` ? `<div class="menu-popover inline-popover"><button type="button" data-edit-collection="${escapeAttr(item.id)}" data-collection-type="${type}">編輯</button><button type="button" data-delete-collection="${escapeAttr(item.id)}" data-collection-type="${type}">刪除</button></div>` : ""}</div>${item.address ? `<a class="collection-map" href="${escapeAttr(buildMapSearchUrl(item.address))}" target="_blank" rel="noopener noreferrer">Google Maps</a>` : ""}</article>`;
}

function formatClock(value) {
  const match = String(value || "").match(/(?:T|\s|^)(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
}

function getTripWeekday(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const localDate = new Date(year, month - 1, day);
  if (localDate.getFullYear() !== year || localDate.getMonth() !== month - 1 || localDate.getDate() !== day) return "";
  return ["週日", "週一", "週二", "週三", "週四", "週五", "週六"][localDate.getDay()];
}

function formatTripWeekday(value) {
  const weekday = getTripWeekday(value);
  return weekday ? `（${weekday}）` : "";
}

function formatTripDate(value) {
  return value ? `${value}${formatTripWeekday(value)}` : "";
}

function renderFlights(day) {
  return `
    <section class="inline-module" aria-labelledby="flights-title">
      <h3 id="flights-title">航班資料</h3>
      <p class="placeholder">此區僅保存自填航班資訊，不提供即時航班狀態。</p>
      <div class="inline-list">
        ${day.flights.map(renderFlight).join("") || `<p class="placeholder">尚未新增航班。</p>`}
      </div>
      <div class="panel flight-add-row">
        <input class="text-input" id="new-flight-airline" placeholder="航空公司" />
        <input class="text-input" id="new-flight-number" placeholder="航班號碼" />
        <input class="text-input" id="new-flight-departure" placeholder="出發機場" />
        <input class="text-input" id="new-flight-arrival" placeholder="抵達機場" />
        <input class="text-input" id="new-flight-departure-time" placeholder="起飛時間" />
        <input class="text-input" id="new-flight-arrival-time" placeholder="抵達時間" />
        <input class="text-input" id="new-flight-terminal" placeholder="航廈" />
        <input class="text-input" id="new-flight-booking" placeholder="訂位代號" />
        <input class="text-input" id="new-flight-url" placeholder="航空公司網址 http/https" />
        <input class="text-input" id="new-flight-note" placeholder="備註" />
        <button class="primary-button" id="add-flight">新增航班</button>
      </div>
    </section>
  `;
}

function renderFlight(flight, day = getSelectedDay()) {
  return `
    <article class="inline-card flight-card preview-card-shell" data-open-flight-id="${escapeAttr(flight.id)}" tabindex="0" role="button" aria-label="查看航班 ${escapeAttr(flight.flightNumber || "詳細資料")}">
      <div class="flight-summary"><span class="flight-icon">✈️</span><div><b>${escapeHtml([flight.airline, flight.flightNumber].filter(Boolean).join(" ") || "未命名航班")}</b><span>${escapeHtml(flight.departureCode || flight.departureAirport || "出發地")} → ${escapeHtml(flight.arrivalCode || flight.arrivalAirport || "抵達地")}</span><small>${escapeHtml(flight.departureTime || "時間未定")} → ${escapeHtml(flight.arrivalTime || "時間未定")}</small></div></div>
      <div class="card-corner-actions">
        <button class="menu-button" type="button" data-menu-flight-id="${escapeAttr(flight.id)}" aria-label="更多操作：${escapeAttr(flight.flightNumber || "航班")}">⋯</button>
        ${state.openMenuId === `flight:${flight.id}` ? `<div class="menu-popover inline-popover"><button type="button" data-edit-flight-modal-id="${escapeAttr(flight.id)}">編輯航班資訊</button><button type="button" data-delete-flight-id="${escapeAttr(flight.id)}">刪除航班資訊</button></div>` : ""}
      </div>
    </article>
  `;
}

function flightField(flight, field, placeholder) {
  return `<input class="text-input" value="${escapeAttr(flight[field])}" data-flight-id="${escapeAttr(flight.id)}" data-flight-field="${field}" placeholder="${escapeAttr(placeholder)}" />`;
}

function renderReferences(day) {
  return `
    <section class="inline-module" aria-labelledby="references-title">
      <h3 id="references-title">旅遊參考網址</h3>
      <div class="inline-list">
        ${day.references.map(renderReference).join("") || `<p class="placeholder">尚未新增參考網址。</p>`}
      </div>
      <div class="panel reference-add-row">
        <input class="text-input" id="new-reference-name" placeholder="網址名稱" />
        <input class="text-input" id="new-reference-url" placeholder="URL http/https" />
        <input class="text-input" id="new-reference-note" placeholder="備註" />
        <button class="primary-button" id="add-reference">新增網址</button>
      </div>
    </section>
  `;
}

function renderReference(reference, day = getSelectedDay()) {
  const domain = getUrlDomain(reference.url);
  const colorIndex = stableColorIndex(reference.id || reference.url || reference.name);
  return `
    <article class="inline-card reference-card preview-card-shell preview-color-${colorIndex}">
      <div class="reference-preview-surface">
        ${reference.url ? `<a class="reference-hit-area" href="${escapeAttr(reference.url)}" target="_blank" rel="noopener noreferrer" aria-label="開啟 ${escapeAttr(reference.name || domain || "旅遊網址")}"></a>` : ""}
        <div class="reference-preview-main"><div class="reference-copy"><b>${escapeHtml(reference.name || reference.siteName || "旅遊參考")}</b>${reference.description ? `<span>${escapeHtml(reference.description)}</span>` : ""}</div><div class="preview-media">${reference.previewImageUrl ? `<img src="${escapeAttr(reference.previewImageUrl)}" alt="" data-preview-image><span class="preview-fallback" hidden></span>` : `<span class="preview-fallback"></span>`}</div></div>
      </div>
      <div class="card-corner-actions">
        <button class="menu-button" type="button" data-menu-reference-id="${escapeAttr(reference.id)}" aria-label="更多操作：${escapeAttr(reference.name || "參考網址")}">⋯</button>
        ${state.openMenuId === `reference:${reference.id}` ? `<div class="menu-popover inline-popover"><button type="button" data-edit-reference-modal-id="${escapeAttr(reference.id)}">編輯網址</button><button type="button" data-delete-reference-id="${escapeAttr(reference.id)}">刪除網址</button></div>` : ""}
      </div>
    </article>
  `;
}

function getUrlDomain(value) {
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function stableColorIndex(value) {
  let hash = 0;
  for (const char of String(value || "")) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 5;
}

function referenceFallbackIcon(reference = {}) {
  const text = `${reference.name || ""} ${reference.description || ""} ${reference.siteName || ""}`;
  if (/餐|食|拉麵|咖啡|restaurant|food|ramen/i.test(text)) return "🍜";
  if (/車|鐵道|交通|巴士|機場|train|rail|transport/i.test(text)) return "🚆";
  if (/飯店|住宿|hotel|旅館/i.test(text)) return "🏨";
  if (/購物|商店|市場|shopping|shop/i.test(text)) return "🛍️";
  if (/城|寺|神社|古蹟|castle|temple|shrine/i.test(text)) return "🏯";
  return "🗺️";
}

function assignmentSelect(type, item, day) {
  return `<select class="text-input" data-${type}-id="${escapeAttr(item.id)}" data-${type}-field="timelineItemId" aria-label="選擇所屬行程"><option value="">未指定行程</option>${day.timeline.map((timeline) => `<option value="${escapeAttr(timeline.id)}" ${timeline.id === item.timelineItemId ? "selected" : ""}>${escapeHtml(timeline.time)} ${escapeHtml(timeline.title)}</option>`).join("")}</select>`;
}

function renderTransportSummary(item) {
  const mode = getTransportMode(item.transport.mode);
  const duration = item.transport.durationMinutes;
  if (!mode.value && duration === null) return "交通方式未設定";
  return `${mode.icon ? `${mode.icon} ` : ""}${mode.label || "交通"}${duration !== null ? `約 ${duration} 分鐘` : ""}`;
}

function renderMapActions(item, previousItem) {
  const mapUrl = item.address ? buildMapSearchUrl(item.address) : "";
  const directionsUrl = item.address && previousItem?.address ? buildDirectionsUrl(previousItem.address, item.address, item.transport.mode) : "";
  const actionCount = directionsUrl ? 2 : 1;
  return `
    <div class="map-action-grid map-action-count-${actionCount}">
      ${mapUrl ? `<a class="secondary-button map-button" href="${escapeAttr(mapUrl)}" target="_blank" rel="noopener noreferrer" aria-label="在 Google Maps 查看此行程地點">Google Maps</a>` : `<span class="map-button disabled" aria-label="尚未設定地址，無法在 Google Maps 查看">Google Maps</span>`}
      ${directionsUrl ? `<a class="primary-button map-button" href="${escapeAttr(directionsUrl)}" target="_blank" rel="noopener noreferrer" aria-label="使用 Google Maps 從上一站導航至此行程">上一站導航</a>` : ""}
    </div>
  `;
}

function renderTimelineAddRow() {
  return `
    <div class="panel timeline-add-row">
      <input class="text-input" id="new-timeline-time" type="text" placeholder="時間，例如 14:30" />
      <input class="text-input" id="new-timeline-title" type="text" placeholder="新增今日行程項目" />
      <input class="text-input" id="new-timeline-address" type="text" placeholder="地址" />
      <select class="text-input" id="new-timeline-mode" aria-label="交通方式">
        ${transportModes.map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`).join("")}
      </select>
      <input class="text-input" id="new-timeline-duration" inputmode="numeric" type="text" placeholder="交通分鐘" />
      <input class="text-input" id="new-timeline-suggestion" type="text" placeholder="交通建議" />
      <input class="text-input" id="new-timeline-note" type="text" placeholder="一般備註" />
      <button class="primary-button" id="add-timeline-item">新增</button>
    </div>
  `;
}

function renderBookings() {
  return `
    <h2 class="section-title">預約與購票清單</h2>
    <div class="booking-list">
      ${state.trip.bookings
        .map(
          (item) => `
            <article class="booking-row ${item.done ? "done" : ""}">
              <input type="checkbox" data-booking-id="${escapeAttr(item.id)}" ${item.done ? "checked" : ""} aria-label="切換 ${escapeAttr(item.item)} 完成狀態" />
              <div>
                <b>【${escapeHtml(item.priority)}】${escapeHtml(item.item)}</b>
                <span>${escapeHtml(item.date)}｜<span class="${item.done ? "status-done" : "status-open"}">${item.done ? "已完成" : "未完成"}</span></span>
                <small>${escapeHtml(item.notes)}</small>
              </div>
              <div class="item-menu"><button class="menu-button" type="button" data-menu-booking-id="${escapeAttr(item.id)}" aria-label="更多操作：${escapeAttr(item.item)}">⋯</button>${state.openMenuId === `booking:${item.id}` ? `<div class="menu-popover inline-popover"><button type="button" data-delete-booking-id="${escapeAttr(item.id)}">刪除</button></div>` : ""}</div>
            </article>
          `
        )
        .join("")}
    </div>
    <form class="panel booking-add-form" id="booking-add-form"><h3>新增待辦事項</h3><select class="text-input" id="new-booking-priority" aria-label="優先度"><option>最高</option><option>高</option><option selected>中</option><option>低</option></select><input class="text-input" id="new-booking-item" required placeholder="待辦事項（必填）"><input class="text-input" id="new-booking-date" placeholder="日期"><input class="text-input" id="new-booking-notes" placeholder="備註"><button class="primary-button" type="submit">新增待辦</button></form>
  `;
}

function renderPacking() {
  const all = state.trip.packing.flatMap((group) => group.items);
  const done = all.filter((item) => item.done).length;
  const percent = all.length ? Math.round((done / all.length) * 100) : 0;
  return `
    <div class="packing-heading"><h2 class="section-title">行李打包清單</h2><div class="item-menu"><button class="menu-button" type="button" data-menu-packing-manager aria-label="管理打包清單項目欄">⋯</button>${state.openMenuId === "packing-manager" ? '<div class="menu-popover inline-popover"><button type="button" data-packing-action="add-category">新增項目欄</button><button type="button" data-packing-action="delete-category">刪除項目欄</button></div>' : ""}</div></div>
    <div class="progress-wrap">
      <div class="progress-label"><span>已打包 ${done} / ${all.length}</span><span>${percent}%</span></div>
      <div class="progress-track"><div class="progress-bar" style="width:${percent}%"></div></div>
    </div>
    <div class="packing-list">
      ${all.length ? "" : '<p class="placeholder">尚無打包項目。</p>'}
      ${state.trip.packing
        .map(
          (group, groupIndex) => `
            <section class="packing-category">
              <div class="packing-category-heading"><h3>${escapeHtml(group.category)}</h3><div class="item-menu"><button class="menu-button" type="button" data-menu-packing-category-id="${escapeAttr(packingGroupIdentity(group, groupIndex))}" aria-label="管理項目欄：${escapeAttr(group.category)}">⋯</button>${state.openMenuId === `packing-category:${packingGroupIdentity(group, groupIndex)}` ? `<div class="menu-popover inline-popover"><button type="button" data-packing-action="add-item" data-packing-category-id="${escapeAttr(packingGroupIdentity(group, groupIndex))}">新增子項目</button><button type="button" data-packing-action="delete-item" data-packing-category-id="${escapeAttr(packingGroupIdentity(group, groupIndex))}">刪除子項目</button><button type="button" data-packing-action="rename-category" data-packing-category-id="${escapeAttr(packingGroupIdentity(group, groupIndex))}">重新命名項目欄</button></div>` : ""}</div></div>
              ${group.items.length ? "" : '<p class="placeholder">尚無打包項目。</p>'}
              ${group.items
                .map(
                  (item) => `
                    <div class="check-row">
                      <input id="pack-${escapeAttr(item.id)}" type="checkbox" data-pack-id="${escapeAttr(item.id)}" ${item.done ? "checked" : ""} />
                      <label for="pack-${escapeAttr(item.id)}" class="${item.done ? "done" : ""}">${escapeHtml(item.name)}</label>
                    </div>
                  `
                )
                .join("")}
            </section>
          `
        )
        .join("")}
    </div>
  `;
}

function renderTools() {
  const exchange = state.trip.toolbox.exchange;
  const selectedRate = exchange.rates[exchange.selectedCurrency] || 0.215;
  const amount = parseDisplayNumber(exchange.amount);
  const result = calculateExchange(amount, selectedRate, exchange.direction);
  return `
    <h2 class="section-title">旅行計算機</h2>
    <section class="panel exchange-panel">
      <div class="form-grid">
        <label>本位幣<input class="text-input" id="base-currency" value="${escapeAttr(exchange.baseCurrency)}" maxlength="6" /></label>
        <label>旅遊幣<select class="text-input" id="selected-currency">${Object.keys(exchange.rates).map((currency) => `<option value="${currency}" ${currency === exchange.selectedCurrency ? "selected" : ""}>${currency}</option>`).join("")}</select></label>
      </div>
      <div class="rate-line">
        <span>自訂固定匯率：1 ${escapeHtml(exchange.selectedCurrency)} =</span>
        <input class="text-input rate-input" id="fixed-rate" type="text" inputmode="decimal" value="${escapeAttr(formatPlainNumber(selectedRate))}" ${exchange.locked ? "disabled" : ""} />
        <span>${escapeHtml(exchange.baseCurrency)}</span>
        <button class="secondary-button" id="toggle-rate-lock">${exchange.locked ? "已鎖定" : "鎖定"}</button>
      </div>
      <p class="placeholder">自訂固定匯率，非即時匯率。${exchange.lastModifiedAt ? `最後修改：${escapeHtml(formatDateTime(exchange.lastModifiedAt))}` : "尚未手動修改匯率。"}</p>
      <div class="calculator-grid">
        <label>輸入金額<input class="text-input" id="exchange-amount" type="text" inputmode="decimal" value="${escapeAttr(formatDisplayNumber(exchange.amount, inputCurrency()))}" /></label>
        <label>換算結果<input class="text-input result-input" id="exchange-result" readonly value="${escapeAttr(result.display)} ${escapeAttr(result.currency)}" /></label>
      </div>
      <button class="primary-button" id="swap-exchange-direction">交換換算方向：${exchange.direction === "foreign-to-base" ? `${exchange.selectedCurrency} → ${exchange.baseCurrency}` : `${exchange.baseCurrency} → ${exchange.selectedCurrency}`}</button>
    </section>
    <section class="panel add-currency-panel">
      <h3>新增旅遊幣別</h3>
      <div class="currency-add-row">
        <input class="text-input" id="new-currency-code" maxlength="6" placeholder="幣別，例如 EUR" />
        <input class="text-input" id="new-currency-rate" inputmode="decimal" placeholder="1 旅遊幣 = 多少 ${escapeAttr(exchange.baseCurrency)}" />
        <button class="secondary-button" id="add-currency">新增幣別</button>
      </div>
      <p class="placeholder">所有匯率都是自訂固定匯率，不是即時匯率。</p>
    </section>
  `;
}

function phraseCategoryLabel(category) {
  return { restaurant: "餐廳使用", hotel: "住宿使用", transport: "交通使用", shopping: "購物使用", emergency: "緊急使用", general: "一般使用" }[category];
}

function renderModal() {
  if (!state.modal) return "";
  const day = getSelectedDay();
  const title = state.modal === "hotel" ? "住宿資訊" : `Day ${day.id} 推薦餐飲`;
  const body =
    state.modal === "hotel"
      ? state.trip.accommodations
          .filter((hotel) => hotel.dayIds.includes(day.id))
          .map(
            (hotel) => `
              <div class="info-item">
                <b>${escapeHtml(hotel.name)}</b>
                <small>${escapeHtml(hotel.dates)}</small>
                <div>${escapeHtml(hotel.address)}</div>
                <small>${escapeHtml(hotel.notes)}</small>
              </div>
            `
          )
          .join("")
      : day.food
          .map(
            (food) => `
              <div class="info-item">
                <b>${escapeHtml(food.category)}｜${escapeHtml(food.name)}</b>
                <div>${escapeHtml(food.content)}</div>
                <small>${escapeHtml(food.booking)}</small>
              </div>
            `
          )
          .join("");

  return `
    <div class="modal-backdrop" role="presentation" data-close-modal>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <h2 id="modal-title">${escapeHtml(title)}</h2>
          <button class="secondary-button" data-close-modal>關閉</button>
        </div>
        <div class="modal-body info-list">${body}</div>
      </section>
    </div>
  `;
}

function renderFlightDetailModal() {
  if (!state.flightDetailId) return "";
  const flight = getSelectedDay().flights.find((item) => item.id === state.flightDetailId);
  if (!flight) return "";
  const detail = (label, value) => `<div class="info-item"><small>${label}</small><b>${escapeHtml(value || "未填寫")}</b></div>`;
  return `<div class="modal-backdrop" data-close-flight-detail><section class="modal" role="dialog" aria-modal="true" aria-labelledby="flight-detail-title"><div class="modal-header"><h2 id="flight-detail-title">${escapeHtml([flight.airline, flight.flightNumber].filter(Boolean).join(" ") || "航班詳細資料")}</h2><button class="secondary-button" data-close-flight-detail>關閉</button></div><div class="modal-body"><p class="placeholder">狀態及所有內容皆為使用者輸入資料，並非即時航班資訊。</p><div class="flight-detail-grid">${detail("出發機場", `${flight.departureAirport} ${flight.departureCode}`.trim())}${detail("出發航廈", flight.departureTerminal)}${detail("出發日期時間", flight.departureTime)}${detail("抵達機場", `${flight.arrivalAirport} ${flight.arrivalCode}`.trim())}${detail("抵達航廈", flight.arrivalTerminal)}${detail("抵達日期時間", flight.arrivalTime)}${detail("訂位代號", flight.bookingReference)}${detail("狀態（使用者輸入）", flight.status)}${detail("備註", flight.note)}</div>${flight.websiteUrl ? `<a class="primary-button" href="${escapeAttr(flight.websiteUrl)}" target="_blank" rel="noopener noreferrer">開啟航空公司網站</a>` : ""}</div></section></div>`;
}

function renderCollectionDetailModal() {
  if (!state.collectionDetail) return "";
  const { type, id } = state.collectionDetail;
  const item = (type === "lodging" ? getSelectedDay().lodgings : getSelectedDay().dining).find((entry) => entry.id === id);
  if (!item) return "";
  const labels = type === "lodging" ? [["address","地址"],["checkIn","入住時間"],["checkOut","退房時間"],["phone","電話"],["bookingReference","訂位代號"],["description","說明"],["note","備註"]] : [["category","分類"],["address","地址"],["reservationTime","預約時間"],["phone","電話"],["description","說明"],["note","備註"]];
  return `<div class="modal-backdrop" data-close-collection-detail><section class="modal" role="dialog" aria-modal="true"><div class="modal-header"><h2>${escapeHtml(item.name || (type === "lodging" ? "住宿資訊" : "餐飲推薦"))}</h2><button class="secondary-button" data-close-collection-detail>關閉</button></div><div class="modal-body info-list">${labels.filter(([field]) => item[field]).map(([field,label]) => `<div class="info-item"><small>${label}</small><b>${escapeHtml(item[field])}</b></div>`).join("")}${item.address ? `<a class="primary-button" href="${escapeAttr(buildMapSearchUrl(item.address))}" target="_blank" rel="noopener noreferrer">Google Maps</a>` : ""}</div></section></div>`;
}

function renderEditModal() {
  if (!state.editModal) return "";
  const day = getSelectedDay();
  const { type, id } = state.editModal;
  const item = type === "trip" ? (state.tripEditDraft || state.trip) : type === "notice" ? state.trip : type === "timeline" ? day.timeline.find((entry) => entry.id === id) : type === "flight" ? day.flights.find((entry) => entry.id === id) : type === "reference" ? day.references.find((entry) => entry.id === id) : type === "lodging" ? day.lodgings.find((entry) => entry.id === id) : day.dining.find((entry) => entry.id === id);
  if (!item) return "";
  const input = (field, label, value = item[field], typeAttr = "text") => `<label>${label}<input class="text-input" type="${typeAttr}" data-edit-field="${field}" value="${escapeAttr(value ?? "")}"></label>`;
  let fields = "";
  let title = "";
  let preview = "";
  if (type === "trip") {
    title = "編輯旅行";
    const tripInput = (field, label, value = item[field], typeAttr = "text") => `<label>${label}<input class="text-input" type="${typeAttr}" data-edit-field="${field}" data-trip-field="${field}" value="${escapeAttr(value ?? "")}"></label>`;
    fields = `${tripInput("title", "旅行名稱")}${tripInput("startDate", "開始日期", item.startDate, "date")}${tripInput("endDate", "結束日期", item.endDate, "date")}<label>注意事項<textarea class="text-input edit-textarea" data-edit-field="notice" data-trip-field="notice">${escapeHtml(item.notice ?? "")}</textarea></label><section class="trip-days-editor"><div class="collection-heading"><h3>行程總覽管理</h3><div class="overview-toolbar"><button class="secondary-button" type="button" data-sort-overview-days>依日期排序</button><button class="secondary-button" type="button" data-add-day>新增日期</button></div></div><p class="trip-day-edit-error" role="alert" hidden></p>${item.days.map((entry, index) => { const expanded = String(entry.id) === String(state.expandedOverviewDayId); return `<article class="overview-accordion ${expanded ? "expanded" : ""}" data-overview-day-id="${escapeAttr(entry.id)}"><div class="overview-summary"><button class="overview-drag-handle" type="button" data-drag-overview-day="${escapeAttr(entry.id)}" aria-label="拖曳調整第 ${index + 1} 天順序">⠿</button><div class="overview-summary-copy"><b>D${index + 1}</b><span>${escapeHtml(entry.date ? formatTripDate(entry.date) : "日期未定")}</span><span>${escapeHtml(entry.area || "區域未定")}</span><small>${escapeHtml(entry.title || "尚無描述")}</small></div><div class="overview-actions"><button class="order-button" type="button" data-move-overview-day="${escapeAttr(entry.id)}" data-direction="up" aria-label="將第 ${index + 1} 天上移" ${index === 0 ? "disabled" : ""}>↑</button><button class="order-button" type="button" data-move-overview-day="${escapeAttr(entry.id)}" data-direction="down" aria-label="將第 ${index + 1} 天下移" ${index === item.days.length - 1 ? "disabled" : ""}>↓</button><button class="secondary-button overview-edit-button" type="button" data-edit-trip-day="${escapeAttr(entry.id)}">${expanded ? "收合" : "編輯"}</button></div></div>${expanded ? `<div class="overview-expanded"><div class="day-overview-grid"><label>日期<input class="text-input overview-date-input" type="date" data-native-date-picker data-edit-field="day.${entry.id}.date" data-trip-day-field="date" data-day-id="${escapeAttr(entry.id)}" value="${escapeAttr(entry.date ?? "")}"><small class="date-weekday" data-date-weekday>${escapeHtml(formatTripWeekday(entry.date))}</small></label><label>區域<input class="text-input" data-edit-field="day.${entry.id}.area" data-trip-day-field="area" data-day-id="${escapeAttr(entry.id)}" value="${escapeAttr(entry.area ?? "")}"></label><label class="day-description-field">描述<textarea class="text-input day-description-input" data-edit-field="day.${entry.id}.title" data-trip-day-field="title" data-day-id="${escapeAttr(entry.id)}">${escapeHtml(entry.title ?? "")}</textarea></label></div><fieldset class="day-notice-editor"><legend>當日注意事項</legend><label>交通<textarea class="text-input" data-edit-field="day.${entry.id}.transportTip" data-trip-day-field="transportTip" data-day-id="${escapeAttr(entry.id)}">${escapeHtml(entry.transportTip ?? "")}</textarea></label><label>行李<textarea class="text-input" data-edit-field="day.${entry.id}.luggageTip" data-trip-day-field="luggageTip" data-day-id="${escapeAttr(entry.id)}">${escapeHtml(entry.luggageTip ?? "")}</textarea></label></fieldset><button class="danger-button" type="button" data-delete-day="${escapeAttr(entry.id)}">刪除此日期</button></div>` : ""}</article>`; }).join("")}</section>`;
  } else if (type === "notice") {
    title = "編輯注意事項";
    fields = `<label>注意事項<textarea class="text-input edit-textarea" data-edit-field="notice">${escapeHtml(item.notice)}</textarea></label>`;
  } else if (type === "timeline") {
    title = "編輯行程";
    fields = `${input("time", "時間")}${input("title", "行程名稱")}${input("address", "地址")}${input("transport.suggestion", "交通建議", item.transport.suggestion)}${input("note", "備註")}<label>交通方式<select class="text-input edit-transport-select" data-edit-field="transport.mode">${transportModes.map((option) => `<option value="${option.value}" ${option.value === item.transport.mode ? "selected" : ""}>${escapeHtml(`${option.icon} ${option.label}`.trim())}</option>`).join("")}</select></label>${input("transport.durationMinutes", "交通分鐘", item.transport.durationMinutes ?? "", "number")}`;
  } else if (type === "flight") {
    title = "編輯航班資訊";
    fields = `${editAssignmentSelect(type, item, day)}${[ ["airline","航空公司"],["flightNumber","航班號碼"],["departureAirport","出發機場名稱"],["departureCode","出發機場代碼"],["departureTerminal","出發航廈"],["arrivalAirport","抵達機場名稱"],["arrivalCode","抵達機場代碼"],["arrivalTerminal","抵達航廈"],["departureTime","出發日期時間"],["arrivalTime","抵達日期時間"],["bookingReference","訂位代號"],["status","狀態（使用者輸入）"],["websiteUrl","網站"],["note","備註"] ].map(([field,label]) => input(field,label)).join("")}`;
  } else if (type === "reference") {
    title = "編輯旅遊網址";
    fields = `${editAssignmentSelect(type, item, day)}${[["url","URL"],["name","網站標題"],["description","description"],["siteName","siteName"],["previewImageUrl","previewImageUrl"]].map(([field,label]) => input(field,label)).join("")}<p class="preview-fetch-status" id="edit-reference-preview-status" role="status"></p>`;
    preview = `<section class="modal-preview-section"><h3>即時預覽</h3><article class="inline-card reference-card preview-color-${stableColorIndex(item.id || item.url || item.name)}"><div class="reference-preview-surface"><div class="reference-preview-main"><div class="reference-copy"><b data-live-preview="name">${escapeHtml(item.name || item.siteName || "旅遊參考")}</b>${item.description ? `<span data-live-preview="description">${escapeHtml(item.description)}</span>` : ""}</div><div class="preview-media"><img src="${escapeAttr(item.previewImageUrl)}" alt="" data-live-preview-image ${item.previewImageUrl ? "" : "hidden"}><span class="preview-fallback" data-live-preview-fallback ${item.previewImageUrl ? "hidden" : ""}></span></div></div></div></article></section>`;
  } else {
    const lodging = type === "lodging";
    title = lodging ? "編輯住宿資訊" : "編輯餐飲推薦";
    const definitions = lodging ? [["name","名稱"],["address","地址"],["checkIn","入住時間"],["checkOut","退房時間"],["phone","電話"],["bookingReference","訂位代號"],["url","URL"],["description","description"],["previewImageUrl","previewImageUrl"],["note","備註"]] : [["name","名稱"],["category","分類"],["address","地址"],["reservationTime","預約時間"],["phone","電話"],["url","URL"],["description","description"],["previewImageUrl","previewImageUrl"],["note","備註"]];
    fields = `${definitions.map(([field,label]) => input(field,label)).join("")}<p class="preview-fetch-status" id="edit-reference-preview-status" role="status"></p>`;
    preview = `<section class="modal-preview-section"><h3>即時預覽</h3>${renderCollectionCard(type, item, true)}</section>`;
  }
  return `<div class="modal-backdrop" data-cancel-edit><form class="modal edit-modal" id="edit-modal-form" data-edit-type="${type}" data-edit-id="${escapeAttr(id)}"><div class="modal-header"><h2>${title}</h2><button class="secondary-button" type="button" data-cancel-edit>取消</button></div><div class="modal-body edit-form-grid">${fields}${preview}<div class="form-actions"><button class="primary-button" type="submit">儲存修改</button><button class="secondary-button" type="button" data-cancel-edit>取消</button></div></div></form></div>`;
}

function renderTripDraftDialog() {
  const dialog = state.tripDraftDialog;
  if (!dialog) return "";
  if (dialog.type === "restore") return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="trip-draft-dialog-title"><div class="modal-header"><h2 id="trip-draft-dialog-title">找到尚未完成的行程編輯草稿</h2></div><div class="modal-body"><div class="form-actions"><button class="primary-button" type="button" data-trip-draft-choice="continue-restore">繼續編輯</button><button class="danger-button" type="button" data-trip-draft-choice="discard-restore">捨棄草稿</button><button class="secondary-button" type="button" data-trip-draft-choice="cancel-restore">取消</button></div></div></section></div>`;
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="trip-draft-dialog-title"><div class="modal-header"><h2 id="trip-draft-dialog-title">要保留尚未完成的編輯草稿嗎？</h2></div><div class="modal-body"><div class="form-actions"><button class="primary-button" type="button" data-trip-draft-choice="keep-and-leave">保留草稿並離開</button><button class="danger-button" type="button" data-trip-draft-choice="discard-and-leave">捨棄草稿</button><button class="secondary-button" type="button" data-trip-draft-choice="continue-editing">繼續編輯</button></div></div></section></div>`;
}

function editAssignmentSelect(type, item, day) {
  return `<label>所屬行程<select class="text-input" data-edit-field="timelineItemId"><option value="">未指定行程</option>${day.timeline.map((timeline) => `<option value="${escapeAttr(timeline.id)}" ${timeline.id === item.timelineItemId ? "selected" : ""}>${escapeHtml(timeline.time)} ${escapeHtml(timeline.title)}</option>`).join("")}</select></label>`;
}

function renderUndoToast() {
  if (!state.undoDelete) return "";
  return `
    <div class="undo-toast" role="status">
      <span>已刪除「${escapeHtml(state.undoDelete.label || "項目")}」</span>
      <button class="secondary-button" id="undo-delete">復原</button>
    </div>
  `;
}

function renderMobileActionSheet() {
  if (!state.openMenuId) return "";
  const [type, ...idParts] = state.openMenuId.split(":");
  const id = idParts.join(":");
  let actions = "";
  if (type === "timeline") actions = `<button type="button" data-edit-timeline-id="${escapeAttr(id)}">編輯行程</button><button type="button" data-insert-timeline-above="${escapeAttr(id)}">在上方新增行程</button><button type="button" data-add-flight-for="${escapeAttr(id)}">新增航班資訊</button><button type="button" data-add-reference-for="${escapeAttr(id)}">新增旅遊網址</button><button class="sheet-danger" type="button" data-delete-timeline-id="${escapeAttr(id)}">刪除行程</button>`;
  if (type === "flight") actions = `<button type="button" data-edit-flight-modal-id="${escapeAttr(id)}">編輯航班資訊</button><button class="sheet-danger" type="button" data-delete-flight-id="${escapeAttr(id)}">刪除航班資訊</button>`;
  if (type === "reference") actions = `<button type="button" data-edit-reference-modal-id="${escapeAttr(id)}">編輯網址</button><button class="sheet-danger" type="button" data-delete-reference-id="${escapeAttr(id)}">刪除網址</button>`;
  if (type === "booking") actions = `<button class="sheet-danger" type="button" data-delete-booking-id="${escapeAttr(id)}">刪除待辦事項</button>`;
  if (type === "packing-manager") actions = `<button type="button" data-packing-action="add-category">新增項目欄</button><button class="sheet-danger" type="button" data-packing-action="delete-category">刪除項目欄</button>`;
  if (type === "packing-category") actions = `<button type="button" data-packing-action="add-item" data-packing-category-id="${escapeAttr(id)}">新增子項目</button><button class="sheet-danger" type="button" data-packing-action="delete-item" data-packing-category-id="${escapeAttr(id)}">刪除子項目</button><button type="button" data-packing-action="rename-category" data-packing-category-id="${escapeAttr(id)}">重新命名項目欄</button>`;
  if (type === "lodging" || type === "dining") actions = `<button type="button" data-edit-collection="${escapeAttr(id)}" data-collection-type="${type}">編輯</button><button class="sheet-danger" type="button" data-delete-collection="${escapeAttr(id)}" data-collection-type="${type}">刪除</button>`;
  if (type === "trip-manager") actions = renderTripManagerActions().replace('id="delete-trip"', 'class="sheet-danger" id="delete-trip"').replace('<button type="button" data-close-trip-menu>取消</button>', '');
  if (!actions) return "";
  return `<dialog class="mobile-action-sheet" id="mobile-action-sheet" aria-label="項目操作"><div class="sheet-handle"></div>${actions}<button class="sheet-cancel" type="button" data-close-action-sheet>取消</button></dialog>`;
}

function renderPackingDialog() {
  const dialog = state.packingDialog;
  if (!dialog) return "";
  const found = dialog.categoryId === undefined ? null : findPackingGroup(dialog.categoryId);
  const close = '<button class="secondary-button" type="button" data-close-packing-dialog>取消</button>';
  const shell = (title, body) => `<div class="modal-backdrop"><form class="modal packing-dialog" data-packing-dialog-form="${escapeAttr(dialog.type)}"><div class="modal-header"><h2>${escapeHtml(title)}</h2>${close}</div><div class="modal-body edit-form-grid">${body}</div></form></div>`;
  if (dialog.type === "add-category") return shell("新增項目欄", `<label>項目欄名稱<input class="text-input" name="name" required autofocus></label><div class="form-actions"><button class="primary-button" type="submit">新增</button>${close}</div>`);
  if (dialog.type === "delete-category") return shell("刪除項目欄", `<label>選擇項目欄<select class="text-input" name="targetId" required>${state.trip.packing.map((group, index) => `<option value="${escapeAttr(packingGroupIdentity(group, index))}">${escapeHtml(group.category)}</option>`).join("")}</select></label>${state.trip.packing.length ? `<div class="form-actions"><button class="danger-button" type="submit">刪除項目欄</button>${close}</div>` : '<p class="placeholder">目前沒有可刪除的項目欄。</p>'}`);
  if (!found) return shell("打包清單", `<p class="alert">找不到這個打包項目欄，請重新開啟。</p>${close}`);
  if (dialog.type === "add-item") return shell("新增子項目", `<input type="hidden" name="categoryId" value="${escapeAttr(dialog.categoryId)}"><label>子項目名稱<input class="text-input" name="name" required autofocus></label><div class="form-actions"><button class="primary-button" type="submit">新增</button>${close}</div>`);
  if (dialog.type === "delete-item") return shell("刪除子項目", `<input type="hidden" name="categoryId" value="${escapeAttr(dialog.categoryId)}"><label>選擇子項目<select class="text-input" name="itemId" required>${found.group.items.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select></label>${found.group.items.length ? `<div class="form-actions"><button class="danger-button" type="submit">刪除子項目</button>${close}</div>` : '<p class="placeholder">目前沒有可刪除的子項目。</p>'}`);
  if (dialog.type === "rename-category") return shell("重新命名項目欄", `<input type="hidden" name="categoryId" value="${escapeAttr(dialog.categoryId)}"><label>項目欄名稱<input class="text-input" name="name" value="${escapeAttr(found.group.category)}" required autofocus></label><div class="form-actions"><button class="primary-button" type="submit">儲存</button>${close}</div>`);
  return "";
}

function openMobileActionSheet() {
  const dialog = document.querySelector("#mobile-action-sheet");
  if (!dialog || !globalThis.matchMedia?.("(max-width: 719px)").matches || typeof dialog.showModal !== "function") return;
  dialog.showModal();
  dialog.addEventListener("cancel", () => { state.openMenuId = null; });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) closeMobileActionSheet(); });
}

function openRootDialogs() {
  const bindDialog = (dialog, close) => {
    if (!dialog || typeof dialog.showModal !== "function") return;
    if (!dialog.open) dialog.showModal();
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); }, { once: true });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  };
  bindDialog(document.querySelector("#collection-dialog"), closeCollectionPanel);
  bindDialog(document.querySelector("#trip-selector-dialog"), closeTripSelector);
  bindDialog(document.querySelector("#pwa-install-dialog"), () => { state.installDialogOpen = false; render(); });
}

function closeCollectionPanel() { document.querySelector("#collection-dialog")?.close(); state.collectionPanel = null; render(); }
function closeTripSelector() { document.querySelector("#trip-selector-dialog")?.close(); state.tripSelectorOpen = false; render(); }

function adjustDesktopPopovers() {
  if (globalThis.matchMedia?.("(max-width: 719px)").matches) return;
  document.querySelectorAll(".menu-popover").forEach((popover) => {
    const rect = popover.getBoundingClientRect();
    popover.classList.toggle("flip-up", rect.bottom > window.innerHeight - 12 && rect.top > rect.height + 12);
  });
}

function closeMobileActionSheet() {
  document.querySelector("#mobile-action-sheet")?.close();
  state.openMenuId = null;
  render();
}

function bindEvents() {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      stopSpeech();
      state.addFor = null;
      state.tab = button.dataset.tab;
      state.openMenuId = null;
      render();
    });
  });

  document.querySelectorAll("[data-day]").forEach((button) => {
    button.addEventListener("click", () => {
      state.addFor = null;
      const day = state.trip.days.find((entry) => String(entry.id) === button.dataset.day);
      if (!day) return;
      state.selectedDayId = day.id;
      state.tab = "itinerary";
      state.openMenuId = null;
      render();
      document.querySelector(".day-detail")?.scrollIntoView({ block: "start" });
    });
  });
  document.querySelector("#open-trip-selector")?.addEventListener("click", () => { state.tripSelectorOpen = true; render(); });
  document.querySelectorAll("[data-switch-trip]").forEach((button) => button.addEventListener("click", () => switchTrip(button.dataset.switchTrip)));
  document.querySelectorAll("[data-close-trip-selector]").forEach((button) => button.addEventListener("click", closeTripSelector));
  document.querySelectorAll("[data-menu-trip-manager]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); state.openMenuId = state.openMenuId === "trip-manager" ? null : "trip-manager"; render(); }));
  document.querySelectorAll("[data-close-trip-menu]").forEach((button) => button.addEventListener("click", () => { state.openMenuId = null; render(); }));
  document.querySelectorAll("#new-trip").forEach((button) => button.addEventListener("click", addTrip));
  document.querySelectorAll("#delete-trip").forEach((button) => button.addEventListener("click", deleteCurrentTrip));
  document.querySelectorAll("[data-edit-trip]").forEach((button) => button.addEventListener("click", () => openEditModal("trip", state.trip.id)));
  document.querySelectorAll("[data-edit-notice]").forEach((button) => button.addEventListener("click", () => openEditModal("notice", state.trip.id)));
  document.querySelectorAll("[data-add-collection]").forEach((button) => button.addEventListener("click", () => startNewCollection(button.dataset.addCollection)));
  document.querySelectorAll("[data-open-collection-panel]").forEach((button) => button.addEventListener("click", () => { state.collectionPanel = button.dataset.openCollectionPanel; render(); }));
  document.querySelectorAll("[data-close-collection-panel]").forEach((button) => button.addEventListener("click", closeCollectionPanel));
  document.querySelectorAll("[data-open-collection-detail]").forEach((card) => card.addEventListener("click", (event) => { if (event.target.closest("button,a")) return; state.collectionDetail = { type: card.dataset.collectionType, id: card.dataset.openCollectionDetail }; render(); }));
  document.querySelectorAll("[data-close-collection-detail]").forEach((element) => element.addEventListener("click", (event) => { if (event.target === element) { state.collectionDetail = null; render(); } }));
  document.querySelectorAll("[data-edit-collection]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); openEditModal(button.dataset.collectionType, button.dataset.editCollection); }));
  document.querySelectorAll("[data-delete-collection]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); deleteCollection(button.dataset.collectionType, button.dataset.deleteCollection); }));
  document.querySelectorAll("[data-add-day]").forEach((button) => button.addEventListener("click", addDay));
  document.querySelectorAll("[data-delete-day]").forEach((button) => button.addEventListener("click", () => deleteDay(button.dataset.deleteDay)));
  document.querySelector('#edit-modal-form[data-edit-type="trip"]')?.addEventListener("click", handleTripDayEditClick);
  document.querySelectorAll("[data-sort-overview-days]").forEach((button) => button.addEventListener("click", sortOverviewDaysByDate));
  document.querySelectorAll("[data-native-date-picker]").forEach((field) => {
    field.addEventListener("click", () => { try { field.showPicker?.(); } catch {} });
    field.addEventListener("input", () => { const weekday = field.closest("label")?.querySelector("[data-date-weekday]"); if (weekday) weekday.textContent = formatTripWeekday(field.value); });
  });
  bindOverviewDragHandles();

  document.querySelectorAll("[data-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      state.modal = button.dataset.modal;
      render();
    });
  });

  document.querySelectorAll("[data-close-modal]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target === element) {
        state.modal = null;
        render();
      }
    });
  });
  document.querySelectorAll("[data-close-flight-detail]").forEach((element) => element.addEventListener("click", (event) => { if (event.target === element) { state.flightDetailId = null; render(); } }));

  document.querySelectorAll("[data-delete-timeline-id]").forEach((button) => {
    button.addEventListener("click", () => deleteTimelineItem(button.dataset.deleteTimelineId));
  });

  document.querySelectorAll("[data-menu-timeline-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.openMenuId = state.openMenuId === `timeline:${button.dataset.menuTimelineId}` ? null : `timeline:${button.dataset.menuTimelineId}`;
      render();
    });
  });
  document.querySelectorAll("[data-add-flight-for]").forEach((button) => button.addEventListener("click", () => { state.addFor = { type: "flight", timelineItemId: button.dataset.addFlightFor }; state.openMenuId = null; render(); }));
  document.querySelectorAll("[data-add-reference-for]").forEach((button) => button.addEventListener("click", () => { state.addFor = { type: "reference", timelineItemId: button.dataset.addReferenceFor }; state.openMenuId = null; render(); }));
  document.querySelectorAll("[data-insert-timeline-above]").forEach((button) => button.addEventListener("click", () => insertTimelineAbove(button.dataset.insertTimelineAbove)));
  document.querySelectorAll("[data-edit-timeline-id]").forEach((button) => button.addEventListener("click", () => openEditModal("timeline", button.dataset.editTimelineId)));

  document.querySelectorAll("[data-menu-flight-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.openMenuId = state.openMenuId === `flight:${button.dataset.menuFlightId}` ? null : `flight:${button.dataset.menuFlightId}`;
      render();
    });
  });

  document.querySelectorAll("[data-menu-reference-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.openMenuId = state.openMenuId === `reference:${button.dataset.menuReferenceId}` ? null : `reference:${button.dataset.menuReferenceId}`;
      render();
    });
  });
  document.querySelectorAll("[data-menu-lodging-id], [data-menu-dining-id]").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault(); event.stopPropagation();
    const type = button.dataset.menuLodgingId ? "lodging" : "dining";
    const id = button.dataset.menuLodgingId || button.dataset.menuDiningId;
    state.openMenuId = state.openMenuId === `${type}:${id}` ? null : `${type}:${id}`;
    render();
  }));
  document.querySelectorAll("[data-open-flight-id]").forEach((card) => card.addEventListener("click", () => { state.flightDetailId = card.dataset.openFlightId; render(); }));
  document.querySelectorAll("[data-edit-flight-modal-id]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); openEditModal("flight", button.dataset.editFlightModalId); }));
  document.querySelectorAll("[data-edit-reference-modal-id]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); openEditModal("reference", button.dataset.editReferenceModalId); }));
  document.querySelectorAll("[data-stop-card], [data-menu-flight-id], [data-menu-reference-id]").forEach((control) => control.addEventListener("click", (event) => event.stopPropagation()));
  document.querySelectorAll("[data-preview-image], [data-live-preview-image]").forEach((image) => {
    image.addEventListener("error", () => handlePreviewImageError(image));
    image.addEventListener("load", () => { image.hidden = false; const fallback = image.nextElementSibling; if (fallback) fallback.hidden = true; });
  });
  if (["reference", "lodging", "dining"].includes(document.querySelector("#edit-modal-form")?.dataset?.editType)) {
    document.querySelectorAll("#edit-modal-form [data-edit-field]").forEach((field) => field.addEventListener("input", updateReferenceLivePreview));
  }
  [document.querySelector("#new-reference-url"), document.querySelector('#edit-modal-form[data-edit-type="reference"] [data-edit-field="url"]'), document.querySelector('#edit-modal-form[data-edit-type="lodging"] [data-edit-field="url"]'), document.querySelector('#edit-modal-form[data-edit-type="dining"] [data-edit-field="url"]')].filter(Boolean).forEach((input) => {
    input.addEventListener("input", () => debouncedPreviewFetch(input));
    input.addEventListener("change", () => fetchLinkPreviewForInput(input));
  });
  document.querySelectorAll("[data-cancel-edit]").forEach((element) => element.addEventListener("click", (event) => { if (event.target === element) cancelEditModal(); }));
  document.querySelector("#edit-modal-form")?.addEventListener("submit", saveEditModal);

  document.querySelectorAll("[data-flight-field]").forEach((field) => {
    field.addEventListener("change", () => updateFlightField(field));
  });
  document.querySelectorAll("[data-reference-field]").forEach((field) => {
    field.addEventListener("change", () => updateReferenceField(field));
  });
  document.querySelectorAll("[data-delete-flight-id]").forEach((button) => button.addEventListener("click", (event) => deleteFlight(event.currentTarget.dataset.deleteFlightId)));
  document.querySelectorAll("[data-delete-reference-id]").forEach((button) => button.addEventListener("click", (event) => deleteReference(event.currentTarget.dataset.deleteReferenceId)));
  document.querySelector("#add-flight")?.addEventListener("click", addFlight);
  document.querySelector("#add-reference")?.addEventListener("click", addReference);
  document.querySelector("#cancel-attached-add")?.addEventListener("click", cancelAttachedAdd);
  document.querySelectorAll("[data-close-action-sheet]").forEach((button) => button.addEventListener("click", closeMobileActionSheet));
  document.querySelectorAll("[data-install-app]").forEach((button) => button.addEventListener("click", requestAppInstall));
  document.querySelectorAll("[data-export-trip-data]").forEach((button) => button.addEventListener("click", exportTripData));
  document.querySelectorAll("[data-import-trip-data]").forEach((button) => button.addEventListener("click", () => document.querySelector("#trip-backup-input")?.click()));
  document.querySelectorAll("[data-sync-enable]").forEach((button) => button.addEventListener("click", enableCloudSync));
  document.querySelectorAll("[data-sync-join]").forEach((button) => button.addEventListener("click", () => { state.openMenuId = null; state.syncDialog = "join"; render(); }));
  document.querySelectorAll("[data-sync-now]").forEach((button) => button.addEventListener("click", () => { state.openMenuId = null; syncNow(); }));
  document.querySelectorAll("[data-sync-info]").forEach((button) => button.addEventListener("click", () => { state.openMenuId = null; state.syncDialog = "info"; render(); }));
  document.querySelectorAll("[data-sync-stop]").forEach((button) => button.addEventListener("click", stopCloudSync));
  document.querySelectorAll("[data-sync-close]").forEach((button) => button.addEventListener("click", () => { state.syncDialog = null; render(); }));
  document.querySelector("#sync-join-form")?.addEventListener("submit", (event) => { event.preventDefault(); joinCloudSync(event.currentTarget); });
  document.querySelectorAll("[data-copy-sync-link]").forEach((button) => button.addEventListener("click", async () => { try { await navigator.clipboard.writeText(currentSyncLink()); button.textContent = "已複製"; } catch { alert("無法自動複製，請長按連結後複製。"); } }));
  document.querySelectorAll("[data-conflict-remote]").forEach((button) => button.addEventListener("click", useRemoteConflict));
  document.querySelectorAll("[data-conflict-local]").forEach((button) => button.addEventListener("click", overwriteRemoteConflict));
  document.querySelectorAll("[data-conflict-cancel]").forEach((button) => button.addEventListener("click", () => { state.syncConflict = null; state.syncStatus = "conflict"; render(); }));
  document.querySelector("#trip-backup-input")?.addEventListener("change", (event) => importTripData(event.currentTarget.files?.[0]));
  document.querySelectorAll("[data-close-install-dialog]").forEach((button) => button.addEventListener("click", () => { state.installDialogOpen = false; render(); }));
  document.querySelector("[data-apply-pwa-update]")?.addEventListener("click", applyPwaUpdate);

  app.onclick = closeOpenActions;

  document.querySelector("#add-timeline-item")?.addEventListener("click", addTimelineItem);
  ["#new-timeline-time", "#new-timeline-title", "#new-timeline-address", "#new-timeline-duration", "#new-timeline-suggestion", "#new-timeline-note"].forEach((selector) => {
    document.querySelector(selector)?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") addTimelineItem();
    });
  });

  bindBookingEvents();
  bindExchangeEvents();

  document.querySelector("#undo-delete")?.addEventListener("click", restoreDeletedTimelineItem);
}

function closeOpenActions(event) {
  if (!state.openMenuId) return;
  if (event.target.closest(".timeline-row, .inline-card, .check-row, .menu-popover, [data-menu-packing-manager], [data-menu-packing-category-id]")) return;
  state.openMenuId = null;
  render();
}

function handlePreviewImageError(image) {
  const fallback = image.nextElementSibling;
  image.remove();
  if (fallback) fallback.hidden = false;
}

function updateReferenceLivePreview() {
  const form = document.querySelector("#edit-modal-form");
  if (!form) return;
  const value = (field) => form.querySelector(`[data-edit-field="${field}"]`)?.value.trim() || "";
  const draft = { name: value("name"), url: value("url"), description: value("description"), previewImageUrl: value("previewImageUrl") };
  const name = form.querySelector('[data-live-preview="name"]');
  const siteName = value("siteName");
  if (name) name.textContent = draft.name || siteName || "旅遊參考";
  const copy = name?.parentElement;
  let description = form.querySelector('[data-live-preview="description"]');
  if (draft.description) {
    if (!description && copy) { description = document.createElement("span"); description.dataset.livePreview = "description"; copy.append(description); }
    if (description) description.textContent = draft.description;
  } else {
    description?.remove();
  }
  const media = form.querySelector(".modal-preview-section .preview-media");
  let image = media?.querySelector("img");
  let fallback = media?.querySelector(".preview-fallback");
  if (fallback) fallback.textContent = "";
  if (isHttpUrl(draft.previewImageUrl)) {
    if (!image && media) { image = document.createElement("img"); image.alt = ""; image.dataset.livePreviewImage = ""; image.addEventListener("error", () => handlePreviewImageError(image)); image.addEventListener("load", () => { image.hidden = false; if (fallback) fallback.hidden = true; }); media.prepend(image); }
    image.src = draft.previewImageUrl;
    image.hidden = false;
  } else {
    image?.remove();
    if (fallback) fallback.hidden = false;
  }
}

async function fetchLinkPreviewForInput(input) {
  const url = input.value.trim();
  if (!isHttpUrl(url)) return;
  const isEdit = input.matches("[data-edit-field]");
  const status = document.querySelector(isEdit ? "#edit-reference-preview-status" : "#new-reference-preview-status");
  if (status) status.textContent = "正在取得網站預覽…";
  const requestId = ++state.previewRequestId;
  let result = state.linkPreviewCache.get(url);
  if (!result) {
    try {
      const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { headers: { Accept: "application/json" } });
      const payload = await response.json();
      result = response.ok ? { ok: true, ...payload } : { ok: false, error: payload.error || "無法取得網站預覽" };
    } catch { result = { ok: false, error: "無法連線至網站預覽服務" }; }
    state.linkPreviewCache.set(url, result);
  }
  if (requestId !== state.previewRequestId || input.value.trim() !== url) return;
  const setValue = (selector, value) => { const field = document.querySelector(selector); if (field && value) field.value = value; };
  if (result.ok) {
    if (isEdit) {
      setValue('#edit-modal-form [data-edit-field="name"]', result.title);
      setValue('#edit-modal-form [data-edit-field="description"]', result.description);
      setValue('#edit-modal-form [data-edit-field="siteName"]', result.siteName);
      setValue('#edit-modal-form [data-edit-field="previewImageUrl"]', result.imageUrl);
      updateReferenceLivePreview();
    } else {
      setValue("#new-reference-name", result.title);
      setValue("#new-reference-description", result.description);
      setValue("#new-reference-site-name", result.siteName);
      setValue("#new-reference-image", result.imageUrl);
    }
    if (status) status.textContent = "已取得網站預覽，可再自行修改。";
  } else {
    if (isEdit) updateReferenceLivePreview();
    if (status) status.textContent = `${result.error}；仍可只保存 URL。`;
  }
}

function handlePackingChange(event) {
  const checkbox = event.target.closest("[data-pack-id]");
  if (!checkbox) return;
  const found = findPackingItem(checkbox.dataset.packId);
  if (!found) { alert("找不到這筆打包項目，請重新開啟。"); return; }
  found.item.done = checkbox.checked;
  saveTrip();
  render();
}

function handlePackingManagementClick(event) {
  const manager = event.target.closest("[data-menu-packing-manager]");
  const categoryMenu = event.target.closest("[data-menu-packing-category-id]");
  const action = event.target.closest("[data-packing-action]");
  const close = event.target.closest("[data-close-packing-dialog]");
  if (!manager && !categoryMenu && !action && !close) return;
  event.preventDefault();
  event.stopPropagation();
  if (close) { state.packingDialog = null; render(); return; }
  if (manager) { state.openMenuId = "packing-manager"; render(); return; }
  if (categoryMenu) { state.openMenuId = `packing-category:${categoryMenu.dataset.menuPackingCategoryId}`; render(); return; }
  state.packingDialog = { type: action.dataset.packingAction, categoryId: action.dataset.packingCategoryId };
  state.openMenuId = null;
  render();
}

function handlePackingDialogSubmit(event) {
  const form = event.target.closest("[data-packing-dialog-form]");
  if (!form) return;
  event.preventDefault();
  event.stopPropagation();
  const data = new FormData(form);
  const type = form.dataset.packingDialogForm;
  if (type === "add-category") addPackingGroup(data.get("name"));
  if (type === "delete-category") deletePackingGroup(data.get("targetId"));
  if (type === "add-item") addPackingChild(data.get("categoryId"), data.get("name"));
  if (type === "delete-item") deletePackingChild(data.get("categoryId"), data.get("itemId"));
  if (type === "rename-category") renamePackingGroup(data.get("categoryId"), data.get("name"));
}

function bindBookingEvents() {
  document.querySelectorAll("[data-booking-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const booking = state.trip.bookings.find((item) => item.id === checkbox.dataset.bookingId);
      if (!booking) return;
      booking.done = checkbox.checked;
      saveTrip();
      render();
    });
  });
  document.querySelectorAll("[data-menu-booking-id]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); state.openMenuId = state.openMenuId === `booking:${button.dataset.menuBookingId}` ? null : `booking:${button.dataset.menuBookingId}`; render(); }));
  document.querySelectorAll("[data-delete-booking-id]").forEach((button) => button.addEventListener("click", () => deleteBooking(button.dataset.deleteBookingId)));
  document.querySelector("#booking-add-form")?.addEventListener("submit", (event) => { event.preventDefault(); addBooking(); });
}

function addBooking() {
  const item = document.querySelector("#new-booking-item").value.trim();
  if (!item) return;
  state.trip.bookings.push(normalizeBooking({ id: createId(), priority: document.querySelector("#new-booking-priority").value, item, date: document.querySelector("#new-booking-date").value.trim(), notes: document.querySelector("#new-booking-notes").value.trim(), done: false }));
  saveTrip();
  render();
}

function deleteBooking(id) {
  const index = state.trip.bookings.findIndex((item) => item.id === id);
  if (index === -1 || !confirm("確定刪除此待辦事項？此動作需要再次確認。") || !confirm("再次確認：要刪除此待辦事項嗎？")) return;
  const [item] = state.trip.bookings.splice(index, 1);
  setUndoDelete({ type: "booking", index, item, label: item.item || "待辦事項" });
  state.openMenuId = null;
  saveTrip();
  render();
}

function bindExchangeEvents() {
  const exchange = state.trip.toolbox.exchange;
  document.querySelector("#base-currency")?.addEventListener("change", (event) => {
    const next = sanitizeCurrency(event.target.value);
    if (!next) return render();
    exchange.baseCurrency = next;
    saveTrip();
    render();
  });
  document.querySelector("#selected-currency")?.addEventListener("change", (event) => {
    exchange.selectedCurrency = event.target.value;
    saveTrip();
    render();
  });
  document.querySelector("#fixed-rate")?.addEventListener("change", (event) => {
    updateFixedRate(event.target.value, true);
    render();
  });
  document.querySelector("#fixed-rate")?.addEventListener("input", (event) => {
    updateFixedRate(event.target.value, false);
    updateExchangeResult();
    debouncedExchangeSave();
  });
  document.querySelector("#fixed-rate")?.addEventListener("blur", () => render());
  document.querySelector("#toggle-rate-lock")?.addEventListener("click", () => {
    exchange.locked = !exchange.locked;
    saveTrip();
    render();
  });
  document.querySelector("#exchange-amount")?.addEventListener("input", (event) => {
    updateExchangeAmount(event.target.value, false);
    updateExchangeResult();
    debouncedExchangeSave();
  });
  document.querySelector("#exchange-amount")?.addEventListener("blur", (event) => {
    updateExchangeAmount(event.target.value, true);
    render();
  });
  document.querySelector("#swap-exchange-direction")?.addEventListener("click", () => {
    exchange.direction = exchange.direction === "foreign-to-base" ? "base-to-foreign" : "foreign-to-base";
    saveTrip();
    render();
  });
  document.querySelector("#add-currency")?.addEventListener("click", addCurrency);
}

function speakJapanese(text) {
  stopSpeech();
  if (!("speechSynthesis" in globalThis) || typeof SpeechSynthesisUtterance === "undefined") { setSpeechMessage("此瀏覽器不支援語音播放（speechSynthesis）。"); return; }
  const requestId = ++state.speechRequestId;
  const voices = speechSynthesis.getVoices();
  const japaneseVoice = voices.find((voice) => String(voice.lang || "").toLowerCase() === "ja-jp") || voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith("ja"));
  if (!japaneseVoice) {
    setSpeechMessage(voices.length ? "此裝置沒有可用的日文語音。" : "正在載入日文語音…");
    state.voicesChangedHandler = () => {
      if (requestId !== state.speechRequestId) return;
      clearVoiceLoader();
      speakJapanese(text);
    };
    speechSynthesis.addEventListener?.("voiceschanged", state.voicesChangedHandler, { once: true });
    state.voiceLoadTimer = setTimeout(() => {
      if (requestId !== state.speechRequestId) return;
      clearVoiceLoader();
      setSpeechMessage("此裝置沒有可用的日文語音。");
    }, 1500);
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = 0.85;
  utterance.voice = japaneseVoice;
  utterance.onend = () => { if (requestId === state.speechRequestId) setSpeechMessage(""); };
  utterance.onerror = () => { if (requestId === state.speechRequestId) setSpeechMessage(""); };
  setSpeechMessage("正在播放日文。");
  speechSynthesis.speak(utterance);
}

function stopSpeech() {
  state.speechRequestId += 1;
  clearVoiceLoader();
  if ("speechSynthesis" in globalThis) speechSynthesis.cancel();
  setSpeechMessage("");
}

function clearVoiceLoader() {
  clearTimeout(state.voiceLoadTimer);
  state.voiceLoadTimer = null;
  if (state.voicesChangedHandler && "speechSynthesis" in globalThis) speechSynthesis.removeEventListener?.("voiceschanged", state.voicesChangedHandler);
  state.voicesChangedHandler = null;
}

function setSpeechMessage(message) {
  state.speechMessage = message;
  const current = document.querySelector(".speech-message");
  if (!message) { current?.remove(); return; }
  if (current) { current.textContent = message; return; }
  const phrases = document.querySelector(".phrases-grid");
  if (!phrases) return;
  const status = document.createElement("p");
  status.className = "speech-message";
  status.setAttribute("role", "status");
  status.textContent = message;
  phrases.before(status);
}

function getSelectedDay() {
  return state.trip.days.find((day) => day.id === state.selectedDayId) || state.trip.days[0];
}

function makeBlankDay() {
  return { id: createId(), date: "", title: "新日期", area: "", transportTip: "", luggageTip: "", flights: [], references: [], timeline: [], lodgings: [], dining: [], food: [] };
}

function makeBlankTrip() {
  const day = makeBlankDay();
  return { id: createId(), title: "新旅行", startDate: "", endDate: "", notice: "", days: [day], bookings: [], packing: [], toolbox: normalizeToolbox({}), tools: { phrases: [] }, accommodations: [] };
}

function switchTrip(id) {
  const trip = state.root.trips.find((entry) => entry.id === id);
  if (!trip) return;
  stopSpeech(); state.trip = trip; state.root.activeTripId = trip.id; state.selectedDayId = trip.days[0]?.id; state.openMenuId = null; state.editModal = null; state.collectionPanel = null; state.tripSelectorOpen = false; saveTrip(); render();
}

function addTrip() {
  const trip = makeBlankTrip(); state.root.trips.push(trip); state.trip = trip; state.root.activeTripId = trip.id; state.selectedDayId = trip.days[0].id; saveTrip(); state.editModal = { type: "trip", id: trip.id }; render();
}

function deleteCurrentTrip() {
  if (state.root.trips.length <= 1) { alert("僅剩一趟旅行，請先新增旅行後再刪除。"); return; }
  if (!confirm(`確定刪除旅行「${state.trip.title}」？`)) return;
  const index = state.root.trips.findIndex((entry) => entry.id === state.trip.id);
  const [removed] = state.root.trips.splice(index, 1);
  if (!state.root.trips.length) state.root.trips.push(makeBlankTrip());
  state.trip = state.root.trips[Math.min(index, state.root.trips.length - 1)]; state.selectedDayId = state.trip.days[0]?.id;
  setUndoDelete({ type: "trip", index, item: removed, label: removed.title }); saveTrip(); render();
}

function addDay() {
  if (state.editModal?.type === "trip" && state.tripEditDraft) {
    syncTripDraftFromForm();
    const day = makeBlankDay(); state.tripEditDraft.days.push(day); state.expandedOverviewDayId = day.id; scheduleTripEditDraftSave(); render(); return;
  }
  const day = makeBlankDay(); state.trip.days.push(day); state.selectedDayId = day.id; saveTrip(); render();
}

function deleteDay(id) {
  const draftMode = state.editModal?.type === "trip" && state.tripEditDraft;
  if (draftMode) syncTripDraftFromForm();
  const days = draftMode ? state.tripEditDraft.days : state.trip.days;
  const index = days.findIndex((entry) => String(entry.id) === String(id));
  if (index === -1) return;
  const day = days[index];
  const counts = { 行程: day.timeline.length, 航班: day.flights.length, 網址: day.references.length, 住宿: day.lodgings.length, 餐飲: day.dining.length };
  const detail = Object.entries(counts).map(([label, count]) => `${label} ${count} 筆`).join("、");
  if (!confirm(`確定刪除此日期？關聯資料：${detail}。`)) return;
  days.splice(index, 1); setUndoDelete({ type: draftMode ? "day-draft" : "day", tripId: state.trip.id, index, item: day, label: day.title || "日期" });
  if (!days.length) days.push(makeBlankDay());
  if (draftMode) { state.expandedOverviewDayId = null; scheduleTripEditDraftSave(); render(); return; }
  state.selectedDayId = days[Math.min(index, days.length - 1)].id; saveTrip(); render();
}

function toggleOverviewDay(id) {
  const modalBody = document.querySelector('#edit-modal-form[data-edit-type="trip"] .modal-body');
  state.tripEditScrollTop = modalBody?.scrollTop || 0;
  syncTripDraftFromForm();
  const day = state.tripEditDraft?.days.find((entry) => String(entry.id) === String(id));
  if (!day) { showTripDayEditError("找不到這筆日期資料，請關閉後重新開啟旅行編輯。"); return; }
  state.expandedOverviewDayId = String(state.expandedOverviewDayId) === String(day.id) ? null : day.id;
  scheduleTripEditDraftSave();
  render();
  requestAnimationFrame(() => {
    const nextBody = document.querySelector('#edit-modal-form[data-edit-type="trip"] .modal-body');
    if (nextBody) nextBody.scrollTop = state.tripEditScrollTop;
    if (state.expandedOverviewDayId !== null) {
      const expanded = [...document.querySelectorAll("[data-overview-day-id]")].find((row) => String(row.dataset.overviewDayId) === String(day.id));
      expanded?.scrollIntoView({ block: "nearest" });
    }
  });
}

function handleTripDayEditClick(event) {
  const button = event.target.closest?.("[data-edit-trip-day]");
  if (!button || !event.currentTarget.contains(button)) return;
  event.preventDefault();
  toggleOverviewDay(button.dataset.editTripDay);
}

function isTripEditing() {
  return state.editModal?.type === "trip" && Boolean(state.tripEditDraft);
}

function updateTripDraftField(dayId, field, value) {
  const day = state.tripEditDraft?.days.find((item) => String(item.id) === String(dayId));
  if (!day) { showTripDayEditError("找不到這筆行程，請重新開啟編輯視窗。"); return false; }
  day[field] = value;
  return true;
}

function handleTripEditorInput(event) {
  const editor = event.target.closest?.('#edit-modal-form[data-edit-type="trip"]');
  if (!editor || !state.tripEditDraft) return;
  const tripField = event.target.closest?.("[data-trip-field]");
  const dayField = event.target.closest?.("[data-trip-day-field]");
  if (tripField) state.tripEditDraft[tripField.dataset.tripField] = tripField.value;
  if (dayField && updateTripDraftField(dayField.dataset.dayId, dayField.dataset.tripDayField, dayField.value) && dayField.dataset.tripDayField === "date" && !state.tripEditComposing) {
    const weekday = dayField.closest("label")?.querySelector("[data-date-weekday]");
    if (weekday) weekday.textContent = formatTripWeekday(dayField.value);
  }
  if (!state.tripEditComposing) scheduleTripEditDraftSave();
}

function handleTripEditorCompositionStart(event) {
  if (event.target.closest?.('#edit-modal-form[data-edit-type="trip"]')) state.tripEditComposing = true;
}

function handleTripEditorCompositionEnd(event) {
  if (!event.target.closest?.('#edit-modal-form[data-edit-type="trip"]')) return;
  state.tripEditComposing = false;
  handleTripEditorInput(event);
  scheduleTripEditDraftSave();
}

function handleTripEditorMovement(event) {
  const button = event.target.closest?.("[data-move-overview-day]");
  if (!button || !event.currentTarget.contains(button)) return;
  event.preventDefault();
  event.stopPropagation();
  if (button.disabled) return;
  moveOverviewDay(button.dataset.moveOverviewDay, button.dataset.direction);
}

function showTripDayEditError(message) {
  const target = document.querySelector(".trip-day-edit-error");
  if (target) { target.hidden = false; target.textContent = message; }
  else alert(message);
}

function moveOverviewDay(id, direction) {
  const days = state.tripEditDraft?.days;
  if (!days) return;
  const from = days.findIndex((day) => String(day.id) === String(id));
  if (from === -1) { showTripDayEditError("找不到這筆行程，請重新開啟編輯視窗。"); return false; }
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= days.length) return false;
  const modalBody = document.querySelector('#edit-modal-form[data-edit-type="trip"] .modal-body');
  state.tripEditScrollTop = modalBody?.scrollTop ?? state.tripEditScrollTop;
  const [day] = days.splice(from, 1);
  days.splice(to, 0, day);
  scheduleTripEditDraftSave();
  render();
  requestAnimationFrame(() => {
    const nextBody = document.querySelector('#edit-modal-form[data-edit-type="trip"] .modal-body');
    if (nextBody) nextBody.scrollTop = state.tripEditScrollTop;
    const moved = [...document.querySelectorAll("[data-overview-day-id]")].find((row) => String(row.dataset.overviewDayId) === String(day.id));
    moved?.scrollIntoView({ block: "nearest" });
  });
  return true;
}

function sortOverviewDaysByDate() {
  syncTripDraftFromForm();
  if (!state.tripEditDraft) return;
  state.tripEditDraft.days = stableSortDaysByDate(state.tripEditDraft.days);
  scheduleTripEditDraftSave();
  render();
}

function stableSortDaysByDate(days) {
  return days.map((day, order) => ({ day, order })).sort((a, b) => {
    if (!a.day.date && !b.day.date) return a.order - b.order;
    if (!a.day.date) return 1;
    if (!b.day.date) return -1;
    return a.day.date.localeCompare(b.day.date) || a.order - b.order;
  }).map(({ day }) => day);
}

function bindOverviewDragHandles() {
  document.querySelectorAll("[data-drag-overview-day]").forEach((handle) => {
    let timer = null; let autoScrollTimer = null; let autoScrollDirection = 0; let active = false; let pointerId = null; let startX = 0; let startY = 0;
    const stopAutoScroll = () => { clearInterval(autoScrollTimer); autoScrollTimer = null; autoScrollDirection = 0; };
    const stop = () => { clearTimeout(timer); timer = null; stopAutoScroll(); };
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      pointerId = event.pointerId; startX = event.clientX; startY = event.clientY;
      timer = setTimeout(() => { active = true; handle.setPointerCapture?.(pointerId); handle.closest(".overview-accordion")?.classList.add("dragging"); }, event.pointerType === "touch" ? 320 : 0);
    });
    handle.addEventListener("pointermove", (event) => {
      if (!active && Math.hypot(event.clientX - startX, event.clientY - startY) > 8) { stop(); return; }
      if (!active || event.pointerId !== pointerId || !state.tripEditDraft) return;
      event.preventDefault();
      const scrollContainer = handle.closest(".modal-body");
      const bounds = scrollContainer?.getBoundingClientRect?.() || { top: 0, bottom: window.visualViewport?.height || window.innerHeight };
      const scrollDirection = event.clientY < bounds.top + 72 ? -1 : event.clientY > bounds.bottom - 72 ? 1 : 0;
      if (!scrollDirection) stopAutoScroll();
      else if (!autoScrollTimer || autoScrollDirection !== scrollDirection) { stopAutoScroll(); autoScrollDirection = scrollDirection; autoScrollTimer = setInterval(() => (scrollContainer || window).scrollBy(0, autoScrollDirection * 12), 32); }
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-overview-day-id]");
      const sourceId = handle.dataset.dragOverviewDay; const targetId = target?.dataset.overviewDayId;
      if (!targetId || targetId === sourceId) return;
      const days = state.tripEditDraft.days; const from = days.findIndex((day) => day.id === sourceId); const to = days.findIndex((day) => day.id === targetId);
      if (from < 0 || to < 0) return;
      const [day] = days.splice(from, 1); days.splice(to, 0, day);
      const source = [...document.querySelectorAll("[data-overview-day-id]")].find((row) => String(row.dataset.overviewDayId) === String(sourceId));
      if (source && target.parentNode) target.parentNode.insertBefore(source, from < to ? target.nextSibling : target);
      document.querySelectorAll("[data-overview-day-id]").forEach((row, index) => { const label = row.querySelector(".overview-summary-copy b"); if (label) label.textContent = `D${index + 1}`; });
    });
    const finish = (event) => { stop(); if (active) { event.preventDefault(); active = false; handle.closest(".overview-accordion")?.classList.remove("dragging"); scheduleTripEditDraftSave(); render(); } };
    handle.addEventListener("pointerup", finish); handle.addEventListener("pointercancel", finish); handle.addEventListener("lostpointercapture", finish);
  });
}

function syncTripDraftFromForm() {
  if (!state.tripEditDraft) return;
  const form = document.querySelector('#edit-modal-form[data-edit-type="trip"]');
  if (!form) return;
  const editFields = [...form.querySelectorAll("[data-edit-field]")];
  const value = (key) => editFields.find((field) => field.dataset.editField === key)?.value;
  state.tripEditDraft.title = value("title") ?? state.tripEditDraft.title;
  state.tripEditDraft.startDate = value("startDate") ?? state.tripEditDraft.startDate;
  state.tripEditDraft.endDate = value("endDate") ?? state.tripEditDraft.endDate;
  state.tripEditDraft.notice = value("notice") ?? state.tripEditDraft.notice;
  state.tripEditDraft.days.forEach((day) => {
    ["date", "area", "title", "transportTip", "luggageTip"].forEach((field) => { const next = value(`day.${day.id}.${field}`); if (next !== undefined) day[field] = next; });
  });
}

function saveTripEditDraft(values) {
  if (!state.tripEditDraft) return false;
  Object.entries(values).forEach(([key, value]) => {
    if (["title", "startDate", "endDate", "notice"].includes(key)) state.tripEditDraft[key] = value;
    const match = key.match(/^day\.(.+)\.(date|area|title|transportTip|luggageTip)$/);
    if (match) { const day = state.tripEditDraft.days.find((entry) => String(entry.id) === match[1]); if (day) day[match[2]] = value; }
  });
  const dated = state.tripEditDraft.days.filter((day) => day.date);
  if (dated.some((day) => !/^\d{4}-\d{2}-\d{2}$/.test(day.date))) { alert("日期請使用 YYYY-MM-DD 格式。"); return false; }
  if (new Set(dated.map((day) => day.date)).size !== dated.length) { alert("日期不可重複。"); return false; }
  state.trip.title = state.tripEditDraft.title || "未命名旅行"; state.trip.startDate = state.tripEditDraft.startDate; state.trip.endDate = state.tripEditDraft.endDate; state.trip.notice = state.tripEditDraft.notice; state.trip.days = state.tripEditDraft.days;
  if (!state.trip.days.some((day) => day.id === state.selectedDayId)) state.selectedDayId = state.trip.days[0]?.id;
  return true;
}

function startNewCollection(type) {
  const item = type === "lodging" ? { id: createId(), name: "", address: "", checkIn: "", checkOut: "", phone: "", bookingReference: "", url: "", description: "", previewImageUrl: "", note: "" } : { id: createId(), name: "", category: "", address: "", reservationTime: "", phone: "", url: "", description: "", previewImageUrl: "", note: "" };
  (type === "lodging" ? getSelectedDay().lodgings : getSelectedDay().dining).push(item); state.editModal = { type, id: item.id, isNew: true }; render();
}

function deleteCollection(type, id) {
  const list = type === "lodging" ? getSelectedDay().lodgings : getSelectedDay().dining;
  const index = list.findIndex((item) => item.id === id); if (index === -1 || !confirm("確定刪除此資料？")) return;
  const [item] = list.splice(index, 1); setUndoDelete({ type, dayId: getSelectedDay().id, index, item, label: item.name || (type === "lodging" ? "住宿" : "餐飲") }); state.openMenuId = null; saveTrip(); render();
}

function findTimelineItem(id) {
  const day = getSelectedDay();
  return day.timeline.find((item) => item.id === id);
}

function updateTimelineField(field) {
  const item = findTimelineItem(field.dataset.timelineId);
  if (!item) return;
  const value = field.isContentEditable ? field.textContent.trim() : field.value.trim();
  setTimelineField(item, field.dataset.timelineField, value);
  saveTrip();
  if (["time", "title", "address"].includes(field.dataset.timelineField) || field.dataset.timelineField.startsWith("transport.")) {
    updateTimelineDerivedUi(item.id);
  }
}

function setTimelineField(item, field, value) {
  if (field === "transport.mode") item.transport.mode = value;
  else if (field === "transport.durationMinutes") item.transport.durationMinutes = normalizeDuration(value);
  else item[field] = value;
}

function addTimelineItem() {
  const titleInput = document.querySelector("#new-timeline-title");
  const title = titleInput.value.trim();
  if (!title) return;
  getSelectedDay().timeline.push(
    makeTimelineItem({
      time: document.querySelector("#new-timeline-time").value.trim() || "未定",
      title,
      address: document.querySelector("#new-timeline-address").value.trim(),
      note: document.querySelector("#new-timeline-note").value.trim(),
      transport: {
        mode: document.querySelector("#new-timeline-mode").value,
        durationMinutes: normalizeDuration(document.querySelector("#new-timeline-duration").value),
        suggestion: document.querySelector("#new-timeline-suggestion").value.trim(),
      },
    })
  );
  saveTrip();
  render();
}

function insertTimelineAbove(id) {
  const day = getSelectedDay();
  const index = day.timeline.findIndex((item) => item.id === id);
  if (index === -1) return;
  const item = makeTimelineItem({ time: "", title: "新行程" });
  day.timeline.splice(index, 0, item);
  state.addFor = null;
  state.openMenuId = null;
  state.focusTimelineId = item.id;
  saveTrip();
  render();
}

function deleteTimelineItem(id) {
  const day = getSelectedDay();
  const index = day.timeline.findIndex((item) => item.id === id);
  if (index === -1) return;
  const flights = day.flights.filter((entry) => entry.timelineItemId === id);
  const references = day.references.filter((entry) => entry.timelineItemId === id);
  if (!confirm(`確定刪除此行程？將一併刪除 ${flights.length} 筆航班及 ${references.length} 筆網址。`)) return;
  const [item] = day.timeline.splice(index, 1);
  day.flights = day.flights.filter((entry) => entry.timelineItemId !== id);
  day.references = day.references.filter((entry) => entry.timelineItemId !== id);
  state.addFor = null;
  setUndoDelete({
    type: "timeline",
    dayId: day.id,
    index,
    item,
    flights,
    references,
    label: item.title || "未命名行程",
  });
  state.openMenuId = null;
  saveTrip();
  render();
}

function cancelAttachedAdd() {
  state.addFor = null;
  render();
}

function beginTripEdit(saved = null) {
  state.tripEditDraft = saved ? structuredClone(saved.draft) : makeTripEditDraft(state.trip);
  state.expandedOverviewDayId = saved?.expandedTripDayId ?? null;
  state.tripEditScrollTop = Number(saved?.scrollTop) || 0;
  state.tripEditBaseRevision = saved?.baseRevision ?? state.syncSettings?.revision ?? null;
  state.editModal = { type: "trip", id: state.trip.id };
  state.tripDraftDialog = null;
  render();
  requestAnimationFrame(() => { const body = document.querySelector('#edit-modal-form[data-edit-type="trip"] .modal-body'); if (body) body.scrollTop = state.tripEditScrollTop; });
}

function openEditModal(type, id) {
  if (type === "trip") {
    const saved = getStoredTripEditDraft(state.trip.id);
    state.openMenuId = null;
    if (saved?.draft) { state.tripDraftDialog = { type: "restore", tripId: state.trip.id, saved }; render(); return; }
    beginTripEdit(); return;
  }
  state.editModal = { type, id };
  state.openMenuId = null;
  render();
}

function cancelEditModal() {
  if (isTripEditing()) {
    flushTripEditDraft();
    state.tripDraftDialog = { type: "cancel", tripId: state.trip.id };
    render();
    return;
  }
  if (state.editModal?.isNew && ["lodging", "dining"].includes(state.editModal.type)) {
    const list = state.editModal.type === "lodging" ? getSelectedDay().lodgings : getSelectedDay().dining;
    const index = list.findIndex((item) => item.id === state.editModal.id);
    if (index !== -1) list.splice(index, 1);
  }
  state.editModal = null;
  state.tripEditDraft = null;
  state.expandedOverviewDayId = null;
  state.tripEditScrollTop = 0;
  state.tripEditComposing = false;
  state.tripEditBaseRevision = null;
  releasePendingRemoteUpdate();
  render();
}

function closeTripEditor() {
  clearTimeout(tripDraftSaveTimer); tripDraftSaveTimer = null;
  state.editModal = null;
  state.tripEditDraft = null;
  state.expandedOverviewDayId = null;
  state.tripEditScrollTop = 0;
  state.tripEditComposing = false;
  state.tripEditBaseRevision = null;
  state.tripDraftDialog = null;
  releasePendingRemoteUpdate();
  render();
}

function handleTripDraftChoice(event) {
  const button = event.target.closest?.("[data-trip-draft-choice]");
  if (!button || !event.currentTarget.contains(button)) return;
  event.preventDefault(); event.stopPropagation();
  const dialog = state.tripDraftDialog;
  if (!dialog) return;
  const choice = button.dataset.tripDraftChoice;
  if (choice === "continue-restore") { beginTripEdit(dialog.saved); return; }
  if (choice === "discard-restore") { deleteStoredTripEditDraft(dialog.tripId); beginTripEdit(); return; }
  if (choice === "cancel-restore") { state.tripDraftDialog = null; render(); return; }
  if (choice === "keep-and-leave") { flushTripEditDraft(); closeTripEditor(); return; }
  if (choice === "discard-and-leave") { deleteStoredTripEditDraft(dialog.tripId); closeTripEditor(); return; }
  if (choice === "continue-editing") {
    state.tripDraftDialog = null; render();
    requestAnimationFrame(() => { const body = document.querySelector('#edit-modal-form[data-edit-type="trip"] .modal-body'); if (body) body.scrollTop = state.tripEditScrollTop; });
  }
}

function saveEditModal(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = {};
  let saved;
  const formalTripBeforeSave = form.dataset.editType === "trip" ? structuredClone(state.trip) : null;
  const remoteRootBeforeSave = form.dataset.editType === "trip" ? structuredClone(state.root) : null;
  const draftBaseRevision = state.tripEditBaseRevision;
  if (form.dataset.editType === "trip") {
    syncTripDraftFromForm();
    flushTripEditDraft();
    saved = saveTripEditDraft({});
  } else {
    form.querySelectorAll("[data-edit-field]").forEach((field) => { values[field.dataset.editField] = field.value.trim(); });
    saved = applyEditValues(form.dataset.editType, form.dataset.editId, values);
  }
  if (saved) {
    const savedTripId = form.dataset.editType === "trip" ? state.trip.id : null;
    try { saveTrip(); }
    catch {
      if (formalTripBeforeSave) {
        const index = state.root.trips.findIndex((trip) => String(trip.id) === String(formalTripBeforeSave.id));
        if (index !== -1) state.root.trips[index] = formalTripBeforeSave;
        state.trip = formalTripBeforeSave;
      }
      alert("儲存失敗，已保留行程編輯草稿，請稍後再試。"); return;
    }
    state.editModal = null;
    state.tripEditDraft = null;
    state.expandedOverviewDayId = null;
    state.tripEditScrollTop = 0;
    state.tripEditBaseRevision = null;
    if (savedTripId !== null) deleteStoredTripEditDraft(savedTripId);
    if (savedTripId !== null && draftBaseRevision !== null && state.syncSettings?.revision > draftBaseRevision) {
      clearTimeout(syncUploadTimer); syncUploadTimer = null;
      state.syncConflict = { remoteRevision: state.syncSettings.revision, remotePayload: remoteRootBeforeSave, updatedAt: state.syncSettings.lastSyncedAt };
      state.syncStatus = "conflict";
      state.syncDirty = true;
    }
    releasePendingRemoteUpdate();
    render();
  }
}

function applyEditValues(type, id, values) {
  const day = getSelectedDay();
  const item = type === "trip" || type === "notice" ? state.trip : type === "timeline" ? day.timeline.find((entry) => entry.id === id) : type === "flight" ? day.flights.find((entry) => entry.id === id) : type === "reference" ? day.references.find((entry) => entry.id === id) : type === "lodging" ? day.lodgings.find((entry) => entry.id === id) : day.dining.find((entry) => entry.id === id);
  if (!item) return false;
  const urlFields = type === "flight" ? ["websiteUrl"] : ["reference", "lodging", "dining"].includes(type) ? ["url", "previewImageUrl"] : [];
  if (urlFields.some((field) => values[field] && !isHttpUrl(values[field]))) { alert("網址僅允許 http:// 或 https:// 開頭。"); return false; }
  if (type === "trip") {
    item.title = values.title || "未命名旅行"; item.startDate = values.startDate || ""; item.endDate = values.endDate || ""; item.notice = values.notice || "";
    item.days.forEach((entry) => { entry.date = values[`day.${entry.id}.date`] ?? entry.date; entry.title = values[`day.${entry.id}.title`] ?? entry.title; entry.area = values[`day.${entry.id}.area`] ?? entry.area; entry.transportTip = values[`day.${entry.id}.transportTip`] ?? entry.transportTip; entry.luggageTip = values[`day.${entry.id}.luggageTip`] ?? entry.luggageTip; });
  } else if (type === "notice") {
    item.notice = values.notice || "";
  } else if (type === "timeline") {
    item.time = values.time || "";
    item.title = values.title || "";
    item.address = values.address || "";
    item.note = values.note || "";
    item.transport = { mode: values["transport.mode"] || "", durationMinutes: normalizeDuration(values["transport.durationMinutes"]), suggestion: values["transport.suggestion"] || "" };
  } else {
    Object.keys(values).forEach((field) => { item[field] = field === "timelineItemId" ? (values[field] || null) : values[field]; });
  }
  return true;
}

function setUndoDelete(payload) {
  if (state.undoDelete?.timer) clearTimeout(state.undoDelete.timer);
  state.undoDelete = {
    ...payload,
    timer: setTimeout(() => {
      state.undoDelete = null;
      document.querySelector(".undo-toast")?.remove();
    }, 5000),
  };
}

function commitActiveEdit() {
  const active = document.activeElement;
  if (!active?.matches?.("[data-timeline-field], [data-flight-field], [data-reference-field], #exchange-amount, #fixed-rate")) return;
  if (active.matches("[data-timeline-field]")) updateTimelineField(active);
  if (active.matches("[data-flight-field]")) updateFlightField(active);
  if (active.matches("[data-reference-field]")) updateReferenceField(active);
  if (active.id === "exchange-amount") updateExchangeAmount(active.value, false);
  if (active.id === "fixed-rate") updateFixedRate(active.value, true);
}

function updateTimelineDerivedUi(id) {
  const day = getSelectedDay();
  const index = day.timeline.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  [index, index + 1].forEach((itemIndex) => {
    const item = day.timeline[itemIndex];
    if (!item) return;
    const row = document.querySelector(`[data-row-id="${cssEscape(item.id)}"]`);
    if (!row) return;
    const summary = row.querySelector("[data-transport-summary]");
    if (summary) summary.textContent = renderTransportSummary(item);
    const actions = row.querySelector("[data-map-actions]");
    if (actions) actions.innerHTML = renderMapActions(item, day.timeline[itemIndex - 1]);
  });
}

function updateFlightField(field) {
  const flight = getSelectedDay().flights.find((item) => item.id === field.dataset.flightId);
  if (!flight) return;
  if (field.dataset.flightField === "websiteUrl" && field.value.trim() && !isHttpUrl(field.value.trim())) {
    alert("網址僅允許 http:// 或 https:// 開頭。");
    field.value = flight.websiteUrl;
    return;
  }
  flight[field.dataset.flightField] = field.dataset.flightField === "timelineItemId" ? (field.value || null) : field.value.trim();
  saveTrip();
  if (field.dataset.flightField === "timelineItemId") { field.blur(); render(); }
}

function updateReferenceField(field) {
  const reference = getSelectedDay().references.find((item) => item.id === field.dataset.referenceId);
  if (!reference) return;
  if (["url", "previewImageUrl"].includes(field.dataset.referenceField) && field.value.trim() && !isHttpUrl(field.value.trim())) {
    alert("網址僅允許 http:// 或 https:// 開頭。");
    field.value = reference.url;
    return;
  }
  reference[field.dataset.referenceField] = field.dataset.referenceField === "timelineItemId" ? (field.value || null) : field.value.trim();
  saveTrip();
  if (field.dataset.referenceField === "timelineItemId") { field.blur(); render(); }
}

function addFlight() {
  const websiteUrl = document.querySelector("#new-flight-url").value.trim();
  if (websiteUrl && !isHttpUrl(websiteUrl)) { alert("網址僅允許 http:// 或 https:// 開頭。"); return; }
  getSelectedDay().flights.push(
    makeFlight({
      timelineItemId: state.addFor?.timelineItemId ?? null,
      airline: document.querySelector("#new-flight-airline").value.trim(),
      flightNumber: document.querySelector("#new-flight-number").value.trim(),
      departureAirport: document.querySelector("#new-flight-departure").value.trim(),
      departureCode: document.querySelector("#new-flight-departure-code").value.trim(),
      departureTerminal: document.querySelector("#new-flight-departure-terminal").value.trim(),
      arrivalAirport: document.querySelector("#new-flight-arrival").value.trim(),
      arrivalCode: document.querySelector("#new-flight-arrival-code").value.trim(),
      arrivalTerminal: document.querySelector("#new-flight-arrival-terminal").value.trim(),
      departureTime: document.querySelector("#new-flight-departure-time").value.trim(),
      arrivalTime: document.querySelector("#new-flight-arrival-time").value.trim(),
      bookingReference: document.querySelector("#new-flight-booking").value.trim(),
      status: document.querySelector("#new-flight-status").value.trim(),
      websiteUrl,
      note: document.querySelector("#new-flight-note").value.trim(),
    })
  );
  saveTrip();
  state.addFor = null;
  render();
}

function addReference() {
  const url = document.querySelector("#new-reference-url").value.trim();
  const previewImageUrl = document.querySelector("#new-reference-image").value.trim();
  if (url && !isHttpUrl(url)) { alert("網址僅允許 http:// 或 https:// 開頭。"); return; }
  if (previewImageUrl && !isHttpUrl(previewImageUrl)) { alert("圖片網址僅允許 http:// 或 https:// 開頭。"); return; }
  getSelectedDay().references.push(
    makeReference({
      timelineItemId: state.addFor?.timelineItemId ?? null,
      name: document.querySelector("#new-reference-name").value.trim(),
      url,
      description: document.querySelector("#new-reference-description").value.trim(),
      siteName: document.querySelector("#new-reference-site-name").value.trim(),
      previewImageUrl,
      note: document.querySelector("#new-reference-note").value.trim(),
    })
  );
  saveTrip();
  state.addFor = null;
  render();
}

function deleteFlight(id) {
  const day = getSelectedDay();
  const index = day.flights.findIndex((item) => item.id === id);
  if (index === -1 || !confirm("確定刪除此航班？")) return;
  const [item] = day.flights.splice(index, 1);
  setUndoDelete({ type: "flight", dayId: day.id, index, item, label: item.flightNumber || item.airline || "航班" });
  state.openMenuId = null;
  saveTrip();
  render();
}

function deleteReference(id) {
  const day = getSelectedDay();
  const index = day.references.findIndex((item) => item.id === id);
  if (index === -1 || !confirm("確定刪除此參考網址？")) return;
  const [item] = day.references.splice(index, 1);
  setUndoDelete({ type: "reference", dayId: day.id, index, item, label: item.name || "參考網址" });
  state.openMenuId = null;
  saveTrip();
  render();
}

function findPackingItem(id) {
  for (const group of state.trip.packing) {
    const index = group.items.findIndex((item) => String(item.id) === String(id));
    if (index !== -1) return { group, index, item: group.items[index] };
  }
  return null;
}

function packingGroupIdentity(group, index) {
  return group.id ?? index;
}

function findPackingGroup(targetId) {
  const index = state.trip.packing.findIndex((group, groupIndex) => String(packingGroupIdentity(group, groupIndex)) === String(targetId));
  return index === -1 ? null : { group: state.trip.packing[index], index };
}

function validPackingGroupName(name, exceptIndex = -1) {
  const trimmed = String(name || "").trim();
  if (!trimmed) { alert("項目欄名稱不得為空。"); return ""; }
  if (state.trip.packing.some((group, index) => index !== exceptIndex && group.category === trimmed)) { alert("已有相同名稱的項目欄。"); return ""; }
  return trimmed;
}

function finishPackingChange() {
  state.packingDialog = null;
  state.openMenuId = null;
  saveTrip();
  render();
}

function addPackingGroup(name) {
  const category = validPackingGroupName(name);
  if (!category) return false;
  const group = { id: createId(), category, items: [] };
  state.trip.packing.push(group);
  finishPackingChange();
  return group;
}

function deletePackingGroup(targetId) {
  const found = findPackingGroup(targetId);
  if (!found) { alert("找不到這個打包項目欄，請重新開啟。"); return false; }
  if (!confirm(`確定刪除「${found.group.category}」嗎？\n此項目欄中的所有子項目也會一併刪除。`)) return false;
  state.trip.packing.splice(found.index, 1);
  finishPackingChange();
  return true;
}

function addPackingChild(categoryId, name) {
  const found = findPackingGroup(categoryId);
  if (!found) { alert("找不到這個打包項目欄，請重新開啟。"); return false; }
  const trimmed = String(name || "").trim();
  if (!trimmed) { alert("子項目名稱不得為空。"); return false; }
  const item = { id: createId(), name: trimmed, done: false };
  found.group.items.push(item);
  finishPackingChange();
  return item;
}

function deletePackingChild(categoryId, itemId) {
  const found = findPackingGroup(categoryId);
  if (!found) { alert("找不到這個打包項目欄，請重新開啟。"); return false; }
  const index = found.group.items.findIndex((item) => String(item.id) === String(itemId));
  if (index === -1) { alert("找不到這筆打包項目，請重新開啟。"); return false; }
  const item = found.group.items[index];
  if (!confirm(`確定刪除「${item.name}」嗎？`)) return false;
  found.group.items.splice(index, 1);
  finishPackingChange();
  return true;
}

function renamePackingGroup(categoryId, name) {
  const found = findPackingGroup(categoryId);
  if (!found) { alert("找不到這個打包項目欄，請重新開啟。"); return false; }
  const category = validPackingGroupName(name, found.index);
  if (!category) return false;
  if (category === found.group.category) { state.packingDialog = null; render(); return true; }
  found.group.category = category;
  finishPackingChange();
  return true;
}

function deletePackingItem(id) {
  const found = findPackingItem(id);
  if (!found) { alert("找不到這筆打包項目，請重新開啟明細。"); return false; }
  if (!confirm(`確定刪除『${found.item.name || "打包項目"}』嗎？`)) return false;
  const [item] = found.group.items.splice(found.index, 1);
  setUndoDelete({ type: "packing", category: found.group.category, index: found.index, item, label: item.name || "打包項目" });
  state.openMenuId = null;
  saveTrip();
  render();
  return true;
}

function restoreDeletedTimelineItem() {
  if (!state.undoDelete) return;
  const draftOnly = state.undoDelete.type === "day-draft";
  if (state.undoDelete.type === "timeline") {
    const day = state.trip.days.find((item) => item.id === state.undoDelete.dayId);
    if (day) { day.timeline.splice(state.undoDelete.index, 0, state.undoDelete.item); day.flights.push(...state.undoDelete.flights); day.references.push(...state.undoDelete.references); }
  }
  if (state.undoDelete.type === "flight") {
    const day = state.trip.days.find((item) => item.id === state.undoDelete.dayId);
    if (day) day.flights.splice(state.undoDelete.index, 0, state.undoDelete.item);
  }
  if (state.undoDelete.type === "reference") {
    const day = state.trip.days.find((item) => item.id === state.undoDelete.dayId);
    if (day) day.references.splice(state.undoDelete.index, 0, state.undoDelete.item);
  }
  if (state.undoDelete.type === "packing") {
    const group = state.trip.packing.find((item) => item.category === state.undoDelete.category);
    if (group) group.items.splice(state.undoDelete.index, 0, state.undoDelete.item);
  }
  if (state.undoDelete.type === "booking") state.trip.bookings.splice(state.undoDelete.index, 0, state.undoDelete.item);
  if (state.undoDelete.type === "day") {
    const trip = state.root.trips.find((entry) => entry.id === state.undoDelete.tripId);
    if (trip) { trip.days.splice(state.undoDelete.index, 0, state.undoDelete.item); state.trip = trip; state.selectedDayId = state.undoDelete.item.id; }
  }
  if (draftOnly && state.tripEditDraft) {
    state.tripEditDraft.days.splice(state.undoDelete.index, 0, state.undoDelete.item);
    state.expandedOverviewDayId = state.undoDelete.item.id;
  }
  if (["lodging", "dining"].includes(state.undoDelete.type)) {
    const day = state.trip.days.find((entry) => entry.id === state.undoDelete.dayId);
    if (day) (state.undoDelete.type === "lodging" ? day.lodgings : day.dining).splice(state.undoDelete.index, 0, state.undoDelete.item);
  }
  if (state.undoDelete.type === "trip") {
    state.root.trips.splice(state.undoDelete.index, 0, state.undoDelete.item); state.trip = state.undoDelete.item; state.selectedDayId = state.trip.days[0]?.id;
  }
  clearTimeout(state.undoDelete.timer);
  state.undoDelete = null;
  if (!draftOnly) saveTrip();
  render();
}

function addCustomPackingItem() {
  const input = document.querySelector("#new-pack-item");
  const value = input.value.trim();
  if (!value) return;
  let custom = state.trip.packing.find((group) => group.category === "自定義");
  if (!custom) {
    custom = { category: "自定義", items: [] };
    state.trip.packing.push(custom);
  }
  custom.items.push(makePackingItem(value));
  saveTrip();
  render();
}

function addCurrency() {
  const exchange = state.trip.toolbox.exchange;
  const currency = sanitizeCurrency(document.querySelector("#new-currency-code").value);
  const rate = parsePositiveNumber(document.querySelector("#new-currency-rate").value);
  if (!currency || !rate) return;
  exchange.rates[currency] = rate;
  exchange.selectedCurrency = currency;
  saveTrip();
  render();
}

function updateExchangeAmount(value, shouldFormat) {
  const exchange = state.trip.toolbox.exchange;
  exchange.amount = sanitizeAmount(value);
  if (shouldFormat) saveTrip();
}

function updateFixedRate(value, shouldTimestamp) {
  const exchange = state.trip.toolbox.exchange;
  const rate = parsePositiveNumber(value);
  if (!rate) return false;
  exchange.rates[exchange.selectedCurrency] = rate;
  if (shouldTimestamp) exchange.lastModifiedAt = new Date().toISOString();
  if (shouldTimestamp) saveTrip();
  return true;
}

function updateExchangeResult() {
  const exchange = state.trip.toolbox.exchange;
  const resultInput = document.querySelector("#exchange-result");
  if (!resultInput) return;
  const rate = exchange.rates[exchange.selectedCurrency] || 0.215;
  const result = calculateExchange(parseDisplayNumber(exchange.amount), rate, exchange.direction);
  resultInput.value = `${result.display} ${result.currency}`;
}

function inputCurrency() {
  const exchange = state.trip.toolbox.exchange;
  return exchange.direction === "foreign-to-base" ? exchange.selectedCurrency : exchange.baseCurrency;
}

function buildMapSearchUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function buildDirectionsUrl(origin, destination, mode = "transit") {
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: googleTravelMode(mode),
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function googleTravelMode(mode) {
  if (mode === "walk") return "walking";
  if (mode === "bicycle") return "bicycling";
  if (mode === "drive" || mode === "taxi") return "driving";
  return "transit";
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getTransportMode(value) {
  return transportModes.find((mode) => mode.value === value) || transportModes[0];
}

function sanitizeCurrency(value) {
  const currency = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3,6}$/.test(currency) ? currency : "";
}

function sanitizeAmount(value) {
  const number = parseDisplayNumber(value);
  return Number.isFinite(number) && number >= 0 ? String(number) : "0";
}

function parseDisplayNumber(value) {
  const normalized = String(value || "").replaceAll(",", "").trim();
  if (!/^\d*(\.\d*)?$/.test(normalized)) return 0;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function parsePositiveNumber(value) {
  const number = parseDisplayNumber(value);
  return number > 0 ? number : null;
}

function calculateExchange(amount, rate, direction) {
  const safeRate = rate > 0 ? rate : 1;
  const value = direction === "foreign-to-base" ? amount * safeRate : amount / safeRate;
  const currency = direction === "foreign-to-base" ? state.trip.toolbox.exchange.baseCurrency : state.trip.toolbox.exchange.selectedCurrency;
  return { value, currency, display: formatNumber(value, currency) };
}

function formatDisplayNumber(value, currency = "") {
  return formatNumber(parseDisplayNumber(value), currency);
}

function formatPlainNumber(value) {
  return String(value).replace(/\.?0+$/, (match) => (match === "." ? "" : match));
}

function formatNumber(value, currency = "") {
  const digits = currencyDecimalDigits(currency);
  return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: digits });
}

function currencyDecimalDigits(currency) {
  if (currency === "JPY" || currency === "KRW") return 0;
  return 2;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-TW", { hour12: false });
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replaceAll('"', '\\"').replaceAll("\\", "\\\\");
}

function findUnexpectedHorizontalOverflow(root = document, styleReader = (element) => window.getComputedStyle(element)) {
  return [...root.querySelectorAll("*")].filter((element) => {
    if (!element.clientWidth || element.scrollWidth <= element.clientWidth + 1) return false;
    const style = styleReader(element);
    if (["auto", "scroll"].includes(style.overflowX)) return false;
    if (style.textOverflow === "ellipsis") return false;
    return true;
  });
}

function watchServiceWorkerRegistration(registration) {
  serviceWorkerRegistration = registration;
  if (registration.waiting && navigator.serviceWorker.controller) {
    state.pwaUpdateReady = true;
    render();
  }
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        state.pwaUpdateReady = true;
        render();
      }
    });
  });
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").then(watchServiceWorkerRegistration).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (pwaReloadPending) return;
    pwaReloadPending = true;
    globalThis.location?.reload?.();
  });
}

globalThis.addEventListener?.("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

globalThis.addEventListener?.("appinstalled", () => {
  deferredInstallPrompt = null;
  state.installDialogOpen = false;
  render();
});

document.addEventListener("click", (event) => {
  const link = event.target.closest?.('a[target="_blank"]');
  if (link && !event.defaultPrevented) flushTripEditDraft();
}, true);
document.addEventListener("visibilitychange", () => { if (document.hidden) { flushTripEditDraft(); stopSpeech(); } else syncNow(); });
window.addEventListener("focus", syncNow);
window.addEventListener("blur", flushTripEditDraft);
window.addEventListener("online", syncNow);
window.addEventListener("pagehide", () => { flushTripEditDraft(); stopSpeech(); });
window.addEventListener("beforeunload", flushTripEditDraft);
function updateVisualViewportHeight() { if (globalThis.visualViewport && document.documentElement) document.documentElement.style.setProperty("--visual-viewport-height", `${visualViewport.height}px`); }
globalThis.visualViewport?.addEventListener("resize", updateVisualViewportHeight);
updateVisualViewportHeight();

render();
const syncFromUrl = (() => { try { return new URL(location.href).searchParams.get("sync"); } catch { return null; } })();
if (syncFromUrl && !state.syncSettings) { state.syncDialog = "join"; render(); requestAnimationFrame(() => { const field = document.querySelector('#sync-join-form [name="link"]'); if (field) field.value = location.href; }); }
else if (state.syncSettings) syncNow();
globalThis.setInterval?.(() => { if (document.visibilityState === "visible") syncNow(); }, 30000);
