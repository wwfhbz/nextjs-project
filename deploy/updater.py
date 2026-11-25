#!/usr/bin/env python3
"""Server-local deploy transactions. No application/data/schema migrations."""
import argparse
import ctypes
import datetime
import fcntl
import hashlib
import html.parser
import json
import os
from pathlib import Path
import pwd
import re
import shlex
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.parse
import uuid

REPOSITORY = "https://github.com/wwfhbz/nextjs-project.git"
DOMAIN = "ditie.gmgnclaw.com"
SERVICE = "ditie-leaderboard.service"
CONFIG = Path("/etc/ditie-updater.json")
INSTALL_DIR = Path("/usr/local/lib/ditie-updater")
BACKEND = Path("/opt/ditie")
DATA = Path("/var/lib/ditie")
STATE = Path("/var/lib/ditie-updater")
BACKUPS = Path("/var/backups/ditie-updater")
REPO_PATH = Path("/opt/ditie-updater/source")
BIN_DIR = Path("/usr/local/bin")


class Failure(RuntimeError):
    pass


def log(message):
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}", flush=True)


def run(args, *, cwd=None, env=None):
    # Never echo commands, remote URLs, subprocess errors or environment values:
    # Git/network/tool output can contain credentials. Failure logs are stage based.
    result = subprocess.run([str(a) for a in args], cwd=cwd, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True)
    if result.returncode:
        raise Failure(f"{Path(str(args[0])).name} 执行失败（退出码 {result.returncode}）")
    return result.stdout.strip()


def atomic_json(path, value):
    tmp = path.with_name(path.name + ".tmp")
    with tmp.open("w") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(tmp, path)


def exchange(left, right):
    # Both directories remain present: no rename-to-backup / rename-new gap.
    libc = ctypes.CDLL(None, use_errno=True)
    rename = getattr(libc, "renameat2", None)
    if rename is None:
        raise Failure("需要支持 renameat2 的 Ubuntu/glibc")
    if rename(-100, os.fsencode(left), -100, os.fsencode(right), 2):
        raise Failure(f"原子目录交换失败（errno {ctypes.get_errno()}）")


def reject_links(root):
    if root.is_symlink():
        raise Failure("备份/产物中存在符号链接，请先人工检查")
    for directory, dirs, files in os.walk(root):
        for name in dirs + files:
            if (Path(directory) / name).is_symlink():
                raise Failure("备份/产物中存在符号链接，请先人工检查")


def size_of(root):
    return sum(p.stat().st_size for p in root.rglob("*") if p.is_file())


class References(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ("src", "href") and value:
                self.paths.append(value)


def validate_site(root):
    reject_links(root)
    if not (root / "index.html").is_file() or not (root / "index.html").stat().st_size:
        raise Failure("缺少 out/index.html")
    static = root / "_next/static"
    if not static.is_dir() or not list(static.rglob("*.js")):
        raise Failure("缺少 Next.js 静态脚本")
    if not list(static.rglob("*.css")):
        raise Failure("缺少静态样式")
    for page in root.rglob("*.html"):
        parser = References()
        parser.feed(page.read_text())
        for url in parser.paths:
            parsed = urllib.parse.urlsplit(url)
            if parsed.scheme or parsed.netloc:
                continue
            path = urllib.parse.unquote(parsed.path)
            if not path or path.endswith("/"):
                continue
            asset = root / path.lstrip("/") if path.startswith("/") else page.parent / path
            if not asset.resolve().is_relative_to(root.resolve()):
                raise Failure("静态资源路径越界")
            if ("/_next/" in path or asset.suffix in (".js", ".css", ".png", ".ico", ".webmanifest")) and not asset.is_file():
                raise Failure("HTML 引用的本地静态资源缺失")
    for css in static.rglob("*.css"):
        for url in re.findall(r"url\(\s*['\"]?([^)'\"\s]+)", css.read_text()):
            parsed = urllib.parse.urlsplit(url)
            if parsed.scheme or parsed.netloc:
                continue
            name = urllib.parse.unquote(parsed.path)
            asset = root / name.lstrip("/") if name.startswith("/") else css.parent / name
            if not asset.resolve().is_relative_to(root.resolve()) or not asset.is_file():
                raise Failure("CSS 引用的本地静态资源缺失")


def discover_web_root(text):
    # Fail closed on complex/inherited/duplicate vhosts; never rewrite Nginx.
    cleaned = re.sub(r"#.*", "", text)
    roots = set()
    for block in re.findall(r"\bserver\s*\{((?:[^{}]|\{[^{}]*\})*)\}", cleaned, re.S):
        names = re.search(r"\bserver_name\s+([^;]+);", block)
        if not names or DOMAIN not in names.group(1).split():
            continue
        # Ignore certbot redirect-only HTTP blocks.
        if not re.search(r"\blisten\s+[^;]*\b443\b", block):
            continue
        root = re.search(r"\broot\s+([^;]+);", block)
        if not root or "$" in root.group(1):
            raise Failure("HTTPS 站点必须有明确的 root")
        roots.add(Path(root.group(1).strip().strip('\"')).resolve())
    if len(roots) != 1:
        raise Failure("无法唯一确定地铁 HTTPS 网站目录，请先检查 Nginx 配置")
    root = roots.pop()
    base = Path("/var/www/ditie")
    if root != base and not root.is_relative_to(base):
        raise Failure("Nginx 根目录不在 /var/www/ditie 内，拒绝自动安装")
    return root


class Updater:
    def __init__(self, config):
        self.config = config
        self.web = Path(config["web_root"])
        self.repo = Path(config["repository_path"])
        self.state = Path(config.get("state", str(STATE)))
        self.backups = Path(config.get("backups", str(BACKUPS)))
        self.backend = Path(config.get("backend", str(BACKEND)))
        self.data = Path(config.get("data", str(DATA)))
        self.env = dict(os.environ, PATH=config["tool_path"], GIT_TERMINAL_PROMPT="0",
                        NEXT_TELEMETRY_DISABLED="1")
        self.stopped = False
        self.transaction = None

    def build_run(self, args, cwd=None):
        return run(["runuser", "-u", self.config["build_user"], "--", "env",
                    "PATH=" + self.env["PATH"], "GIT_TERMINAL_PROMPT=0",
                    "NEXT_TELEMETRY_DISABLED=1", *args], cwd=cwd, env=self.env)

    def git(self, *args):
        return self.build_run(["git", "-C", str(self.repo), *args])

    def service(self, action):
        return run(["systemctl", action, SERVICE], env=self.env)

    def properties(self):
        output = run(["systemctl", "show", SERVICE,
                      "--property=ExecStart,Environment,EnvironmentFiles,ActiveState,MainPID,Result,ExecMainStatus,KillSignal"], env=self.env)
        return dict(line.split("=", 1) for line in output.splitlines() if "=" in line)

    def fetch_url(self, url):
        return run(["curl", "--fail", "--silent", "--show-error", "--connect-timeout", "5",
                    "--max-time", "15", "--proto", "=http,https", url], env=self.env)

    def api_health(self, online=False):
        url = f"https://{DOMAIN}/api/health" if online else "http://127.0.0.1:3210/api/health"
        try:
            if json.loads(self.fetch_url(url)).get("ok") is not True:
                raise ValueError()
        except (ValueError, AttributeError):
            raise Failure("排行榜健康响应不是 ok=true") from None

    def local_health(self):
        for attempt in range(10):
            try:
                self.service("is-active")
                self.api_health()
                break
            except Failure:
                if attempt == 9:
                    raise Failure("本地排行榜健康检查失败") from None
                time.sleep(1)
        log("本地 API 检查通过")

    def health(self):
        self.local_health()
        expected = (self.web / ".metro-release").read_text().strip()
        if self.fetch_url(f"https://{DOMAIN}/.metro-release?check={uuid.uuid4().hex}").strip() != expected:
            raise Failure("线上版本标记不匹配（检查 Nginx root、缓存和 DNS）")
        # Compare HTML content, not just HTTP 200 (the default Nginx page is 200 too).
        remote = self.fetch_url(f"https://{DOMAIN}/?check={uuid.uuid4().hex}")
        if hashlib.sha256(remote.encode()).digest() != hashlib.sha256((self.web / "index.html").read_text().strip().encode()).digest():
            raise Failure("线上 HTML 与当前发布不匹配")
        self.api_health(online=True)
        log("线上 HTML、版本标记和 API 检查通过")

    def check_service(self, require_healthy=True):
        props = self.properties()
        if require_healthy and props.get("ActiveState") != "active":
            raise Failure("现有排行榜服务未运行，拒绝更新")
        if str(self.backend / "leaderboard.js") not in props.get("ExecStart", ""):
            raise Failure("systemd 的排行榜程序路径不匹配")
        variables = shlex.split(props.get("Environment", ""))
        for setting in ("PORT=3210", "HOST=127.0.0.1", f"DATA_DIR={self.data}"):
            if setting not in variables:
                raise Failure("systemd 的端口、监听地址或数据目录不匹配")
        if props.get("EnvironmentFiles"):
            raise Failure("服务存在 EnvironmentFile，请先人工核对实际数据目录")
        if props.get("KillSignal") not in ("15", "SIGTERM"):
            raise Failure("服务必须使用 SIGTERM 以刷盘备份")
        try:
            runtime = Path(f"/proc/{int(props['MainPID'])}/exe").resolve(strict=True)
        except (KeyError, ValueError, OSError):
            if require_healthy or not self.config.get("runtime_node"):
                raise Failure("无法核对排行榜运行时") from None
            runtime = Path(self.config["runtime_node"]).resolve(strict=True)
        self.runtime = str(runtime)
        if int(run([self.runtime, "-p", "process.versions.node.split('.')[0]"])) < 18:
            raise Failure("排行榜运行时需要 Node.js 18+")
        if require_healthy:
            self.api_health()

    def preflight(self, update=True):
        for command in ("git", "node", "curl", "systemctl", "nginx", "runuser"):
            if not shutil.which(command, path=self.env["PATH"]):
                raise Failure(f"缺少工具：{command}")
        if update:
            if not shutil.which("yarn", path=self.env["PATH"]):
                raise Failure("缺少 Yarn Classic 1.x（不会自动安装或修改全局 Node.js）")
            if not self.build_run(["yarn", "--version"]).startswith("1."):
                raise Failure("需要 Yarn Classic 1.x")
            if int(self.build_run(["node", "-p", "process.versions.node.split('.')[0]"])) < 18:
                raise Failure("构建需要 Node.js 18+")
            self.check_repository()
        nginx = run(["nginx", "-T"], env=self.env)
        if discover_web_root(nginx) != self.web:
            raise Failure("Nginx 根目录已变更，请重新核对安装配置")
        if not self.web.is_dir() or self.web.is_symlink() or os.path.ismount(self.web):
            raise Failure("网站必须是本地普通目录且不能是挂载点")
        for file in (self.web / "index.html", self.backend / "leaderboard.js", self.backend / "rules.js"):
            if not file.is_file() or file.is_symlink():
                raise Failure("现有站点/排行榜程序缺失或是符号链接")
        self.check_service(require_healthy=update)
        if update:
            # Rollback is also available when the current backend/site is unhealthy.
            online = self.fetch_url(f"https://{DOMAIN}/?check={uuid.uuid4().hex}")
            if online != (self.web / "index.html").read_text().strip():
                raise Failure("线上首页与 Nginx 根目录不匹配，拒绝发布")
            self.api_health(online=True)
        if not self.data.is_dir():
            raise Failure("排行榜数据目录不存在")
        reject_links(self.data.resolve())
        required = max(int(self.config.get("min_free_mb", 2048)) * 1024 ** 2,
                       size_of(self.web) * 3 + size_of(self.data) * 2 + 256 * 1024 ** 2)
        for path in (self.web.parent, self.backend, self.state, self.backups, self.repo):
            if not os.access(path, os.W_OK) or shutil.disk_usage(path).free < required:
                raise Failure("权限不足或磁盘剩余空间不足（默认至少 2 GiB）")
        # Verify the filesystem supports the exact operation BEFORE service downtime.
        with tempfile.TemporaryDirectory(prefix=".metro-probe-", dir=self.web.parent) as tmp:
            left, right = Path(tmp) / "a", Path(tmp) / "b"
            left.mkdir(); right.mkdir()
            exchange(left, right)
        log("工具、仓库、磁盘、Nginx 根目录和排行榜配置检查通过")

    def check_repository(self):
        urls = self.git("remote", "get-url", "--all", "origin").splitlines()
        if urls != [REPOSITORY]:
            raise Failure("origin 必须是指定的 GitHub 仓库 HTTPS 地址")
        if self.git("symbolic-ref", "--short", "HEAD") != "main":
            raise Failure("源码仓库必须位于 main 分支")
        if self.git("status", "--porcelain", "--untracked-files=all", "--ignored"):
            raise Failure("源码仓库不干净（含未跟踪/忽略文件），不会覆盖本地修改")

    def save_journal(self):
        atomic_json(self.state / "transaction.json", self.transaction)

    def backup(self, stage, target):
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + "-" + uuid.uuid4().hex[:8]
        required = size_of(self.web) * 2 + size_of(self.data) + 64 * 1024 ** 2
        for path in (self.backups, self.web.parent):
            if shutil.disk_usage(path).free < required:
                raise Failure("构建后剩余空间不足以备份及回滚，原服务继续运行")
        backup = self.backups / stamp
        backup.mkdir(mode=0o700)
        (backup / "program").mkdir()
        shutil.copytree(self.web, backup / "program/website")
        for name in ("leaderboard.js", "rules.js"):
            shutil.copy2(self.backend / name, backup / "program" / name)
        version = (self.web / ".metro-release").read_text().strip() if (self.web / ".metro-release").exists() else "unknown (首次接管)"
        atomic_json(backup / "metadata.json", {"version": version, "created": stamp})
        self.transaction = {"backup": str(backup), "stage": str(stage), "previous": version,
                            "target": target}
        self.save_journal()  # Also recover if interrupted while the service is stopped.
        # The backend flushes its dirty JSON on SIGTERM. Only copy after clean exit.
        self.stopped = True
        self.service("stop")
        props = self.properties()
        if props.get("ActiveState") != "inactive" or props.get("Result") != "success" or props.get("ExecMainStatus") != "0":
            raise Failure("排行榜未正常退出，拒绝备份不一致的数据")
        reject_links(self.data.resolve())
        shutil.copytree(self.data.resolve(), backup / "data")
        atomic_json(backup / "complete.json", {"consistent_data": True})
        log(f"一致性备份完成：{stamp}；原版本：{version}")
        return backup

    def replace_backend(self, source):
        for name in ("leaderboard.js", "rules.js"):
            target = self.backend / name
            tmp = target.with_name("." + name + ".metro-tmp")
            shutil.copyfile(source / name, tmp)
            os.chmod(tmp, 0o644)
            os.replace(tmp, target)

    def restore(self):
        tx = self.transaction
        backup = Path(tx["backup"])
        log("恢复上一版程序，保留当前全部排行榜数据")
        self.stopped = True
        self.service("stop")
        self.replace_backend(backup / "program")
        # Re-copy rather than exchange blindly: handles crash between exchange and journal update.
        stage = Path(tx["stage"])
        if stage.exists():
            shutil.rmtree(stage)
        shutil.copytree(backup / "program/website", stage)
        exchange(self.web, stage)
        self.service("start")
        self.stopped = False
        self.local_health()
        atomic_json(self.state / "current.json", {"version": tx["previous"]})
        (self.state / "transaction.json").unlink()
        self.transaction = None
        shutil.rmtree(stage)
        log("原程序已恢复，本地 API 检查通过；成绩目录未恢复、未覆盖")

    def deploy(self, website, backend_source, version):
        # Stage on website's own filesystem; service is still running during this copy.
        stage = Path(tempfile.mkdtemp(prefix=".ditie-stage-", dir=self.web.parent))
        stage.rmdir()
        shutil.copytree(website, stage)
        (stage / ".metro-release").write_text(version + "\n")
        for directory, dirs, files in os.walk(stage):
            os.chmod(directory, 0o755)
            for name in files:
                os.chmod(Path(directory) / name, 0o644)
        try:
            backup = self.backup(stage, version)
            previous = json.loads((backup / "metadata.json").read_text())["version"]
            exchange(self.web, stage)
            self.replace_backend(backend_source)
            self.service("start")
            self.stopped = False
            self.health()
            atomic_json(self.state / "current.json", {"version": version, "backup": backup.name})
            (self.state / "transaction.json").unlink()
            self.transaction = None
            log(f"更新前：{previous}；更新后：{version}")
        except BaseException:
            if self.transaction:
                self.restore()
            elif self.stopped:
                self.service("start")
                self.stopped = False
            raise
        finally:
            if self.transaction is None and stage.exists():
                shutil.rmtree(stage)
        self.prune()

    def prune(self):
        complete = sorted((p for p in self.backups.iterdir() if (p / "complete.json").is_file()), reverse=True)
        keep = int(self.config.get("keep", 5))
        for old in complete[keep:]:
            # Data snapshots are never auto-deleted. Only prune program backups.
            if (old / "program").is_dir():
                shutil.rmtree(old / "program")
        log(f"保留最近 {keep} 份程序备份；数据备份不自动删除")

    def recover(self):
        journal = self.state / "transaction.json"
        if journal.exists():
            self.transaction = json.loads(journal.read_text())
            self.restore()
            raise Failure("已恢复上次中断的发布，请重新运行命令")

    def update(self):
        self.preflight()
        before = self.git("rev-parse", "HEAD")
        log(f"拉取 main；本地源码提交：{before}")
        self.git("fetch", "--no-tags", "origin", "main")
        after = self.git("rev-parse", "FETCH_HEAD")
        self.git("merge-base", "--is-ancestor", "HEAD", after)
        self.git("merge", "--ff-only", after)
        marker = self.web / ".metro-release"
        if marker.exists() and marker.read_text().strip() == after:
            validate_site(self.web)
            self.health()
            log(f"已经是 main 最新版本：{after}；无需构建或重启")
            return
        # Archive the verified commit: never install packages or build in the checkout.
        work = Path(tempfile.mkdtemp(prefix="build-", dir=self.repo.parent))
        owner = pwd.getpwnam(self.config["build_user"])
        os.chown(work, owner.pw_uid, owner.pw_gid)
        try:
            archive = work / "source.tar"
            self.git("archive", "--format=tar", "--output=" + str(archive), after)
            self.build_run(["tar", "-xf", str(archive), "-C", str(work)])
            archive.unlink()
            log("在独立目录安装依赖并构建（原网站继续运行）")
            self.build_run(["yarn", "install", "--frozen-lockfile", "--non-interactive"], cwd=work)
            self.build_run(["yarn", "build"], cwd=work)
            validate_site(work / "out")
            for source in (work / "server/leaderboard.js", work / "lib/rules.js"):
                run([self.runtime, "--check", source])
            # Validate pair together without importing/starting the leaderboard (which cleans data).
            self.build_run(["node", "-e", "require('./lib/rules.js')"], cwd=work)
            pair = work / "backend"
            pair.mkdir()
            shutil.copyfile(work / "server/leaderboard.js", pair / "leaderboard.js")
            shutil.copyfile(work / "lib/rules.js", pair / "rules.js")
            log("构建和静态资源完整性检查通过")
            self.deploy(work / "out", pair, after)
        finally:
            shutil.rmtree(work)

    def rollback(self, identifier=None):
        self.preflight(update=False)
        available = sorted((p for p in self.backups.iterdir() if (p / "complete.json").is_file()
                            and (p / "program/website").is_dir()), reverse=True)
        if identifier:
            if not re.fullmatch(r"\d{8}T\d{12}Z-[a-f0-9]{8}", identifier):
                raise Failure("无效的备份编号")
            available = [p for p in available if p.name == identifier]
        if not available:
            raise Failure("没有可用的程序备份")
        backup = available[0]
        reject_links(backup / "program")
        for name in ("leaderboard.js", "rules.js"):
            run([self.runtime, "--check", backup / "program" / name])
        version = json.loads((backup / "metadata.json").read_text())["version"]
        log(f"回滚目标：{backup.name}，版本：{version}")
        # Legacy versions do not have updater markers, but get one in their new staging copy.
        self.deploy(backup / "program/website", backup / "program", version)


def load_config():
    if CONFIG.is_symlink() or CONFIG.stat().st_uid != 0 or CONFIG.stat().st_mode & 0o022:
        raise Failure("更新器配置必须归 root 所有且不可被其他用户写入")
    return json.loads(CONFIG.read_text())


def install(args):
    if CONFIG.exists() or CONFIG.is_symlink() or INSTALL_DIR.exists() or INSTALL_DIR.is_symlink():
        raise Failure("更新器已安装；不会覆盖现有配置，请按 README 的升级说明操作")
    account = pwd.getpwnam(args.build_user)
    if account.pw_uid == 0:
        raise Failure("构建用户必须是非 root 用户")
    tool_path = args.tool_path or os.environ.get("PATH", "")
    for command in ("node", "yarn", "git", "nginx", "systemctl", "runuser", "curl"):
        if not shutil.which(command, path=tool_path):
            raise Failure(f"缺少 {command}，请先安装/指定 --tool-path（安装器不改全局环境）")
    root = discover_web_root(run(["nginx", "-T"], env=dict(os.environ, PATH=tool_path)))
    for name in ("update-metro", "rollback-metro"):
        if (BIN_DIR / name).exists() or (BIN_DIR / name).is_symlink():
            raise Failure(f"命令 {name} 已存在，拒绝覆盖")
    repository = REPO_PATH
    repository.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    os.chmod(repository.parent, 0o755)
    STATE.mkdir(mode=0o700, exist_ok=True)
    BACKUPS.mkdir(mode=0o700, parents=True, exist_ok=True)
    if not repository.exists():
        repository.mkdir()
        os.chown(repository, account.pw_uid, account.pw_gid)
        run(["runuser", "-u", account.pw_name, "--", "env", "PATH=" + tool_path,
             "GIT_TERMINAL_PROMPT=0", "git", "clone", "--branch", "main", "--single-branch",
             REPOSITORY, str(repository)])
    config = dict(web_root=str(root), repository_path=str(repository), build_user=account.pw_name,
                  tool_path=tool_path, keep=5, min_free_mb=2048)
    updater = Updater(config)
    updater.preflight()
    config["runtime_node"] = updater.runtime
    created_commands = []
    try:
        INSTALL_DIR.mkdir(parents=True, mode=0o755)
        for name in ("update.sh", "rollback.sh", "updater.py"):
            destination = INSTALL_DIR / name
            shutil.copyfile(Path(__file__).parent / name, destination)
            os.chmod(destination, 0o755)
        for name, script in (("update-metro", "update.sh"), ("rollback-metro", "rollback.sh")):
            command = BIN_DIR / name
            # Exclusive creation; never overwrite a pre-existing command or symlink.
            with command.open("x") as output:
                created_commands.append(command)
                output.write(f'#!/usr/bin/env bash\nset -euo pipefail\nexec sudo -- {INSTALL_DIR / script} "$@"\n')
            os.chmod(command, 0o755)
        atomic_json(CONFIG, config)
        os.chmod(CONFIG, 0o600)
    except BaseException:
        for command in created_commands:
            command.unlink(missing_ok=True)
        if INSTALL_DIR.exists():
            shutil.rmtree(INSTALL_DIR)
        CONFIG.unlink(missing_ok=True)
        raise
    log(f"安装完成；已核对实际网站目录：{root}")
    log("尚未部署，也没有重启服务。首次更新：update-metro；回滚：rollback-metro")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("install", "update", "rollback"))
    parser.add_argument("backup", nargs="?")
    parser.add_argument("--build-user", default=os.environ.get("SUDO_USER", "ubuntu"))
    parser.add_argument("--tool-path", help="现有 Node.js/Yarn 的 PATH；不会安装或替换全局工具")
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise Failure("请使用 sudo 运行安装脚本或已安装命令")
    os.umask(0o077)
    def interrupted(signum, frame):
        raise Failure(f"收到信号 {signum}，停止操作")
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    started = time.monotonic()
    if args.action == "install":
        # Install shares the same lock as update/rollback.
        STATE.mkdir(mode=0o700, exist_ok=True)
    config = None if args.action == "install" else load_config()
    state = STATE if config is None else Path(config.get("state", str(STATE)))
    with (state / "deploy.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Failure("已有更新/回滚/安装正在运行") from None
        try:
            if args.action == "install":
                install(args)
            else:
                updater = Updater(config)
                updater.recover()
                if args.action == "update":
                    updater.update()
                else:
                    updater.rollback(args.backup)
        finally:
            log(f"总耗时：{time.monotonic() - started:.1f} 秒")


if __name__ == "__main__":
    try:
        main()
    except (Failure, OSError, ValueError, KeyError) as error:
        # OSError may include paths, but never print subprocess output or config content.
        log(f"操作失败：{error}")
        sys.exit(1)
