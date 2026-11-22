# 部署到腾讯云轻量应用服务器

目标：在已有的轻量应用服务器上，用子域名 **ditie.gmgnclaw.com** 打开游戏，不影响服务器上已有的两个游戏。

游戏本身是纯静态网站（`yarn build` 后的 `out/` 目录，约 3 MB），Nginx 直接提供文件就行。字体、脚本全部打包在网站里，不依赖 Google 等境外资源。

“每日挑战全城排行榜”需要一个小后端（`server/leaderboard.js`，见第 6 步）。它只用 Node.js 自带功能，不需要数据库，也不用安装任何依赖。没装后端时，游戏照样能玩，只是不显示全城排行。

---

## 第 1 步：添加子域名解析

在 **腾讯云控制台 → DNSPod（云解析 DNS）→ gmgnclaw.com → 添加记录**：

| 主机记录 | 记录类型 | 记录值 | TTL |
|---|---|---|---|
| `ditie` | A | 你的轻量服务器公网 IP | 600 |

几分钟后，在电脑上执行 `ping ditie.gmgnclaw.com`，能看到服务器 IP 就说明解析生效了。

> 服务器在中国内地的话，域名要备案才能访问；香港和海外地域的服务器不需要。gmgnclaw.com 现在已经能打开另外两个游戏，子域名直接沿用即可。

## 第 2 步：把网站文件放到服务器上

任选一种方式：

**方式 A：网页上传（不用装任何工具）**
1. 下载我发给你的 `ditie-site.zip`（也可以自己在项目里运行 `yarn build`，再把 `out/` 目录打包）。
2. 在轻量服务器控制台点 **登录**，打开 OrcaTerm 网页终端，然后执行：
   ```bash
   sudo mkdir -p /var/www/ditie
   ```
3. 用 OrcaTerm 的 **文件上传** 把 `ditie-site.zip` 传到 `/root`，再执行：
   ```bash
   sudo apt-get install -y unzip 2>/dev/null || sudo yum install -y unzip
   sudo rm -rf /var/www/ditie/*
   sudo unzip -o /root/ditie-site.zip -d /var/www/ditie
   ls /var/www/ditie        # 应该能看到 index.html、_next、404.html
   ```

**方式 B：用脚本上传（在你自己的电脑上，需要能 SSH 登录服务器）**
```bash
SERVER=root@你的服务器IP bash deploy/deploy.sh
```
脚本会先构建，再用 rsync 把 `out/` 同步到服务器的 `/var/www/ditie`。以后更新游戏，再运行一次就行。

## 第 3 步：配置 Nginx

先看服务器上是哪种 Nginx：

**情况 1：直接安装的 Nginx**（已有站点配置在 `/etc/nginx/conf.d/` 或 `/etc/nginx/sites-enabled/`）
```bash
sudo nano /etc/nginx/conf.d/ditie.conf     # 把 deploy/nginx-ditie.conf 的内容粘贴进去
sudo nginx -t                                # 检查配置，显示 successful 才继续
sudo systemctl reload nginx
```
这个配置只匹配 `server_name ditie.gmgnclaw.com`，不会影响已有的两个游戏。

**情况 2：宝塔面板**
1. 打开 **网站 → 添加站点**，域名填 `ditie.gmgnclaw.com`，根目录填 `/var/www/ditie`，PHP 选“纯静态”。
2. 第 2 步的文件传到这个根目录即可，宝塔会自动生成 Nginx 配置。

**情况 3：Docker 里跑的 Nginx**
把 `/var/www/ditie` 挂载进容器，在容器的配置目录里加上 `nginx-ditie.conf`，然后重载容器里的 Nginx。

## 第 4 步：打开游戏

浏览器访问 **http://ditie.gmgnclaw.com**，能看到“地铁冲冲冲！”首页就成功了。

如果打不开，按顺序检查：
1. 轻量服务器控制台 → **防火墙**：80 端口（以及 443）已放行。
2. `ping ditie.gmgnclaw.com` 解析到的是这台服务器的 IP。
3. 在服务器上执行 `curl -H "Host: ditie.gmgnclaw.com" http://127.0.0.1/`，能返回 HTML 说明 Nginx 配置没问题。
4. `sudo tail -n 50 /var/log/nginx/error.log` 查看错误日志。

## 第 5 步（建议）：开启 HTTPS

用 HTTPS 访问，手机浏览器的语音播报和声音会更稳定。

**方式 A：腾讯云免费证书**
1. 在 **SSL 证书 → 申请免费证书** 里，为 `ditie.gmgnclaw.com` 申请证书，验证方式选“自动 DNS 验证”。
2. 签发后下载 **Nginx** 格式的证书，上传到服务器的 `/etc/nginx/ssl/`。
3. 打开 `nginx-ditie.conf` 里被注释掉的 443 配置，确认证书路径无误，然后执行 `nginx -t && systemctl reload nginx`。
4. 如果是宝塔面板：网站 → 设置 → SSL，粘贴证书内容即可。

**方式 B：Let's Encrypt**
```bash
sudo apt-get install -y certbot python3-certbot-nginx   # CentOS 用 yum
sudo certbot --nginx -d ditie.gmgnclaw.com
```

## 第 6 步：开启全城排行榜（每日挑战）

1. **安装 Node.js 18 或更高版本**（服务器上执行 `node -v` 能看到 v18 以上就跳过）：
   ```bash
   # 适用于 x86_64 服务器（Ubuntu / Debian / CentOS 都可以）
   # 国内镜像（npmmirror），下载失败就换成 https://nodejs.org/dist/v20.18.0/node-v20.18.0-linux-x64.tar.xz
   curl -fsSL https://registry.npmmirror.com/-/binary/node/v20.18.0/node-v20.18.0-linux-x64.tar.xz -o /tmp/node.tar.xz
   sudo tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
   node -v
   ```
   如果用宝塔面板，也可以在“软件商店 → Node.js 版本管理器”里装。
2. **上传排行榜程序**：把 `server/leaderboard.js` 传到服务器的 `/opt/ditie/leaderboard.js`。
3. **设置开机自动运行**：把 `deploy/ditie-leaderboard.service` 的内容放到 `/etc/systemd/system/ditie-leaderboard.service`，然后执行：
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now ditie-leaderboard
   curl http://127.0.0.1:3210/api/health      # 能看到 {"ok":true,...} 就是启动成功
   ```
4. **Nginx 转发 `/api/`**：新版 `nginx-ditie.conf` 里已经加了 `location /api/`，用新文件替换后执行 `sudo nginx -t && sudo systemctl reload nginx`。
   - 宝塔面板：在站点的“反向代理”里添加，代理目录填 `/api/`，目标 URL 填 `http://127.0.0.1:3210`。
5. 浏览器打开 `http://ditie.gmgnclaw.com/api/health`，能看到 `{"ok":true,...}` 就全部完成了。之后首页的“今日挑战”卡片会显示全城参加人数和第一名。

说明：
- 成绩存放在 `/var/lib/ditie/daily-日期.json`，只保留最近 30 天。
- 只接受当天的每日挑战成绩，乘客人数由服务器按每站的停车结果重新计算，前端改数字刷分没有用。
- 同一台设备每天只保留最好的一次；每个 IP 每小时最多提交 60 次；名字最多 8 个字，并做了简单的不文明用语过滤。
- 查看服务日志：`sudo journalctl -u ditie-leaderboard -n 50`。

## 以后更新游戏

- 用了脚本：重新运行 `SERVER=root@你的服务器IP bash deploy/deploy.sh`（网站和排行榜程序会一起更新）。
- 用了网页上传：重新 `yarn build`，把新的 `out/` 打包上传，再执行第 2 步的解压命令。如果 `server/leaderboard.js` 也改了，重新上传它，然后执行 `sudo systemctl restart ditie-leaderboard`。

网页本身设置了不缓存，带哈希的 JS、CSS、字体文件设置了长期缓存，所以更新后刷新一下就能看到新版本。
