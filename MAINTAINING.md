# 维护说明

本仓库是 [libnoname/noname](https://github.com/libnoname/noname) 的个人维护版本：在上游基础上维护自己的改动，同时持续跟进上游更新。

## 仓库结构

| Remote | 地址 | 用途 |
| --- | --- | --- |
| `upstream` | `libnoname/noname` | 上游，**只读**（push 已设为 `DISABLE`） |
| `origin` | `King-sj/knoname` | 本仓库，只推这里 |

| 分支 | 用途 |
| --- | --- |
| `main` | 上游镜像。只做 fast-forward，**不放任何自己的改动** |
| `custom` | 自己的版本，所有改动都在这里 |

`main` 保持与上游完全一致，是为了让 `git diff upstream/main..custom` 永远只显示「我改了什么」，也为了让同步永远是一次干净的快进。

## 日常：同步上游

```bash
git fetch upstream
git checkout main
git merge --ff-only upstream/main      # 拉上游更新
git push origin main                   # 备份到自己的远程

git checkout custom
git rebase main                        # 把改动重放到新版之上
git push --force-with-lease origin custom
```

两个要点：

- `--ff-only` 是护栏。一旦 `main` 上不小心有了自己的提交，它会直接报错拦住，而不是悄悄生成一个合并提交。
- rebase 之后推送 `custom` 必须用 `--force-with-lease`（历史被重写了）。不要图省事用 `--force`——`--force-with-lease` 会在远程存在你尚未拉取的提交时拒绝推送。

## 冲突处理

仓库已开启 `rerere`（`rerere.enabled` + `rerere.autoupdate`），同一个冲突只会让你解一次，之后的同步会自动复用上次的解法。

冲突时手动解决后：

```bash
git add <冲突文件>
git rebase --continue
```

想中途放弃：`git rebase --abort`。

## 新增内容放在哪

**优先写成扩展**，放在 `apps/core/extension/<扩展名>/`：

- 最简参考：`apps/core/extension/boss/extension.js`（单文件形式）
- 模板：`scripts/extension-template/`（TypeScript + vite）

扩展是仓库里的一批**新目录**，同步上游时属于纯新增，不会产生冲突。这是本仓库主要的改动形式。

确实需要改上游源码时，改动尽量集中在一处，并记录到下面的清单里，方便同步冲突时判断取舍。

## 改动清单

| 文件 / 目录 | 改动 | 原因 |
| --- | --- | --- |
| `apps/core/extension/` | 自建扩展 | 见各扩展目录 |
| （按需补充） | | |

## 新机器初始化

clone 之后需要手动补几项本地配置（它们不进版本库）：

```bash
git remote set-url --push upstream DISABLE   # 禁止误推上游
git config rerere.enabled true
git config rerere.autoupdate true

# 本地第三方目录不进版本库，需自行 clone 后忽略
echo "3rd/" >> .git/info/exclude
```

`3rd/` 下放的是独立仓库的 clone（例如 decadeUI），它们有自己的 git 历史，不纳入本仓库管理。

## 给上游提 PR

如果某个改动对上游也有价值，从 `custom` 里挑出来单独提：

```bash
git fetch upstream
git checkout -b fix/xxx upstream/main
git cherry-pick <sha>            # 从 custom 挑出对应提交
git push origin fix/xxx
```

然后在 GitHub 上向 `libnoname/noname` 发起 PR。

## 仓库体积与推送限制

本仓库约 2.52 GiB（含上游全部历史与游戏资源），从零重建远程仓库时有两个限制要处理。

**单次 push 的 pack 上限是 2 GiB**，一次性推送会直接失败：

```
remote: fatal: pack exceeds maximum allowed size (2.00 GiB)
```

解法是从旧到新分批推送——服务器收到前一段的对象后，后一段只需传增量，每批的 pack 都远低于上限：

```bash
N=$(git rev-list --count main)
for p in 25 50 75 100; do
  idx=$(( N * p / 100 ))
  sha=$(git rev-list --reverse main | sed -n "${idx}p")
  git push origin "$sha:refs/heads/main"
done
```

中途某段失败只需重跑该段，服务器上已推成功的那部分对象会保留，不会白传。

**`noname-server.exe` 约 67 MB**，超过 GitHub 建议的 50 MB，但低于 100 MB 的硬限制。推送时会收到 `GH001: Large files detected` 警告，属于正常现象，忽略即可——上游仓库同样如此，也没有使用 LFS。
