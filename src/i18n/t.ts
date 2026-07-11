// t(key, params) 取字＋{name} 插值；缺 key 時 dev 拋錯、prod 回傳 key。
// 規格：plan/00-foundations.md §9、plan/01-architecture.md §3.3。
//
// 本檔維持 M0 stub、不再使用：t()／hasKey()／getMissingKeys()／formatNumber()／formatDate()／
// formatYearMonth() 與主字串表已合併定案於 `src/i18n/zh-TW.ts`（唯一模組檔，理由與回顧見
// plan/13-i18n-strings.md §8 D17）。本檔與 01 §3.3 目錄樹（列出 `t.ts`）之間的檔案存在性落差
// 暫時保留（該樹之後若整併請一併回寫），不刪除本檔以避免與該文件的既有指向產生新的不一致。
// 邊界規則：i18n 零依賴，本檔不得 import 任何模組（eslint.config.js 邊界規則 3）。
export {};
