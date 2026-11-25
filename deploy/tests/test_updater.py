"""Offline transaction tests: real Git, real filesystem exchanges and Node backend.
Only Yarn's expensive build and the systemd/Nginx/public-network boundaries are faked.
"""
import contextlib
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import pwd
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock
import urllib.request

SOURCE = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("updater", SOURCE / "deploy/updater.py")
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)
NODE = shutil.which("node")


def git(path, *args):
    return u.run(["git", "-C", path, *args])


def site(path, title):
    (path / "_next/static").mkdir(parents=True)
    (path / "_next/static/a.js").write_text("// static JS")
    (path / "_next/static/a.css").write_text("body{}")
    (path / "index.html").write_text(
        f'<html><title>{title}</title><script src="/_next/static/a.js"></script>'
        '<link href="/_next/static/a.css" rel="stylesheet"></html>')


class Harness(u.Updater):
    def __init__(self, config, remote):
        super().__init__(config)
        self.remote = remote
        self.process = None
        self.stops = 0
        self.starts = 0
        self.builds = 0
        self.failure = None
        self.runtime = NODE
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            self.port = sock.getsockname()[1]
        self.service("start")
        self.starts = 0

    def build_run(self, args, cwd=None):
        if args[:2] == ["yarn", "install"]:
            if self.failure == "install":
                raise u.Failure("模拟依赖网络失败")
            return ""
        if args[:2] == ["yarn", "build"]:
            self.builds += 1
            if self.failure == "build":
                raise u.Failure("模拟构建失败")
            site(Path(cwd) / "out", self.git("rev-parse", "HEAD"))
            if self.failure == "assets":
                (Path(cwd) / "out/_next/static/a.js").unlink()
            return ""
        return u.run(args, cwd=cwd, env=self.env)

    def git(self, *args):
        if args[0] == "fetch":
            if self.failure == "fetch":
                raise u.Failure("模拟 Git 网络失败")
            return u.run(["git", "-C", self.repo, "fetch", "--no-tags", self.remote, "main"])
        return super().git(*args)

    def preflight(self, update=True):
        if update:
            self.check_repository()
        if update:
            self.api_health()

    def service(self, action):
        if action == "stop":
            self.stops += 1
            if self.process and self.process.poll() is None:
                self.process.terminate()
                self.process.wait(timeout=5)
            return ""
        if action == "start":
            self.starts += 1
            env = dict(os.environ, PORT=str(self.port), HOST="127.0.0.1", DATA_DIR=str(self.data))
            self.process = subprocess.Popen([NODE, str(self.backend / "leaderboard.js")], env=env,
                                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for _ in range(100):
                try:
                    self.api_health()
                    return ""
                except Exception:
                    time.sleep(.02)
            raise u.Failure("fixture 后端启动失败")
        if action == "is-active" and self.process and self.process.poll() is None:
            return "active"
        raise u.Failure("fixture 服务不活跃")

    def properties(self):
        return {"ActiveState": "inactive", "Result": "success", "ExecMainStatus": "0"}

    def api_health(self, online=False):
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/api/health", timeout=2) as response:
            assert json.load(response)["ok"]

    def submit(self, device):
        date = u.datetime.datetime.now(u.datetime.timezone(u.datetime.timedelta(hours=8))).date().isoformat()
        url = f"http://127.0.0.1:{self.port}/api/daily/{date}"
        body = json.dumps(dict(device=device, name="玩家", kinds=["precise"] * 5, score=500)).encode()
        with urllib.request.urlopen(urllib.request.Request(url, body, {"Content-Type": "application/json"}), timeout=2) as response:
            self.assert_response = json.load(response)
        return date

    def health(self):
        self.api_health()
        if self.failure == "health":
            # An accepted score during the failed new release must survive rollback.
            self.submit("new-player-123")
            raise u.Failure("模拟上线后健康检查失败")
        if self.failure == "interrupt":
            raise KeyboardInterrupt()
        if self.failure == "crash":
            raise SystemExit(88)

    def close(self):
        self.service("stop")


@unittest.skipUnless(NODE, "Node.js required")
class Transactions(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.remote = self.base / "remote"
        self.remote.mkdir()
        git(self.remote, "init", "-b", "main")
        git(self.remote, "config", "user.email", "tests@example.invalid")
        git(self.remote, "config", "user.name", "Updater tests")
        (self.remote / "server").mkdir()
        (self.remote / "lib").mkdir()
        shutil.copyfile(SOURCE / "server/leaderboard.js", self.remote / "server/leaderboard.js")
        shutil.copyfile(SOURCE / "lib/rules.js", self.remote / "lib/rules.js")
        git(self.remote, "add", ".")
        git(self.remote, "commit", "-m", "base")
        self.old = git(self.remote, "rev-parse", "HEAD")
        self.repo = self.base / "source"
        u.run(["git", "clone", self.remote, self.repo])
        git(self.repo, "remote", "set-url", "origin", u.REPOSITORY)
        for name in ("website", "backend", "data", "state", "backups"):
            (self.base / name).mkdir()
        site(self.base / "website", "old")
        (self.base / "website/.metro-release").write_text(self.old + "\n")
        shutil.copyfile(SOURCE / "server/leaderboard.js", self.base / "backend/leaderboard.js")
        shutil.copyfile(SOURCE / "lib/rules.js", self.base / "backend/rules.js")
        self.config = dict(web_root=str(self.base / "website"), repository_path=str(self.repo),
                           backend=str(self.base / "backend"), data=str(self.base / "data"),
                           state=str(self.base / "state"), backups=str(self.base / "backups"),
                           tool_path=os.environ["PATH"], build_user=pwd.getpwuid(os.getuid()).pw_name,
                           keep=5, min_free_mb=1)
        self.updater = Harness(self.config, self.remote)
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(self.updater.close)
        self.new_commit()

    def new_commit(self):
        with (self.remote / "server/leaderboard.js").open("a") as stream:
            stream.write(f"\n// new release {time.time_ns()}\n")
        git(self.remote, "add", ".")
        git(self.remote, "commit", "-m", "next")
        self.new = git(self.remote, "rev-parse", "HEAD")

    def marker(self):
        return (self.base / "website/.metro-release").read_text().strip()

    def test_normal_then_repeated_update(self):
        self.updater.update()
        self.assertEqual(self.marker(), self.new)
        self.assertEqual(git(self.repo, "rev-parse", "HEAD"), self.new)
        self.assertEqual(self.updater.starts, 1)
        self.assertEqual(self.updater.stops, 1)
        self.updater.update()
        self.assertEqual(self.updater.builds, 1)
        self.assertEqual(self.updater.starts, 1)
        self.assertFalse((self.base / "state/transaction.json").exists())

    def test_build_failure_leaves_old_site_and_service_running(self):
        self.updater.failure = "build"
        with self.assertRaises(u.Failure):
            self.updater.update()
        self.assertEqual(self.marker(), self.old)
        self.assertEqual(self.updater.stops, 0)
        self.updater.api_health()
        self.assertEqual(list((self.base / "backups").iterdir()), [])

    def test_git_network_failure(self):
        self.updater.failure = "fetch"
        with self.assertRaises(u.Failure):
            self.updater.update()
        self.assertEqual(git(self.repo, "rev-parse", "HEAD"), self.old)
        self.assertEqual(self.marker(), self.old)
        self.assertEqual(self.updater.stops, 0)

    def test_dependency_network_failure_then_retry(self):
        self.updater.failure = "install"
        with self.assertRaises(u.Failure):
            self.updater.update()
        self.assertEqual(self.marker(), self.old)
        self.assertEqual(self.updater.stops, 0)
        self.updater.failure = None
        self.updater.update()
        self.assertEqual(self.marker(), self.new)

    def test_disk_full_after_build_never_stops_old_service(self):
        usage = shutil._ntuple_diskusage(total=1000, used=999, free=1)
        with mock.patch.object(u.shutil, "disk_usage", return_value=usage):
            with self.assertRaisesRegex(u.Failure, "剩余空间"):
                self.updater.update()
        self.assertEqual(self.marker(), self.old)
        self.assertEqual(self.updater.stops, 0)
        self.updater.api_health()

    def test_missing_assets_never_stop_service(self):
        self.updater.failure = "assets"
        with self.assertRaises(u.Failure):
            self.updater.update()
        self.assertEqual(self.marker(), self.old)
        self.assertEqual(self.updater.stops, 0)

    def test_health_failure_restores_program_but_keeps_new_score(self):
        date = self.updater.submit("old-player-123")
        self.updater.failure = "health"
        with self.assertRaises(u.Failure):
            self.updater.update()
        self.assertEqual(self.marker(), self.old)
        data = json.loads((self.base / f"data/daily-{date}.json").read_text())
        self.assertEqual(set(data), {"old-player-123", "new-player-123"})
        backup = next((self.base / "backups").iterdir())
        saved = json.loads((backup / f"data/daily-{date}.json").read_text())
        self.assertEqual(set(saved), {"old-player-123"})
        self.assertEqual((self.base / "backend/leaderboard.js").read_bytes(), (SOURCE / "server/leaderboard.js").read_bytes())

    def test_manual_rollback_keeps_scores(self):
        self.updater.update()
        date = self.updater.submit("later-player-123")
        self.updater.rollback()
        self.assertEqual(self.marker(), self.old)
        saved = json.loads((self.base / f"data/daily-{date}.json").read_text())
        self.assertIn("later-player-123", saved)
        self.assertEqual(len(list((self.base / "backups").iterdir())), 2)

    def test_manual_rollback_with_current_backend_stopped(self):
        self.updater.update()
        self.updater.service("stop")
        self.updater.rollback()
        self.assertEqual(self.marker(), self.old)
        self.updater.api_health()

    def test_selected_backup_rollback(self):
        self.updater.update()
        selected = next((self.base / "backups").iterdir()).name
        self.new_commit()
        self.updater.update()
        self.updater.rollback(selected)
        self.assertEqual(self.marker(), self.old)

    def test_backend_replace_failure_restores_both_files(self):
        original = self.updater.replace_backend
        calls = []
        def fail_once(source):
            calls.append(source)
            if len(calls) == 1:
                shutil.copyfile(source / "leaderboard.js", self.base / "backend/leaderboard.js")
                raise OSError("injected failure before rules replacement")
            return original(source)
        with mock.patch.object(self.updater, "replace_backend", side_effect=fail_once):
            with self.assertRaises(OSError):
                self.updater.update()
        self.assertEqual(self.marker(), self.old)
        self.assertEqual((self.base / "backend/leaderboard.js").read_bytes(), (SOURCE / "server/leaderboard.js").read_bytes())
        self.updater.api_health()

    def test_interrupt_rolls_back(self):
        self.updater.failure = "interrupt"
        with self.assertRaises(KeyboardInterrupt):
            self.updater.update()
        self.assertEqual(self.marker(), self.old)
        self.updater.api_health()

    def test_persistent_journal_recovers_after_process_crash(self):
        # Model SIGKILL by suppressing the in-process restore, leaving the durable journal.
        self.updater.failure = "crash"
        with mock.patch.object(self.updater, "restore", side_effect=SystemExit(88)):
            with self.assertRaises(SystemExit):
                self.updater.update()
        self.assertTrue((self.base / "state/transaction.json").exists())
        with self.assertRaisesRegex(u.Failure, "已恢复"):
            self.updater.recover()
        self.assertEqual(self.marker(), self.old)
        self.updater.api_health()

    def test_unclean_stop_aborts_and_restarts_old_backend(self):
        with mock.patch.object(self.updater, "properties", return_value={
            "ActiveState": "inactive", "Result": "timeout", "ExecMainStatus": "9"
        }):
            with self.assertRaises(u.Failure):
                self.updater.update()
        self.assertEqual(self.marker(), self.old)
        self.updater.api_health()
        self.assertFalse(any((p / "complete.json").exists() for p in (self.base / "backups").iterdir()))

    def test_wrong_branch_and_dirty_checkout_rejected(self):
        git(self.repo, "switch", "-c", "wrong")
        with self.assertRaisesRegex(u.Failure, "main"):
            self.updater.update()
        git(self.repo, "switch", "main")
        (self.repo / "local-secret").write_text("do not overwrite")
        with self.assertRaisesRegex(u.Failure, "不干净"):
            self.updater.update()
        self.assertEqual((self.repo / "local-secret").read_text(), "do not overwrite")

    def test_wrong_remote_rejected_without_logging_it(self):
        git(self.repo, "remote", "set-url", "origin", "https://secret:password@example.invalid/repo")
        with self.assertRaises(u.Failure) as caught:
            self.updater.update()
        self.assertNotIn("secret", str(caught.exception))
        self.assertEqual(self.updater.stops, 0)

    def test_local_ahead_or_diverged_rejected_without_reset(self):
        git(self.repo, "config", "user.email", "tests@example.invalid")
        git(self.repo, "config", "user.name", "tests")
        (self.repo / "local.txt").write_text("local")
        git(self.repo, "add", ".")
        git(self.repo, "commit", "-m", "local commit")
        local = git(self.repo, "rev-parse", "HEAD")
        with self.assertRaises(u.Failure):
            self.updater.update()
        self.assertEqual(git(self.repo, "rev-parse", "HEAD"), local)
        self.assertEqual(self.marker(), self.old)

    def test_five_program_backups_data_snapshots_never_pruned(self):
        for i in range(7):
            folder = self.base / "backups" / f"20261125T00000{i}Z-aaaaaaaa"
            (folder / "program").mkdir(parents=True)
            (folder / "program/website").mkdir()
            (folder / "data").mkdir()
            (folder / "data/score.json").write_text('{"score":1}')
            (folder / "complete.json").write_text('{}')
        self.updater.prune()
        snapshots = list((self.base / "backups").iterdir())
        self.assertEqual(sum((p / "program").exists() for p in snapshots), 5)
        self.assertEqual(sum((p / "data/score.json").exists() for p in snapshots), 7)

    def test_deploy_lock_rejects_concurrent_command(self):
        with (self.base / "state/deploy.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with mock.patch.object(u, "load_config", return_value=self.config), \
                 mock.patch.object(os, "geteuid", return_value=0), \
                 mock.patch.object(sys, "argv", ["updater.py", "update"]):
                with self.assertRaisesRegex(u.Failure, "正在运行"):
                    u.main()


class Validation(unittest.TestCase):
    def test_nginx_actual_root_and_redirect(self):
        config = '''server {listen 80;server_name ditie.gmgnclaw.com;return 301 https://$host$request_uri;}
        server {listen 443 ssl;server_name ditie.gmgnclaw.com;root /var/www/ditie/releases/old;
        location /api/ {proxy_pass http://127.0.0.1:3210;}}
        server {listen 443 ssl;server_name ball.gmgnclaw.com;root /var/www/ball;}'''
        self.assertEqual(u.discover_web_root(config), Path('/var/www/ditie/releases/old'))
        with self.assertRaises(u.Failure):
            u.discover_web_root(config + 'server {listen 443 ssl;server_name ditie.gmgnclaw.com;root /var/www/ditie;}')

    def test_installer_only_installs_no_service_restart_or_deployment(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            bindir = base / "bin"
            bindir.mkdir()
            args = mock.Mock(build_user=pwd.getpwuid(os.getuid()).pw_name, tool_path=os.environ["PATH"])
            checks = mock.Mock(runtime=NODE)
            with contextlib.ExitStack() as stack:
                for key, path in {
                    "CONFIG": base / "config.json", "INSTALL_DIR": base / "installed",
                    "STATE": base / "state", "BACKUPS": base / "backups",
                    "REPO_PATH": base / "repo/source", "BIN_DIR": bindir,
                }.items():
                    stack.enter_context(mock.patch.object(u, key, path))
                stack.enter_context(mock.patch.object(u.shutil, "which", return_value="/usr/bin/tool"))
                stack.enter_context(mock.patch.object(u, "discover_web_root", return_value=base / "web"))
                command = stack.enter_context(mock.patch.object(u, "run", return_value=""))
                stack.enter_context(mock.patch.object(u, "Updater", return_value=checks))
                u.install(args)
                checks.preflight.assert_called_once()
                self.assertEqual(len(command.call_args_list), 2)  # nginx -T and git clone only
                self.assertTrue((bindir / "update-metro").is_file())
                self.assertTrue((bindir / "rollback-metro").is_file())
                self.assertEqual((base / "config.json").stat().st_mode & 0o777, 0o600)
                config = json.loads((base / "config.json").read_text())
                self.assertEqual(config["runtime_node"], NODE)
                self.assertFalse((base / "web").exists())

    def test_local_health_waits_for_service_readiness(self):
        updater = u.Updater(dict(web_root="/unused", repository_path="/unused", tool_path=os.environ["PATH"]))
        with mock.patch.object(updater, "service"), \
             mock.patch.object(updater, "api_health", side_effect=[u.Failure("starting"), None]) as api, \
             mock.patch.object(u.time, "sleep"):
            updater.local_health()
            self.assertEqual(api.call_count, 2)

    def test_service_config_refuses_wrong_data_dir_and_env_file(self):
        updater = u.Updater(dict(web_root="/unused", repository_path="/unused", tool_path=os.environ["PATH"]))
        props = dict(ActiveState="active", ExecStart="/opt/ditie/leaderboard.js", KillSignal="15",
                     Environment="PORT=3210 HOST=127.0.0.1 DATA_DIR=/wrong")
        with mock.patch.object(updater, "properties", return_value=props):
            with self.assertRaisesRegex(u.Failure, "数据目录"):
                updater.check_service()
            props["Environment"] = "PORT=3210 HOST=127.0.0.1 DATA_DIR=/var/lib/ditie"
            props["EnvironmentFiles"] = "/etc/secret.env"
            with self.assertRaisesRegex(u.Failure, "EnvironmentFile"):
                updater.check_service()

    def test_atomic_exchange_keeps_both_directories(self):
        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp) / "a", Path(tmp) / "b"
            a.mkdir(); b.mkdir()
            (a / "old").touch(); (b / "new").touch()
            u.exchange(a, b)
            self.assertTrue((a / "new").exists())
            self.assertTrue((b / "old").exists())

    def test_site_validates_css_fonts_and_missing_html_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            site(root, "test")
            u.validate_site(root)
            (root / "_next/static/a.css").write_text('a{src:url(../media/missing.woff2)}')
            with self.assertRaises(u.Failure):
                u.validate_site(root)

    def test_symlink_artifacts_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            site(root, "test")
            (root / "secret").symlink_to("/etc/passwd")
            with self.assertRaises(u.Failure):
                u.validate_site(root)

    def test_online_checks_reject_default_nginx_page_and_bad_api(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".metro-release").write_text("commit")
            (root / "index.html").write_text("game")
            updater = u.Updater(dict(web_root=str(root), repository_path=str(root), tool_path=os.environ['PATH']))
            with mock.patch.object(updater, "service"), mock.patch.object(updater, "api_health"), \
                 mock.patch.object(updater, "fetch_url", side_effect=["commit", "Welcome to nginx!"]):
                with self.assertRaisesRegex(u.Failure, "HTML"):
                    updater.health()
            with mock.patch.object(updater, "fetch_url", return_value='{"ok":false}'):
                with self.assertRaises(u.Failure):
                    updater.api_health()


if __name__ == "__main__":
    unittest.main(verbosity=2)
