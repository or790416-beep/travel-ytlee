const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const styles = fs.readFileSync("styles.css", "utf8");

const saved = {
  schemaVersion: 3,
  meta: { name: "test", startDate: "", endDate: "", alert: "" },
  days: [{ id: 1, timeline: [{ id: "t1", title: "行程", transport: {} }], flights: [{ id: "f1", flightNumber: "CI" }], references: [{ id: "r1", name: "舊網址", url: "https://example.com" }], food: [] }],
  bookings: [{ item: "舊待辦" }],
  tools: { phrases: [{ zh: "可以幫我寄放行李嗎？", ja: "荷物を預かっていただけますか。" }] },
};
const store = new Map([["fukuoka-hiroshima-trip-v1", JSON.stringify(saved)]]);
let confirmResult = true;
let storageWrites = 0;
const alertMessages = [];
const noopElement = { innerHTML: "", textContent: "", addEventListener() {}, remove() {}, before() {}, focus() {}, scrollIntoView() {}, setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
const context = {
  console,
  URL,
  URLSearchParams,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: (callback) => callback(),
  structuredClone,
  confirm: () => confirmResult,
  alert: (message) => alertMessages.push(message),
  localStorage: { getItem: (key) => store.get(key) || null, setItem: (key, value) => { storageWrites += 1; store.set(key, value); } },
  navigator: {},
  document: { hidden: false, activeElement: null, querySelector: () => noopElement, querySelectorAll: () => [], createElement: () => ({ ...noopElement }), addEventListener() {} },
  window: { addEventListener() {}, open() {} },
  crypto: { randomUUID: () => `uuid-${Math.random()}` },
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(`${fs.readFileSync("app.js", "utf8")}\n;globalThis.__test={state,migrateTrip,normalizeTripEditDay,makeTripEditDraft,isHttpUrl,normalizeBooking,normalizePhrase,deleteTimelineItem,restoreDeletedTimelineItem,deleteBooking,speakJapanese,stopSpeech,cancelAttachedAdd,phraseCategoryLabel,insertTimelineAbove,renderTimelineItem,renderFlight,renderReference,renderEditModal,renderMapActions,renderTools,renderPacking,renderMobileActionSheet,findPackingItem,deletePackingItem,buildDirectionsUrl,transportModes,openEditModal,cancelEditModal,applyEditValues,saveTrip,stableColorIndex,referenceFallbackIcon,addTrip,switchTrip,addDay,deleteDay,toggleOverviewDay,moveOverviewDay,sortOverviewDaysByDate,stableSortDaysByDate,saveTripEditDraft,startNewCollection,deleteCollection,renderCollectionCard,renderDayCollectionEntries,renderDayNotice,renderCollectionPanel,renderTripSelectorDialog,formatClock,getTripWeekday,formatTripWeekday,formatTripDate,findUnexpectedHorizontalOverflow};`, context);
const api = context.__test;

assert.equal(api.state.root.schemaVersion, 6);
assert.equal(api.state.root.trips.length, 1);
assert.equal(api.state.trip.days[0].flights[0].timelineItemId, null);
assert.equal(api.state.trip.days[0].references[0].timelineItemId, null);
assert.equal(api.state.trip.days[0].flights.length, 1);
assert.equal(api.state.trip.days[0].references.length, 1);
assert.ok(api.state.trip.bookings[0].id);
assert.equal(api.state.trip.bookings[0].done, false);
assert.ok(api.state.trip.tools.phrases[0].id);
assert.equal(api.state.trip.tools.phrases[0].category, "hotel");
assert.equal(api.normalizePhrase({ zh: "請給我這個。", ja: "これをください。" }).category, "restaurant");
assert.equal(api.normalizePhrase({ zh: "請給我這個。", ja: "これをください。", category: "shopping" }).category, "restaurant");
assert.equal(api.normalizePhrase({ zh: "未知句子", ja: "不明" }).category, "general");
assert.equal(api.phraseCategoryLabel("restaurant"), "餐廳使用");
assert.equal(api.phraseCategoryLabel("hotel"), "住宿使用");
assert.equal(api.isHttpUrl("https://example.com"), true);
assert.equal(api.isHttpUrl("http://example.com"), true);
assert.equal(api.isHttpUrl("javascript:alert(1)"), false);
assert.equal(api.isHttpUrl("ftp://example.com"), false);
api.state.trip.days[0].flights[0].timelineItemId = "t1";
api.state.trip.days[0].references[0].timelineItemId = "t1";
api.deleteTimelineItem("t1");
assert.equal(api.state.trip.days[0].timeline.length, 0);
assert.equal(api.state.trip.days[0].flights.length, 0);
assert.equal(api.state.trip.days[0].references.length, 0);
api.restoreDeletedTimelineItem();
assert.equal(api.state.trip.days[0].timeline.length, 1);
assert.equal(api.state.trip.days[0].flights.length, 1);
assert.equal(api.state.trip.days[0].references.length, 1);
api.state.addFor = { type: "flight", timelineItemId: "t1" };
api.cancelAttachedAdd();
assert.equal(api.state.addFor, null);
api.state.addFor = { type: "reference", timelineItemId: "t1" };
api.deleteTimelineItem("t1");
assert.equal(api.state.addFor, null);
api.restoreDeletedTimelineItem();
const bookingId = api.state.trip.bookings[0].id;
api.deleteBooking(bookingId);
assert.equal(api.state.trip.bookings.length, 0);
api.restoreDeletedTimelineItem();
assert.equal(api.state.trip.bookings.length, 1);
console.log("PASS schema v3 → v4：舊航班／網址保留且 timelineItemId=null");
console.log("PASS 待辦與常用語遷移：UUID/done/category/id 正常");
console.log("PASS URL 驗證：僅允許 http/https");
console.log("PASS 行程級聯刪除／復原：行程、航班及網址一起處理");
console.log("PASS 待辦二次確認刪除／復原資料流程");
console.log("PASS 常用語預設分類、舊資料 general fallback 與分類名稱");
console.log("PASS 關聯新增表單取消及刪除行程時清除 addFor");

const v4 = api.migrateTrip({ ...saved, schemaVersion: 4, days: [{ ...saved.days[0], flights: [{ id: "old-flight", terminal: "T1" }], references: [{ id: "old-reference", url: "https://example.com" }] }] });
assert.equal(v4.schemaVersion, 6);
assert.equal(v4.trips.length, 1);
assert.equal(v4.trips[0].days[0].flights[0].departureCode, "");
assert.equal(v4.trips[0].days[0].flights[0].departureTerminal, "T1");
assert.equal(v4.trips[0].days[0].flights[0].arrivalCode, "");
assert.equal(v4.trips[0].days[0].flights[0].status, "");
assert.equal(v4.trips[0].days[0].references[0].description, "");
assert.equal(v4.trips[0].days[0].references[0].siteName, "");
assert.equal(v4.trips[0].days[0].references[0].previewImageUrl, "");
const day = api.state.trip.days[0];
const beforeCancel = JSON.stringify(day.timeline[0]);
api.openEditModal("timeline", day.timeline[0].id);
api.cancelEditModal();
assert.equal(JSON.stringify(day.timeline[0]), beforeCancel);
api.state.openMenuId = `timeline:${day.timeline[0].id}`;
const readonlyHtml = api.renderTimelineItem(day.timeline[0], 0, null);
assert.doesNotMatch(readonlyHtml, /contenteditable|data-timeline-field|<select/);
assert.doesNotMatch(readonlyHtml, /<input/);
assert.match(readonlyHtml, /編輯行程/);
assert.match(readonlyHtml, /新增航班資訊/);
assert.match(readonlyHtml, /新增旅遊網址/);
assert.match(readonlyHtml, /color-0/);
const compactReferences = [
  { id: "compact-ref-1", timelineItemId: day.timeline[0].id, name: "網址一", url: "https://example.com/1", description: "", siteName: "", previewImageUrl: "", note: "" },
  { id: "compact-ref-2", timelineItemId: day.timeline[0].id, name: "網址二", url: "https://example.com/2", description: "", siteName: "", previewImageUrl: "", note: "" },
];
day.references.push(...compactReferences);
const compactReferenceListHtml = api.renderTimelineItem(day.timeline[0], 0, null);
assert.match(compactReferenceListHtml, /class="reference-card-list"/);
assert.equal((compactReferenceListHtml.match(/data-menu-reference-id="compact-ref-/g) || []).length, 2);
day.references.splice(-compactReferences.length);
assert.equal(api.applyEditValues("timeline", day.timeline[0].id, { time: "12:34", title: "已儲存行程", address: "測試地址", note: "備註", "transport.mode": "transit", "transport.durationMinutes": "15", "transport.suggestion": "搭車" }), true);
api.saveTrip();
assert.equal(JSON.parse(store.get("fukuoka-hiroshima-trip-v1")).trips[0].days[0].timeline[0].title, "已儲存行程");
const targetIndex = day.timeline.findIndex((item) => item.id === "t1");
api.insertTimelineAbove("t1");
assert.equal(day.timeline[targetIndex + 1].id, "t1");
assert.notEqual(day.timeline[targetIndex].id, "t1");
assert.equal(day.flights.some((item) => item.timelineItemId === day.timeline[targetIndex].id), false);
assert.ok(JSON.parse(store.get("fukuoka-hiroshima-trip-v1")).trips[0].days[0].timeline.some((item) => item.id === day.timeline[targetIndex].id));
const flightHtml = api.renderFlight({ id: "fx", airline: "華航", flightNumber: "CI100", departureCode: "TPE", arrivalCode: "FUK", departureTime: "2026-01-01 10:00", arrivalTime: "2026-01-01 13:00", websiteUrl: "", timelineItemId: null }, day);
assert.match(flightHtml, /華航/); assert.match(flightHtml, /CI100/); assert.match(flightHtml, /TPE/); assert.match(flightHtml, /FUK/);
assert.doesNotMatch(flightHtml, /data-flight-field|<input|<select/);
api.state.openMenuId = "flight:fx";
const flightMenuHtml = api.renderFlight({ id: "fx", flightNumber: "CI100", websiteUrl: "", timelineItemId: null }, day);
assert.match(flightMenuHtml, /編輯航班資訊/); assert.match(flightMenuHtml, /刪除航班資訊/);
const referenceHtml = api.renderReference({ id: "rx", name: "景點", url: "https://example.com/a", description: "說明", siteName: "Example", previewImageUrl: "https://example.com/a.jpg", note: "", timelineItemId: null }, day);
assert.match(referenceHtml, /景點/); assert.match(referenceHtml, /data-preview-image/); assert.match(referenceHtml, />說明</);
assert.doesNotMatch(referenceHtml, />Example<|尚未填寫簡短說明|未命名網址/);
assert.match(referenceHtml, /preview-fallback/); assert.match(referenceHtml, /rel="noopener noreferrer"/);
assert.match(referenceHtml, /target="_blank"/);
assert.doesNotMatch(referenceHtml, /🔗|開啟網站/);
assert.doesNotMatch(referenceHtml, /data-reference-field|<input|<select/);
assert.equal(api.stableColorIndex("rx"), api.stableColorIndex("rx"));
assert.equal(api.referenceFallbackIcon({ name: "拉麵店" }), "🍜");
assert.equal(api.referenceFallbackIcon({ name: "飯店" }), "🏨");
assert.equal(api.referenceFallbackIcon({ name: "一般景點" }), "🗺️");
api.state.openMenuId = "reference:rx";
const referenceMenuHtml = api.renderReference({ id: "rx", name: "景點", url: "https://example.com", description: "說明", siteName: "Example", previewImageUrl: "", note: "", timelineItemId: null }, day);
assert.match(referenceMenuHtml, /編輯網址/); assert.match(referenceMenuHtml, /刪除網址/); assert.match(referenceMenuHtml, /preview-color-/);
const noDescriptionHtml = api.renderReference({ id: "empty", name: "無摘要", url: "https://example.com", description: "", siteName: "Hidden Site", previewImageUrl: "", note: "", timelineItemId: null }, day);
assert.doesNotMatch(noDescriptionHtml, /<span>尚未填寫|Hidden Site/);
const mapActions = api.renderMapActions({ address: "B", transport: { mode: "transit" } }, { address: "A" });
assert.match(mapActions, /map-action-count-2/); assert.match(mapActions, />Google Maps</); assert.match(mapActions, />上一站導航</);
assert.doesNotMatch(api.renderTools(), /常用語捷徑|data-speak|data-copy|stop-speech|phrase-card/);
assert.ok(api.state.trip.tools.phrases.length > 0);
api.state.editModal = { type: "reference", id: "r1" };
const beforePreview = store.get("fukuoka-hiroshima-trip-v1");
const editReferenceHtml = api.renderEditModal();
assert.match(editReferenceHtml, /即時預覽/); assert.match(editReferenceHtml, /data-live-preview/);
assert.equal(store.get("fukuoka-hiroshima-trip-v1"), beforePreview);
api.state.editModal = null;
assert.ok(api.transportModes.some((mode) => mode.value === "flight" && mode.icon === "✈️"));
assert.doesNotMatch(api.buildDirectionsUrl("TPE", "FUK", "flight"), /travelmode=flight/);
console.log("PASS schema v4 → v5、新欄位補齊、行程上方插入及立即保存");
console.log("PASS 航班摘要、網址 rich preview、flight 交通方式及導航 fallback");
console.log("PASS 行程唯讀卡、取消不變更、儲存持久化及三類 ⋯ 選單");
console.log("PASS 五色行程循環、網址固定雜湊色與縮圖 fallback");
console.log("PASS 網址整卡安全外連、無連結圖示／按鈕及 modal 非持久化即時預覽");

const migratedV5 = api.migrateTrip({ ...saved, schemaVersion: 5, packing: [{ category: "測試", items: [{ id: "p1", name: "護照", done: false }] }] });
assert.equal(migratedV5.schemaVersion, 6);
assert.equal(migratedV5.trips.length, 1);
assert.equal(migratedV5.activeTripId, migratedV5.trips[0].id);
assert.equal(migratedV5.trips[0].days[0].flights.length, 1);
assert.equal(migratedV5.trips[0].days[0].references.length, 1);
assert.equal(migratedV5.trips[0].bookings.length, 1);
assert.equal(migratedV5.trips[0].packing[0].items[0].name, "護照");
assert.ok(Array.isArray(migratedV5.trips[0].days[0].lodgings));
assert.ok(Array.isArray(migratedV5.trips[0].days[0].dining));
const importedRelations = { timeline: [{ id: "legacy-timeline" }], flights: [{ id: "legacy-flight" }], references: [{ id: "legacy-reference" }], lodgings: [{ id: "legacy-lodging" }], dining: [{ id: "legacy-dining" }] };
const legacyEditDraft = api.makeTripEditDraft({ id: "legacy-trip", days: [{ id: 77, date: "2028-02-03", region: "舊區域", description: "舊描述", transportTip: "交通提示", luggageTip: "行李提示", customField: "保留", ...importedRelations }, { date: "", location: "另一區", summary: "另一描述" }] });
assert.equal(legacyEditDraft.days[0].id, 77);
assert.equal(legacyEditDraft.days[0].area, "舊區域");
assert.equal(legacyEditDraft.days[0].title, "舊描述");
assert.equal(legacyEditDraft.days[0].customField, "保留");
assert.equal(legacyEditDraft.days[0].timeline[0].id, "legacy-timeline");
assert.equal(legacyEditDraft.days[0].flights[0].id, "legacy-flight");
assert.equal(legacyEditDraft.days[0].references[0].id, "legacy-reference");
assert.equal(legacyEditDraft.days[0].lodgings[0].id, "legacy-lodging");
assert.equal(legacyEditDraft.days[0].dining[0].id, "legacy-dining");
assert.ok(legacyEditDraft.days[1].id);
assert.equal(legacyEditDraft.days[1].area, "另一區");
assert.equal(legacyEditDraft.days[1].title, "另一描述");
assert.equal(api.normalizeTripEditDay({ id: 0 }).id, 0);
assert.equal(api.formatTripDate("2026-09-20"), "2026-09-20（週日）");
assert.equal(api.formatTripDate("2026-09-21"), "2026-09-21（週一）");
assert.equal(api.formatTripDate("2026-09-26"), "2026-09-26（週六）");
assert.equal(api.getTripWeekday("2026-02-30"), "");
api.state.editModal = { type: "trip", id: "legacy-trip" };
api.state.tripEditDraft = legacyEditDraft;
for (const importedDay of legacyEditDraft.days) {
  api.state.expandedOverviewDayId = importedDay.id;
  const importedDayHtml = api.renderEditModal();
  assert.match(importedDayHtml, new RegExp(`day\\.${importedDay.id}\\.date`));
}
api.state.editModal = null; api.state.tripEditDraft = null; api.state.expandedOverviewDayId = null;
const originalTripId = api.state.trip.id;
api.addTrip();
assert.equal(api.state.root.trips.length, 2);
const newTripId = api.state.trip.id;
assert.notEqual(newTripId, originalTripId);
api.switchTrip(originalTripId);
assert.equal(api.state.trip.id, originalTripId);
api.switchTrip(newTripId);
assert.equal(api.applyEditValues("trip", newTripId, { title: "大阪旅行", startDate: "2027-01-01", endDate: "2027-01-03", notice: "注意保暖" }), true);
api.saveTrip();
assert.equal(JSON.parse(store.get("fukuoka-hiroshima-trip-v1")).trips.find((trip) => trip.id === newTripId).title, "大阪旅行");
const storedBeforeTripCancel = store.get("fukuoka-hiroshima-trip-v1");
const formalTitleBeforeCancel = api.state.trip.title;
api.openEditModal("trip", api.state.trip.id);
api.state.tripEditDraft.title = "不應保存的草稿";
api.cancelEditModal();
assert.equal(api.state.trip.title, formalTitleBeforeCancel);
assert.equal(store.get("fukuoka-hiroshima-trip-v1"), storedBeforeTripCancel);
const daysBefore = api.state.trip.days.length;
api.addDay();
assert.equal(api.state.trip.days.length, daysBefore + 1);
const addedDay = api.state.trip.days.at(-1);
api.deleteDay(addedDay.id);
assert.equal(api.state.trip.days.some((entry) => entry.id === addedDay.id), false);
api.restoreDeletedTimelineItem();
assert.equal(api.state.trip.days.some((entry) => entry.id === addedDay.id), true);
api.startNewCollection("lodging");
const lodging = api.state.trip.days.find((entry) => entry.id === api.state.selectedDayId).lodgings.at(-1);
assert.equal(api.applyEditValues("lodging", lodging.id, { name: "測試飯店", address: "大阪", checkIn: "15:00", checkOut: "11:00", phone: "", bookingReference: "ABC", url: "https://example.com", description: "住宿說明", previewImageUrl: "https://example.com/h.jpg", note: "" }), true);
api.saveTrip();
assert.match(api.renderCollectionCard("lodging", lodging), /測試飯店|入住/);
assert.match(api.renderCollectionCard("lodging", lodging), /lodging-checkin">入住 15:00/);
assert.doesNotMatch(api.renderCollectionCard("lodging", { ...lodging, checkIn: "" }), /lodging-checkin|入住 /);
api.deleteCollection("lodging", lodging.id); api.restoreDeletedTimelineItem();
assert.ok(api.state.trip.days.find((entry) => entry.id === api.state.selectedDayId).lodgings.some((entry) => entry.id === lodging.id));
api.startNewCollection("dining");
const dining = api.state.trip.days.find((entry) => entry.id === api.state.selectedDayId).dining.at(-1);
assert.equal(api.applyEditValues("dining", dining.id, { name: "拉麵店", category: "拉麵", address: "難波", reservationTime: "18:00", phone: "", url: "", description: "餐飲說明", previewImageUrl: "", note: "" }), true);
api.saveTrip();
assert.match(api.renderCollectionCard("dining", dining), /拉麵店|預約 18:00/);
api.state.editModal = null;
const entriesHtml = api.renderDayCollectionEntries(api.state.trip.days.find((entry) => entry.id === api.state.selectedDayId));
assert.match(entriesHtml, /查看住宿資訊/); assert.match(entriesHtml, /查看今日推薦餐飲/);
assert.doesNotMatch(entriesHtml, /新增住宿|新增餐飲推薦|collection-card/);
assert.equal((entriesHtml.match(/查看住宿資訊/g) || []).length, 1);
assert.equal((entriesHtml.match(/查看今日推薦餐飲/g) || []).length, 1);
assert.equal(api.renderDayNotice({ transportTip: "", luggageTip: "" }), "");
assert.match(api.renderDayNotice({ transportTip: "搭車提醒", luggageTip: "" }), /當日注意事項|交通|搭車提醒/);
assert.doesNotMatch(api.renderDayNotice({ transportTip: "搭車提醒", luggageTip: "" }), /行李/);
api.state.editModal = { type: "trip", id: api.state.trip.id };
api.state.tripEditDraft = JSON.parse(JSON.stringify(api.state.trip));
api.state.expandedOverviewDayId = null;
const collapsedTripEditHtml = api.renderEditModal();
assert.match(collapsedTripEditHtml, /overview-accordion/);
assert.match(collapsedTripEditHtml, /data-drag-overview-day=/);
assert.match(collapsedTripEditHtml, /data-sort-overview-days/);
assert.match(collapsedTripEditHtml, /data-move-overview-day=/);
assert.match(collapsedTripEditHtml, /data-edit-trip-day=/);
assert.doesNotMatch(collapsedTripEditHtml, /data-edit-overview-day=/);
assert.doesNotMatch(collapsedTripEditHtml, /draggable=/);
assert.doesNotMatch(collapsedTripEditHtml, /day-description-input|day-overview-grid/);
const expandedDayId = api.state.tripEditDraft.days[0].id;
api.state.expandedOverviewDayId = expandedDayId;
const tripEditHtml = api.renderEditModal();
assert.ok(tripEditHtml.indexOf("日期") < tripEditHtml.indexOf("區域"));
assert.ok(tripEditHtml.indexOf("區域") < tripEditHtml.indexOf("描述"));
assert.match(tripEditHtml, /day-description-input/);
assert.match(tripEditHtml, /type="date"[^>]*data-native-date-picker/);
assert.match(tripEditHtml, /data-date-weekday>/);
assert.match(tripEditHtml, /當日注意事項/);
assert.equal((tripEditHtml.match(/overview-accordion expanded/g) || []).length, 1);
const originalQuerySelector = context.document.querySelector;
const originalQuerySelectorAll = context.document.querySelectorAll;
const scrollBody = { scrollTop: 137 };
let nearestScrollOptions = null;
const nextExpandedId = api.state.tripEditDraft.days[0].id;
api.state.expandedOverviewDayId = null;
const expandedRow = { dataset: { overviewDayId: String(nextExpandedId) }, scrollIntoView: (options) => { nearestScrollOptions = options; } };
context.document.querySelector = (selector) => selector === '#edit-modal-form[data-edit-type="trip"] .modal-body' ? scrollBody : selector === '#edit-modal-form[data-edit-type="trip"]' ? noopElement : originalQuerySelector(selector);
context.document.querySelectorAll = (selector) => selector === "[data-overview-day-id]" ? [expandedRow] : [];
api.toggleOverviewDay(nextExpandedId);
assert.equal(scrollBody.scrollTop, 137);
assert.equal(nearestScrollOptions?.block, "nearest");
assert.equal(api.state.expandedOverviewDayId, nextExpandedId);
context.document.querySelector = originalQuerySelector;
context.document.querySelectorAll = originalQuerySelectorAll;
const overflowNodes = [
  { clientWidth: 100, scrollWidth: 140, kind: "bad" },
  { clientWidth: 100, scrollWidth: 140, kind: "ellipsis" },
  { clientWidth: 100, scrollWidth: 140, kind: "scroll" },
  { clientWidth: 100, scrollWidth: 100, kind: "fits" },
];
assert.deepEqual(Array.from(api.findUnexpectedHorizontalOverflow({ querySelectorAll: () => overflowNodes }, (node) => ({ overflowX: node.kind === "scroll" ? "auto" : "visible", textOverflow: node.kind === "ellipsis" ? "ellipsis" : "clip" }))).map((node) => node.kind), ["bad"]);

const selectedBeforeSort = api.state.selectedDayId;
const relationIdsBeforeSort = api.state.tripEditDraft.days.map((day) => ({ id: day.id, timeline: day.timeline.map((item) => item.id), flights: day.flights.map((item) => item.id), references: day.references.map((item) => item.id), lodgings: day.lodgings.map((item) => item.id), dining: day.dining.map((item) => item.id) }));
const formalOrderBeforeDraftMove = api.state.trip.days.map((day) => day.id);
const storedBeforeDraftMove = store.get("fukuoka-hiroshima-trip-v1");
const movedDraftId = api.state.tripEditDraft.days[1].id;
api.moveOverviewDay(movedDraftId, "up");
assert.equal(api.state.tripEditDraft.days[0].id, movedDraftId);
assert.deepEqual(api.state.trip.days.map((day) => day.id), formalOrderBeforeDraftMove);
assert.equal(store.get("fukuoka-hiroshima-trip-v1"), storedBeforeDraftMove);
api.state.tripEditDraft.days.forEach((day, index) => { day.date = index === 0 ? "2027-03-03" : index === 1 ? "2027-03-01" : ""; });
const manuallyOrderedIds = api.state.tripEditDraft.days.map((day) => day.id);
assert.equal(api.saveTripEditDraft({}), true);
assert.deepEqual(api.state.trip.days.map((day) => day.id), manuallyOrderedIds);
api.state.tripEditDraft = JSON.parse(JSON.stringify(api.state.trip));
api.sortOverviewDaysByDate();
assert.equal(api.saveTripEditDraft({}), true);
const sortedDates = api.state.trip.days.map((day) => day.date);
assert.deepEqual(sortedDates, [...sortedDates].sort((a, b) => !a ? 1 : !b ? -1 : a.localeCompare(b)));
assert.equal(api.state.selectedDayId, selectedBeforeSort);
for (const before of relationIdsBeforeSort) {
  const after = api.state.trip.days.find((day) => day.id === before.id);
  assert.ok(after);
  assert.deepEqual(after.timeline.map((item) => item.id), before.timeline);
  assert.deepEqual(after.flights.map((item) => item.id), before.flights);
  assert.deepEqual(after.references.map((item) => item.id), before.references);
  assert.deepEqual(after.lodgings.map((item) => item.id), before.lodgings);
  assert.deepEqual(after.dining.map((item) => item.id), before.dining);
}
api.state.tripEditDraft = JSON.parse(JSON.stringify(api.state.trip));
api.state.tripEditDraft.days[0].date = "2027-04-01";
api.state.tripEditDraft.days[1].date = "2027-04-01";
assert.equal(api.saveTripEditDraft({}), false);
const flightCardMarkup = api.renderFlight({ id: "flight-layout", airline: "很長很長的航空公司名稱", flightNumber: "AB123", departureCode: "TPE", arrivalCode: "FUK", departureTime: "2027-01-01 10:00", arrivalTime: "2027-01-01 13:00", websiteUrl: "https://example.com" }, api.state.trip.days[0]);
assert.match(flightCardMarkup, /preview-card-shell[\s\S]*flight-summary[\s\S]*card-corner-actions/);
assert.doesNotMatch(flightCardMarkup, /inline-actions/);
assert.doesNotMatch(flightCardMarkup, /<button[^>]*>[\s\S]*<button/);
const referenceCardMarkup = api.renderReference({ id: "reference-layout", name: "非常長的旅遊網址預覽標題", description: "很長的說明", url: "https://example.com", previewImageUrl: "https://example.com/image.jpg" }, api.state.trip.days[0]);
assert.match(referenceCardMarkup, /preview-card-shell[\s\S]*reference-preview-surface[\s\S]*<\/div>\s*<div class="card-corner-actions">/);
assert.doesNotMatch(referenceCardMarkup, /inline-actions/);
assert.doesNotMatch(referenceCardMarkup.match(/<a class="reference-hit-area"[\s\S]*?<\/a>/)?.[0] || "", /<button/);
const lodgingShellMarkup = api.renderCollectionCard("lodging", { id: "lodging-layout", name: "很長的住宿名稱", checkIn: "15:00", url: "https://example.com", description: "住宿描述", previewImageUrl: "https://example.com/h.jpg", address: "" });
const diningShellMarkup = api.renderCollectionCard("dining", { id: "dining-layout", name: "很長的餐廳名稱", reservationTime: "18:00", url: "https://example.com", description: "餐廳描述", previewImageUrl: "", address: "" });
for (const markup of [lodgingShellMarkup, diningShellMarkup]) {
  assert.match(markup, /preview-card-shell[\s\S]*reference-preview-surface[\s\S]*<\/div><div class="card-corner-actions">/);
  assert.doesNotMatch(markup, /inline-actions/);
}
assert.match(styles, /\.summary-grid \.day-card \{ width:\s*min\(680px, calc\(100% - 36px\)\)/);
assert.match(styles, /\.summary-grid \.day-card,[\s\S]*\.flight-card\.preview-card-shell,[\s\S]*\.timeline-row \.reference-card\.preview-card-shell,[\s\S]*width:\s*min\(680px, calc\(100% - 36px\)\);[\s\S]*max-width:\s*680px;[\s\S]*margin-inline:\s*auto;/);
assert.doesNotMatch(styles, /calc\(100% - 52px\)/);
assert.match(styles, /grid-template-columns:\s*minmax\(0,1fr\) 56px;[\s\S]*min-height:\s*82px;[\s\S]*padding:\s*8px 9px 8px 12px;/);
assert.match(styles, /width:\s*54px;\s*height:\s*54px;/);
assert.match(styles, /-webkit-line-clamp:\s*2;[\s\S]*-webkit-line-clamp:\s*1;/);
assert.match(styles, /v6-ui-10 width-only override;[\s\S]*width:\s*min\(700px, calc\(100% - 20px\)\);[\s\S]*max-width:\s*700px;[\s\S]*margin-inline:\s*auto;/);
assert.match(styles, /@media \(max-width: 359px\)[\s\S]*width:\s*calc\(100% - 12px\);[\s\S]*max-width:\s*700px;/);
assert.match(styles, /--flight-reference-gap:\s*10px;/);
assert.match(styles, /\.attached-list,[\s\S]*\.unassigned > \.inline-list,[\s\S]*\.reference-card-list \{[\s\S]*gap:\s*var\(--flight-reference-gap\);/);
assert.match(styles, /\.reference-card-list \{\s*margin:\s*0;\s*padding:\s*0;/);
assert.doesNotMatch(styles, /\.reference-card-list > \.reference-card\.preview-card-shell/);
api.state.editModal = null;
api.state.tripEditDraft = null;
api.state.expandedOverviewDayId = null;
api.state.collectionPanel = "lodging";
const lodgingPanel = api.renderCollectionPanel();
assert.match(lodgingPanel, /住宿資訊/); assert.match(lodgingPanel, /新增住宿/); assert.match(lodgingPanel, /測試飯店/);
api.state.collectionPanel = "dining";
const diningPanel = api.renderCollectionPanel();
assert.match(diningPanel, /今日推薦餐飲/); assert.match(diningPanel, /新增餐飲推薦/); assert.match(diningPanel, /拉麵店/);
api.state.tripSelectorOpen = true;
assert.match(api.renderTripSelectorDialog(), /選擇旅行|目前旅行/);
api.state.tripSelectorOpen = false;
api.state.collectionPanel = null;
console.log("PASS schema v5 → v6、多旅行新增切換、旅行欄位與資料完整保留");
console.log("PASS 動態日期新增刪除及五秒復原資料流程");
console.log("PASS 住宿與餐飲新增編輯刪除、INS 預覽及 Maps 資料");
console.log("PASS 標題旅行選擇、住宿／餐飲緊湊入口與 modal-root 列表");

api.state.trip.packing = [{ category: "測試分類", items: [{ id: 0, name: "零號", done: false }, { id: "keep", name: "保留", done: true }, { id: "remove", name: "移除", done: false }] }];
const packingMarkup = api.renderPacking();
assert.equal((packingMarkup.match(/data-menu-pack-id=/g) || []).length, 3);
assert.match(packingMarkup, /aria-label="更多操作：零號"/);
api.state.openMenuId = "pack:0";
const packingSheet = api.renderMobileActionSheet();
assert.match(packingSheet, /type="button" data-packing-item-id="0">刪除項目/);
confirmResult = false;
const writesBeforeCancel = storageWrites;
const packingBeforeCancel = JSON.stringify(api.state.trip.packing);
assert.equal(api.deletePackingItem("0"), false);
assert.equal(JSON.stringify(api.state.trip.packing), packingBeforeCancel);
assert.equal(storageWrites, writesBeforeCancel);
confirmResult = true;
api.state.syncSettings = { syncId: "test", syncSecret: "test", revision: 1 };
api.state.syncDirty = false;
assert.equal(api.deletePackingItem("0"), true);
assert.deepEqual(Array.from(api.state.trip.packing[0].items, (item) => item.id), ["keep", "remove"]);
assert.equal(api.state.trip.packing[0].items[0].name, "保留");
assert.ok(storageWrites > writesBeforeCancel);
assert.equal(api.state.syncDirty, true);
assert.equal(api.deletePackingItem("remove"), true);
assert.deepEqual(Array.from(api.state.trip.packing[0].items, (item) => item.id), ["keep"]);
const alertsBeforeMissing = alertMessages.length;
assert.equal(api.deletePackingItem("missing"), false);
assert.equal(alertMessages.at(-1), "找不到這筆打包項目，請重新開啟明細。");
assert.equal(alertMessages.length, alertsBeforeMissing + 1);
api.state.syncSettings = null;
assert.match(styles, /\.reference-card-list\s*\{[\s\S]*?row-gap:\s*4px;[\s\S]*?margin:\s*0;[\s\S]*?padding:\s*0;/);
assert.match(styles, /\.reference-card-list > \*\s*\{\s*margin-block:\s*0;/);
const spacingPatch = styles.slice(styles.indexOf("/* v6-ui-14-sync-2"));
assert.doesNotMatch(spacingPatch, /\.reference-card\.preview-card-shell|\.reference-preview-main|\.reference-copy|\.preview-media|\.card-corner-actions/);
console.log("PASS packing 明細刪除：type=button、重繪代理、取消安全、數字／字串 ID、保存與同步排程");
console.log("PASS 網址卡清單 row-gap 4px，卡片本體樣式未修改");

let spoken = [];
let cancelled = 0;
let voices = [{ lang: "ja-JP", name: "Japanese" }];
let voicesChanged;
context.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
context.speechSynthesis = {
  getVoices: () => voices,
  speak: (utterance) => spoken.push(utterance),
  cancel: () => { cancelled += 1; },
  addEventListener: (name, handler) => { if (name === "voiceschanged") voicesChanged = handler; },
  removeEventListener: () => {},
};
api.speakJapanese("こんにちは");
assert.equal(spoken.length, 1);
assert.equal(spoken[0].voice.lang, "ja-JP");
assert.equal(spoken[0].lang, "ja-JP");
assert.equal(spoken[0].rate, 0.85);
assert.equal(api.state.speechMessage, "正在播放日文。");
spoken[0].onend();
assert.equal(api.state.speechMessage, "");
api.speakJapanese("失敗テスト");
spoken.at(-1).onerror();
assert.equal(api.state.speechMessage, "");
api.speakJapanese("一");
const oldUtterance = spoken.at(-1);
api.speakJapanese("二");
oldUtterance.onend();
assert.equal(api.state.speechMessage, "正在播放日文。");
api.stopSpeech();
assert.equal(api.state.speechMessage, "");
assert.ok(cancelled >= 4);
voices = [{ lang: "en-US", name: "English" }];
api.speakJapanese("日本語なし");
assert.equal(api.state.speechMessage, "此裝置沒有可用的日文語音。");
voices = [];
api.speakJapanese("遅延");
assert.equal(api.state.speechMessage, "正在載入日文語音…");
voices = [{ lang: "ja", name: "Japanese delayed" }];
voicesChanged();
assert.equal(spoken.at(-1).voice.lang, "ja");
api.stopSpeech();
console.log("PASS 日文語音選擇、延遲載入、無語音提示、完成／失敗／停止狀態及快速切換");
