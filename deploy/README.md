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
2. **上传排行榜程序**：把 `server/leaderboard.js` 和 `lib/rules.js` 两个文件都传到服务器的 `/opt/ditie/` 目录（`rules.js` 是接乘客规则，排行榜用它重新计算人数）。
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
- 用了网页上传：重新 `yarn build`，把新的 `out/` 打包上传，再执行第 2 步的解压命令。如果 `server/leaderboard.js` 或 `lib/rules.js` 改了，重新上传到 `/opt/ditie/`，然后执行 `sudo systemctl restart ditie-leaderboard`。

网页本身设置了不缓存，带哈希的 JS、CSS、字体文件设置了长期缓存，所以更新后刷新一下就能看到新版本。

## 服务器本地一键更新（Ubuntu）

安装本节的更新器后，在腾讯云终端执行：

```bash
update-metro
```

每次都获取指定仓库 `main` 的最新提交，不按 `package.json` 版本号或 tag 固定版本。
原有 `deploy/deploy.sh` 保持原样；不要在本地更新器运行期间使用旧上传方式，旧脚本不参与互斥锁。

### 首次安装

以下操作在腾讯云 Ubuntu 终端以 `ubuntu` 用户执行。**请等此功能的 PR 合并到 main 后安装**。
已有游戏、排行榜和 HTTPS 必须已正常部署；本安装器不是首次网站/后端安装器。

先确认现有工具：

```bash
git --version
node --version          # Node.js >= 18；推荐现有兼容的 LTS
command -v node
yarn --version          # 必须为 Yarn Classic 1.x
command -v yarn
python3 --version      # Ubuntu 22.04+，Python >= 3.10
sudo nginx -t
sudo systemctl status ditie-leaderboard.service --no-pager
curl --fail http://127.0.0.1:3210/api/health
curl --fail https://ditie.gmgnclaw.com/api/health
```

更新器不会安装、覆盖或升级系统全局 Node.js/Yarn。缺工具时先准备好现有工具环境。
然后在一个新的目录下载并安装：

```bash
INSTALL_SOURCE="$(mktemp -d "$HOME/metro-updater-install.XXXXXX")"
git clone --branch main --single-branch \
  https://github.com/wwfhbz/nextjs-project.git "$INSTALL_SOURCE"
cd "$INSTALL_SOURCE"
sudo bash deploy/install-updater.sh \
  --build-user ubuntu --tool-path "$PATH"
```

`--tool-path "$PATH"` 记录当前可用 Node.js/Yarn 的搜索路径（适用于用户已有的 NVM 环境）；
不要填临时构建目录，后续该路径中的工具必须一直存在。排行榜实际 Node.js 路径会单独从运行进程核对。
Git、依赖安装和构建均以 `--build-user` 指定的非 root 用户执行；只有发布、备份和单项服务操作使用 sudo。
安装过程会克隆一个独立的 main 工作区，不使用或覆盖你原来的游戏代码目录。

安装器只安装命令和配置，**不会自动更新生产网站、停止服务、修改 Nginx 或重新申请证书**。
它会只读检查 `nginx -T`、systemd、现有首页和 API：

- HTTPS 域名必须明确匹配 `ditie.gmgnclaw.com`，并且只有一个实际根目录。
- 兼容 `/var/www/ditie`，也兼容旧部署中指向 `/var/www/ditie/releases/<目录>` 的 root，使用实际生效目录，不自动修改 Nginx。
- 需要常规 Ubuntu Nginx server 块；变量 root、无法解析的嵌套配置、多个 HTTPS root、容器内 Nginx 均会拒绝安装，需要先人工核对。
- `ditie-leaderboard.service` 必须已运行，程序为 `/opt/ditie/leaderboard.js`，环境明确设置 `PORT=3210`、`HOST=127.0.0.1`、`DATA_DIR=/var/lib/ditie`，停止信号为 SIGTERM。
- 为避免隐藏的数据目录覆盖，有额外 `EnvironmentFile` 的服务会拒绝自动安装。
- `DynamicUser=yes` 导致 `/var/lib/ditie` 指向 `/var/lib/private/ditie` 时，会解析真实目录进行只读备份，保持原服务配置。
- 网站必须是本地普通目录，不是挂载点；文件系统需要支持 Linux `renameat2(RENAME_EXCHANGE)`。安装会先在同一文件系统创建两个空目录试验。
- 至少需要 2 GiB 剩余磁盘空间；若网站或成绩数据较大，会进一步提高空间要求，并在构建后再次检查。

如果上面任一检查失败，安装器会停止，且不切换生产文件。可能留下专用源码目录，可修正条件后重试。
请勿用删除排行榜数据、替换全局 Node.js 或重写其他站点配置的方式绕过检查。
当前开发环境无法 SSH 访问生产服务器，尚未独立核实生产当前路径；上述本地检查是实际安装的必要条件。

### 安装后的目录与权限

| 路径 | 用途 |
|---|---|
| `/usr/local/bin/update-metro` | 一键更新入口，通过 sudo 请求发布权限 |
| `/usr/local/bin/rollback-metro` | 回滚入口，同样使用 sudo |
| `/usr/local/lib/ditie-updater/` | root 持有的更新器程序，不从用户可写源码执行特权脚本 |
| `/etc/ditie-updater.json` | root 可读写配置，记录实际网站路径、构建用户与工具 PATH |
| `/opt/ditie-updater/source` | 独立 main 源码工作区，属于构建用户 |
| `/opt/ditie-updater/build-*` | 临时构建目录，结束后清理；强制断电可能留残余 |
| `/var/lib/ditie-updater/` | 部署锁、当前版本元数据及中断恢复事务记录 |
| `/var/backups/ditie-updater/<备份编号>/program/` | 上一个网站与两个排行榜程序文件 |
| `/var/backups/ditie-updater/<备份编号>/data/` | 停服刷盘后的一致性成绩快照，root 私有 |

没有添加免密 sudo 规则。若当前账户的 sudo 需要密码，运行命令时正常输入即可。
安装器不会覆盖已有 `update-metro`、`rollback-metro` 或已安装配置。

### 更新流程与故障行为

1. 更新、安装和回滚共享同一个 `flock` 非阻塞互斥锁，重复并发命令立即报错。
2. 核对 origin 必须为此仓库的 HTTPS 地址、当前分支必须为 main、工作区必须完全干净。
   包括忽略文件、未跟踪文件与本地修改均不会被删除或覆盖；不要在专用源码目录放 `.env` 或运行构建。
3. `git fetch origin main` 后验证本地 HEAD 是远端提交的祖先，再执行 `git merge --ff-only`。
   本地超前、分叉或远端重写历史会停止；不用 `git reset --hard`、force 或自动 stash。
4. 从核实的提交导出到独立临时目录，执行 `yarn install --frozen-lockfile --non-interactive`、`yarn build`。
   构建失败、网络失败、缺少静态资源时，旧网站和排行榜服务始终继续运行；下次可直接重试。
5. 检查 `out/index.html`、JS/CSS、HTML 本地资源和 CSS 字体引用以及后端语法；拒绝符号链接产物。
6. 成功后先暂存网站及备份旧程序；再仅停止 `ditie-leaderboard.service`，等待 SIGTERM 刷盘正常退出，复制一致性成绩快照。
   暂停只影响排行榜读写，静态游戏页面仍可访问。不是零停机排行榜更新；备份数据越大暂停越久。
7. 用原子目录交换切换网站，在服务停止时替换 `/opt/ditie/leaderboard.js` 和 `rules.js`，然后启动同一项服务。
   不修改 `rules.js` 内容、数据保留规则或 systemd 配置，不触碰其他游戏、Nginx、证书或 Node.js 进程。
8. 检查本地 API、线上 API 的 `ok=true`、线上 HTML 与磁盘内容一致，并核对 `/.metro-release` 提交标记。
   不是仅检查 HTTP 200，避免误把 Nginx 欢迎页当成成功。正常 TLS 验证保持开启，不跳过证书校验。
9. 新发布失败会恢复旧程序并重新启动本项服务；**绝不把旧 data 快照覆盖回生产成绩目录**。
   新版运行期间已接收并刷盘的成绩也保留。原有后端自行执行的 30 天清理规则不变。
10. 输出提交号、阶段检查结果及总耗时；第三方命令输出不直接打印，防止 Git URL、环境或依赖日志带出凭据。
    首次接管现有站点时无法推断旧提交号，明确显示 `unknown (首次接管)`，不会猜测。

如果 main 提交与已发布的标记一致，仍做健康检查，但不构建、不创建备份、不重启服务。
如果人工修改了网站文件导致线上首页或版本检查不通过，会停止并要求核对。
更新器本身不自动从 main 替换特权脚本；main 的游戏和排行榜程序会持续更新，不固定版本。

### 回滚

回滚到最近一份可用程序备份（无需下载或重新构建）：

```bash
rollback-metro
```

查看可用备份编号，并指定回滚目标：

```bash
sudo find /var/backups/ditie-updater -mindepth 2 -maxdepth 2 \
  -type d -name program -printf '%h\n' | sort -r
rollback-metro 备份编号
```

回滚前同样备份当前程序和一致性数据，发布后检查本地及线上服务；即使当前后端已停止也可回滚（使用安装时核对的 Node.js 路径），回滚失败会恢复回滚前的程序。
默认保留最近 **5 份程序备份**（更新与回滚合并计数）。数据快照不自动删除，也不自动恢复，
因此随着更新次数增加会占用空间；空间不足时更新器拒绝发布。成绩生产目录从不被更新器清空或覆盖。

命令被 Ctrl+C 或 SIGTERM 中断时尝试恢复程序。若被 SIGKILL、断电或系统崩溃打断，
持久化事务会保留；重新执行 `update-metro` 或 `rollback-metro` 时先恢复原程序并退出，确认后再运行一次。
这不是开机自动恢复服务；异常停电后应及时运行一次命令检查。若恢复本身失败，保留事务与备份，不清理现场，
先检查磁盘空间和 `sudo journalctl -u ditie-leaderboard.service -n 50 --no-pager`，不要手动恢复旧 data 覆盖新成绩。

### 更新器自身升级

日常只需 `update-metro`。仅当更新器程序有修复时，先从最新 main 获取并审查 `deploy/` 变更。
确认没有更新或回滚运行后，以 root 在 `/var/lib/ditie-updater/deploy.lock` 的排他锁内备份并替换
`/usr/local/lib/ditie-updater/` 下的 `update.sh`、`rollback.sh`、`updater.py`，保持 root 所有及 0755 权限；
不要删除状态、程序备份或成绩目录，不重装全局 Node.js。

### 开发验证（非生产）

```bash
bash -n deploy/update.sh deploy/install-updater.sh deploy/rollback.sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s deploy/tests -v
```

测试使用临时目录和真实 Git 仓库、真实 Node.js 排行榜、真实原子目录交换；
依赖下载/Next 构建、systemd、Nginx 和公网访问边界由测试替身模拟。
覆盖正常更新、重复更新、构建/依赖/Git 网络失败、缺失资源、上线健康失败、保留新成绩的自动/手动回滚、
中断恢复、异常停服、仓库地址/分支/本地修改/分叉保护、互斥锁及备份保留。
真实 Next.js 构建单独验证，不在生产服务器运行故障注入测试。
