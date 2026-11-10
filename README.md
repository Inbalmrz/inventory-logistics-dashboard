# דאשבורד מלאי ולוגיסטיקה

**כל הנתונים במערכת הומצאו לצורך הדגמה.** הם נשמרים ב-Airtable והדאשבורד קורא אותם משם, לא מקובץ סטטי.

## ארכיטקטורה

```
Airtable (base "מלאי ולוגיסטיקה") --REST API--> src/sources/airtable-source.js --> חישובים --> מסכים
```

ה-base מכיל 7 טבלאות: `warehouses`, `suppliers`, `items`, `stock`, `movements`, `purchaseOrders`, `meta`.
`meta` מחזירה את תאריך הנתונים ואת מועד הטעינה האחרון, שמוצג בראש כל מסך.

## הפעלה

1. **יצירת טוקן ב-Airtable:** https://airtable.com/create/tokens , Create token, עם ההרשאות
   `data.records:read` ו-`data.records:write` (לטעינה), `schema.bases:read`, ובגישה ל-base של הפרויקט.
2. **טעינת הנתונים ל-Airtable (פעם אחת, וגם בכל טעינה מחדש):**
   ```
   AIRTABLE_TOKEN=pat... AIRTABLE_BASE_ID=appS5K6TugLWnxOXP node tools/seed-airtable.js
   ```
   כברירת מחדל נטענת גרסה קלה (כ-860 רשומות, מתאימה לתוכנית החינמית של Airtable, שמוגבלת ל-1,000 רשומות ל-base).
   עם `--full` נטענות כ-15,000 רשומות (שנה שלמה), ודורש תוכנית בתשלום.
3. **הפעלת הדאשבורד:** `serve.ps1` (Windows) או כל שרת סטטי, ופתיחת `http://localhost:8765/`.
   בפתיחה הראשונה העמוד מבקש להדביק את הטוקן. הוא נשמר בדפדפן עד סגירת הלשונית.
   כדי לא להקליד כל פעם, יוצרים `config.local.js` (לא נכנס ל-git):
   ```js
   window.APP_CONFIG.airtable.token = 'pat...';
   ```

לטעינה מקומית בלי Airtable (נתונים שנוצרים בדפדפן): בקובץ `config.js` משנים `source` ל-`'demo'`.

## גרסת Digi-Key
`digikey.html` היא עותק של הדאשבורד שקורא מ-base נפרד ב-Airtable (`appHZ3j17mjTXiMP6`), שהקטלוג שלו מגיע מ-Digi-Key.
מ-Digi-Key מגיעים מק״ט, שם, קטגוריה, יצרן, מחיר ליחידה וזמן אספקה של היצרן. המלאי, התנועות וההזמנות מומצאים בסימולציה, כי Digi-Key לא חושפת נתונים כאלה.

1. ב-https://developer.digikey.com יוצרים Organization ו-App עם Product Information v4 ו-OAuth מסוג Client Credentials, ומקבלים Client ID ו-Client Secret.
2. טוענים את הקטלוג ל-Airtable (הפרטים של Digi-Key נשארים בסקריפט בלבד ולא נכנסים לדפדפן):
   ```
   DIGIKEY_CLIENT_ID=... DIGIKEY_CLIENT_SECRET=... AIRTABLE_TOKEN=pat... AIRTABLE_BASE_ID=appHZ3j17mjTXiMP6 node tools/seed-airtable.js --digikey
   ```
3. פותחים `http://localhost:8765/digikey.html`. הטוקן של Airtable צריך גישה גם ל-base הזה.

## אבטחה
הטוקן לא נשמר ב-repo. הדאשבורד רק קורא נתונים, ולכן מספיק לו טוקן עם `data.records:read` בלבד.
בגרסה הנוכחית הטוקן עובר דרך הדפדפן, ולכן מתאים להדגמה. בשימוש אמיתי צריך שרת שמחזיק את הטוקן במשתני סביבה.

## מבנה
- `src/sources/airtable-source.js` קריאה מ-Airtable. `src/sources/demo-source.js` מחולל הנתונים המומצאים.
- `tools/seed-airtable.js` טעינת הנתונים ל-Airtable.
- `src/metrics.js` חישובים, `src/forecast.js` תחזיות, `src/reconcile.js` בדיקות התאמה.
- `src/ui/` גרפים, טבלאות וייצוא ל-Excel.
