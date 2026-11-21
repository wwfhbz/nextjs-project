# 部署到腾讯云轻量应用服务器

目标：在已有的轻量应用服务器上，用子域名 **ditie.gmgnclaw.com** 打开游戏，不影响服务器上已有的两个游戏。

游戏是纯静态网站（`yarn build` 后的 `out/` 目录，约 3 MB）。不需要 Node.js、数据库，也不需要后台进程，Nginx 直接提供文件就行。字体、脚本全部打包在网站里，不依赖 Google 等境外资源。

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

## 以后更新游戏

- 用了脚本：重新运行 `SERVER=root@你的服务器IP bash deploy/deploy.sh`。
- 用了网页上传：重新 `yarn build`，把新的 `out/` 打包上传，再执行第 2 步的解压命令。

网页本身设置了不缓存，带哈希的 JS、CSS、字体文件设置了长期缓存，所以更新后刷新一下就能看到新版本。
