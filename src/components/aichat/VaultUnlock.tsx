import { useState } from 'react';
import { hasVault, unlockVault } from './vault.ts';
export default function VaultUnlock({onUnlock}:{onUnlock:()=>void}) {
 const [password,setPassword]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
 if (!hasVault()) return null;
 return <form className="ac-gate-card" onSubmit={async(e)=>{e.preventDefault();setBusy(true);setError('');try {await unlockVault(password);setPassword('');onUnlock();} catch(err){setError(String((err as Error).message));} finally{setBusy(false);}}}>
 <h2>解锁本地 API 配置</h2><p>配置已加密保存，口令只用于本机解锁，不会上传。</p>
 <label className="ac-field"><span>本地加密口令</span><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} /></label>
 <button className="ac-primary" disabled={busy || !password}>{busy?'解锁中…':'解锁'}</button>{error && <p className="ac-error">{error}</p>}
 </form>;
}
