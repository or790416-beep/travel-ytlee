# 旅遊行程手機 PWA

此版本保留 schema v6、既有 LocalStorage key 與所有卡片外觀，新增手機安裝、離線 App Shell、主畫面圖示、更新提示及資料備份／匯入。

## 本機測試

```bash
node server.js
```

電腦瀏覽器可開啟 `http://localhost:4173/`。手機與電腦在同一個 Wi-Fi 時，可使用電腦的區域網路 IPv4，例如：

```text
http://192.168.0.81:4173/?v=v6-ui-14-pwa
```

區域網路 HTTP 適合測試畫面，但手機上的完整 PWA 安裝、Service Worker 與離線能力需要 HTTPS 正式網址。

## 正式部署

請將整個資料夾部署到支援 Node.js 與 HTTPS 的主機，啟動指令為：

```bash
npm start
```

主機需將環境變數 `PORT` 傳給 `server.js`。因為旅遊網址預覽使用 `/api/link-preview`，不能只部署靜態檔案；必須同時執行 `server.js`。

## 安裝到手機

### iPhone / iPad

1. 使用 Safari 開啟 HTTPS 正式網址。
2. 點 Safari 的「分享」。
3. 選擇「加入主畫面」。
4. 點「新增」。

### Android

1. 使用 Chrome 開啟 HTTPS 正式網址。
2. 開啟瀏覽器選單。
3. 選擇「安裝應用程式」或「加到主畫面」。

也可從旅行標題右側 `⋯` 選單點「安裝到手機」。

## 將舊網址的資料搬到正式網址

LocalStorage 依網址分開保存，因此從區域網路網址改成 HTTPS 正式網址時，資料不會自動搬移。

1. 在舊網址開啟旅行標題右側 `⋯`。
2. 點「備份資料」，保存 JSON 檔。
3. 在新的 HTTPS 網址開啟 `⋯`。
4. 點「匯入備份」，選擇剛才的 JSON。

匯入前系統會先把新網址目前的資料另存為安全備份，不會清除其他 LocalStorage 項目。

## 更新

有新版 Service Worker 時，畫面底部會顯示「旅遊 APP 有新版可用」。點「重新載入」即可套用新版本。
