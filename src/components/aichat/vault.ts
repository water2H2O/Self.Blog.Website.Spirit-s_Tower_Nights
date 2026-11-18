// Local API vault: PBKDF2-SHA256 + AES-256-GCM. Password/key never persisted.
const SLOT = 'aichat:encrypted-providers';
let key: CryptoKey | null = null;
let salt: Uint8Array | null = null;
let memory: unknown = null;
let queue = Promise.resolve();
const encode = (v: Uint8Array) => btoa(String.fromCharCode(...v));
const decode = (v: string) => Uint8Array.from(atob(v), c => c.charCodeAt(0));
async function derive(password: string, s: Uint8Array) {
 const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2', salt:s as BufferSource, iterations:310000, hash:'SHA-256'}, material, {name:'AES-GCM',length:256}, false, ['encrypt','decrypt']);
}
export function hasVault() { return Boolean(localStorage.getItem(SLOT)); }
export function currentVaultState() { return memory; }
export function lockVault() { key=null; salt=null; memory=null; }
export async function unlockVault(password: string) {
 const record = JSON.parse(localStorage.getItem(SLOT) || 'null');
 if (!record || record.version !== 1) throw new Error('没有可用的加密配置');
 const s = decode(record.salt);
 const k = await derive(password,s);
 let plain;
 try { plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(record.iv)},k,decode(record.data)); }
 catch { throw new Error('口令错误，或本地加密数据已损坏'); }
 const value = JSON.parse(new TextDecoder().decode(plain));
 key=k; salt=s; memory=value;
 return value;
}
export async function configureVault(remember: boolean, password: string) {
 await queue;
 if (!remember) { key=null; salt=null; localStorage.removeItem(SLOT); return; }
 if(password.length < 12) throw new Error('加密口令至少需要 12 个字符');
 const s=crypto.getRandomValues(new Uint8Array(16));
 const k=await derive(password,s);
 key=k; salt=s;
}
export function storeVaultState(value: unknown): Promise<void> {
 memory=value;
 const k=key, s=salt;
 queue=queue.catch(()=>{}).then(async()=>{
  if(!k || !s) return;
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,new TextEncoder().encode(JSON.stringify(value)));
  localStorage.setItem(SLOT,JSON.stringify({version:1,salt:encode(s),iv:encode(iv),data:encode(new Uint8Array(data))}));
 });
 return queue;
}
