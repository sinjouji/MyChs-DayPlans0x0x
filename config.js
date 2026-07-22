/* ============================================================================
   config.js
   書き換えが必要なのはこのファイルだけです。app.js本体は触らなくてOK。
   ============================================================================ */

/* ---- Firebaseプロジェクトの接続情報 ----
   Firebaseコンソール → プロジェクトの設定 → マイアプリ から取得できます。 */
export const firebaseConfig = {
  apiKey: "AIzaSyDBj4SmdltBms4tNnoagrz8U3WhC0upq4c",
  authDomain: "mychs-dayplans0x0x.firebaseapp.com",
  projectId: "mychs-dayplans0x0x",
  storageBucket: "mychs-dayplans0x0x.firebasestorage.app",
  messagingSenderId: "452128702920",
  appId: "1:452128702920:web:4624da7a3c9cf742e280fd"
};

/* ---- 合言葉（パスワード）の正解ハッシュ ----
   合言葉を決めたら、ブラウザの開発者コンソールで下のコードを実行し、
   出てきた文字列をここに貼り付けてください。

     async function h(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");}
     h("決めた合言葉").then(console.log)

   ※ crypto.subtle は https:// （または localhost）でのみ使えます。
   ※ 同じ合言葉の文字列（ハッシュではなく素の文字列）を firestore.rules にも書いてください。 */
export const CORRECT_PASSWORD_HASH = "bd984cda4f8f9f5cfdf1774598e28f10ef0f3249bd0e70a1a498ce5b88820267"; // ← 必ず書き換えてください
