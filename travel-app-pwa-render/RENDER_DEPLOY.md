# Render 部署說明

此專案需以 Node.js Web Service 部署，因為 `/api/link-preview` 需要伺服器端執行。

## 部署設定

- Runtime：Node
- Build Command：`npm install`
- Start Command：`npm start`
- Health Check Path：`/`
- 伺服器會讀取 Render 提供的 `PORT`，並監聽 `0.0.0.0`

## 建議流程

1. 將此資料夾上傳到 GitHub repository 根目錄。
2. 在 Render 選擇 **New > Blueprint**，連接該 repository。
3. Render 會讀取根目錄的 `render.yaml`。
4. 確認服務名稱與方案後執行部署。
5. 部署完成後，使用 Render 提供的 HTTPS 網址開啟。
6. 在 iPhone Safari 使用「分享 > 加入主畫面」。

## 資料搬移提醒

LocalStorage 依網域分開保存。從舊的 `192.168.x.x` 網址移到正式 HTTPS 網址時，請先在舊版匯出備份，再於新網址匯入。
