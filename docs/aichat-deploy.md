# 部署 /aichat 到 Cloudflare

按顺序做，**建桶 → 配 secret → 推送部署 → 验证**。顺序错了会在构建阶段报错。

## 0. 前提

- 站点本来就走 GitHub → Cloudflare Workers 自动部署，这一步不变；
- R2 需要在账号里**启用一次**（免费额度 10 GB，够用；控制台会引导，不需要信用卡）。

## 1. 建 R2 桶

控制台：**R2 → Create bucket**，名字必须是 `aichat-sync`（要和 `wrangler.jsonc` 里的
`bucket_name` 一致）。

或者用 CLI：

```bash
npx wrangler login
npx wrangler r2 bucket create aichat-sync
```

> 建桶这一步必须在推送之前做完：`wrangler.jsonc` 里已经写了 `r2_buckets` 绑定，
> 桶不存在时部署会直接失败。
>
> 暂时不想用云端快照的话，把 `wrangler.jsonc` 里 `r2_buckets` 那一段删掉即可——
> `/api/aichat/sync` 会返回 503（设置里会显示「服务端未配置同步存储」），
> 其余功能完全不受影响。

## 2. 配三个 secret

**控制台路径**：Workers & Pages → 选中项目（`self-blog-website-spirit-s-tower-nights`）
→ Settings → Variables and Secrets → Add → 类型选 **Secret**。

| 名称 | 值 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 你的官方 API Key |
| `AICHAT_PASS` | 你自己定的登录口令（别太短） |
| `AICHAT_SECRET` | 32 字节随机串，见下面命令 |

生成 `AICHAT_SECRET`：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**或者用 CLI**（需要先 `npx wrangler login`）：

```bash
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put AICHAT_PASS
npx wrangler secret put AICHAT_SECRET
```

每条命令会提示粘贴值，回车即可。secret 写进 Cloudflare 后**控制台也读不回明文**，
仓库里自始至终没有它们。

## 3. 部署

```bash
git add -A            # 注意先看一眼 status，别把临时文件带进去
git commit -m "…"     # 或者直接用已经提好的提交
git push
```

推上去之后 Cloudflare 会自动构建部署。也可以在本地直接 `npx wrangler deploy`。

## 4. 验证（四条命令）

```bash
# ① 接口活着：应返回 {"authed":false,...}
curl -s https://water2h2o.com/api/aichat/session

# ② 口令正确：应返回 200 并带 set-cookie
curl -i -X POST https://water2h2o.com/api/aichat/login \
  -H "content-type: application/json" \
  -d '{"password":"你的口令"}'

# ③ 用上面的 cookie 取快照：应返回 {"sessions":[],"savedAt":null}
curl -s -b 'aichat_session=…' https://water2h2o.com/api/aichat/sync

# ④ 页面
open https://water2h2o.com/aichat
```

页面上：填自己的 Key 能直接对话（BYOK）；点左下角头像 → 设置 → 模型能加多个接口；
用口令登录后，设置 → 账号与余额会出现「云端快照」。

## 5. 出问题先看这几条

| 现象 | 原因 |
| --- | --- |
| `/api/aichat/session` 返回 404 | 部署里没有 `run_worker_first` 那条，或没真正部署成功 |
| 返回 `{"error":"config","message":"服务端未配置…"}` | 对应的 secret 没配 / 名字拼错 |
| 登录返回 503 且提到 `AICHAT_SECRET` | 没配签名串 |
| 同步返回 503 提到 `SYNC` | R2 绑定没生效，或桶名不是 `aichat-sync` |
| 构建阶段就失败 | 看 Cloudflare 项目页 → Deployments → 对应构建日志 |
| 页面能开但一直转圈 | 多半是 island 水合失败，控制台会显示具体错误（页面顶部也有红框） |

## 6. 回滚

- 代码：CF 项目 → Deployments → 找上一个正常版本 → **Rollback**；
- 或者 `git revert` 后再推一次。

## 7. 上线后要记得的

- **Cloudflare 账号开 2FA**：R2 里存的是你的真实对话，拿到账号就能读。
- 口令改了会**立刻**让所有旧 cookie 失效（签名里拌了口令），不用手动清理。
- 想撤掉某台设备：改一次 `AICHAT_PASS` 即可。
- R2 里的快照只有一份（`sync/owner.json`），上传是**整包覆盖**，没有版本历史；
  重要数据建议偶尔本地另存一份。

## 验证 secret 到底挂上没有

打开 `https://<你的域名>/api/aichat/config`，它只报布尔值、不返回值：

```json
{"hasApiKey":true,"hasPass":true,"hasSecret":true,"hasBucket":true}
```

- 三个 `true` 才算配好；任一为 `false` 说明那个 secret 没落到**这个** Worker 上。
- 如果面板里明明加了却是 `false`，多半是只保存没点「部署」。用
  `npx wrangler secret put <名字>` 写一次最稳（它会直接发一个带该 secret 的版本）。
- `npx wrangler secret list` 里出现 `[]` 就说明这个 Worker 一个 secret 都没有。